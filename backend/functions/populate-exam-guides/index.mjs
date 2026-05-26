import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const ddb = new DynamoDBClient({})
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

const CERT_LANDING_PAGES = {
  'AIF-C01': 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html',
  'CLF-C02': 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html',
  'SAA-C03': 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html',
  'DVA-C02': 'https://docs.aws.amazon.com/aws-certification/latest/developer-associate-02/developer-associate-02.html',
  'DEA-C01': 'https://docs.aws.amazon.com/aws-certification/latest/data-engineer-associate-01/data-engineer-associate-01.html',
  'SOA-C03': 'https://docs.aws.amazon.com/aws-certification/latest/sysops-administrator-associate-03/sysops-administrator-associate-03.html',
  'MLA-C01': 'https://docs.aws.amazon.com/aws-certification/latest/machine-learning-engineer-associate-01/machine-learning-engineer-associate-01.html',
  'SAP-C02': 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-professional-02/solutions-architect-professional-02.html',
  'DOP-C02': 'https://docs.aws.amazon.com/aws-certification/latest/devops-engineer-professional-02/devops-engineer-professional-02.html',
  'AIP-C01': 'https://docs.aws.amazon.com/aws-certification/latest/ai-professional-01/ai-professional-01.html',
  'ANS-C01': 'https://docs.aws.amazon.com/aws-certification/latest/advanced-networking-specialty-01/advanced-networking-specialty-01.html',
  'SCS-C02': 'https://docs.aws.amazon.com/aws-certification/latest/security-specialty-03/security-specialty-03.html',
}

async function fetchWithTimeout(url, ms = 10000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(id)
    return res
  } catch (e) {
    clearTimeout(id)
    throw e
  }
}

async function processCert(certCode, landingUrl) {
  const baseUrl = landingUrl.replace(/[^/]+\.html$/, '')

  const htmlRes = await fetchWithTimeout(landingUrl)
  if (!htmlRes.ok) throw new Error(`Landing page ${htmlRes.status}`)
  const html = await htmlRes.text()

  const subLinks = new Set()
  const linkRe = /href="(\.\/[^"]+\.html)"/g
  let m
  while ((m = linkRe.exec(html)) !== null) subLinks.add(m[1])

  const mdUrls = [...subLinks].map(l => baseUrl + l.replace(/^\.\//, '').replace(/\.html$/, '.md'))
  mdUrls.push(landingUrl.replace(/\.html$/, '.md'))

  const settled = await Promise.allSettled(
    mdUrls.map(url => fetchWithTimeout(url).then(r => r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))))
  )

  const pages = settled.filter(r => r.status === 'fulfilled').map(r => r.value)
  if (pages.length === 0) throw new Error('No pages fetched')

  const content = pages.join('\n\n---\n\n').slice(0, 16000)

  const bedrockRes = await bedrock.send(new ConverseCommand({
    modelId: MODEL,
    messages: [{
      role: 'user',
      content: [{ text: `Extract the exam domain table from this AWS certification exam guide content.
Return ONLY JSON:
{"domains":[{"domain":"string","weight":"XX%","taskStatements":["string"]}]}
The content spans multiple pages — find the domain/weight breakdown wherever it appears.
Omit all other content.

<examguide>
${content}
</examguide>` }],
    }],
    inferenceConfig: { maxTokens: 1000 },
  }))

  const text = bedrockRes.output.message.content[0].text.trim()
  const { domains } = JSON.parse(text.replace(/```json\n?|```/g, '').trim())
  return { domains, pageCount: pages.length }
}

export const handler = async () => {
  const ttl = Math.floor(Date.now() / 1000) + 45 * 24 * 3600
  const fetchedAt = new Date().toISOString()

  for (const [certCode, landingUrl] of Object.entries(CERT_LANDING_PAGES)) {
    try {
      const { domains, pageCount } = await processCert(certCode, landingUrl)
      await ddb.send(new PutItemCommand({
        TableName: process.env.EXAM_GUIDES_TABLE,
        Item: {
          pk:        { S: certCode },
          domains:   { S: JSON.stringify(domains) },
          pageCount: { N: pageCount.toString() },
          fetchedAt: { S: fetchedAt },
          ttl:       { N: ttl.toString() },
        },
      }))
      console.log(`✓ ${certCode}: ${pageCount} pages, ${domains.length} domains`)
    } catch (e) {
      console.error(`✗ ${certCode}: ${e.message}`)
    }
  }
}
