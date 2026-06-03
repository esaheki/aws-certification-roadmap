import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const ddb = new DynamoDBClient({})
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
const log = {
  info:  (msg, ctx = {}) => console.log(JSON.stringify({ level: 'INFO',  message: msg, ...ctx })),
  error: (msg, ctx = {}) => console.log(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
}

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

  const content = pages.join('\n\n---\n\n').slice(0, 28000)

  const bedrockRes = await bedrock.send(new ConverseCommand({
    modelId: MODEL,
    messages: [{
      role: 'user',
      content: [{ text: `You are extracting structured data from an official AWS certification exam guide.

Return ONLY a JSON object with this exact shape — no markdown, no commentary:
{
  "domains": [
    {
      "domain": "Domain name",
      "weight": "XX%",
      "taskStatements": ["Task statement 1", "Task statement 2"]
    }
  ],
  "inScopeServices": ["Service 1", "Service 2"],
  "outOfScopeServices": ["Service A", "Service B"],
  "targetCandidate": "One paragraph describing the recommended candidate background and experience",
  "recommendedKnowledge": ["Knowledge area 1", "Knowledge area 2"],
  "examOverview": "2-3 sentences summarising what this certification validates"
}

Rules:
- domains: extract every domain with its percentage weight and all task statements listed under it
- inScopeServices: list every AWS service/feature explicitly mentioned as in-scope (usually in an appendix)
- outOfScopeServices: list services explicitly called out as out-of-scope (may be empty [])
- targetCandidate: summarise the target candidate description (role, years of experience, background)
- recommendedKnowledge: bullet list of specific knowledge areas or skills the guide recommends
- examOverview: your own concise summary of what the exam tests

<examguide>
${content}
</examguide>` }],
    }],
    inferenceConfig: { maxTokens: 3000 },
  }))

  const text = bedrockRes.output.message.content[0].text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in extraction response`)
  const examGuide = JSON.parse(jsonMatch[0])

  const usage = bedrockRes.usage ?? {}
  log.info('Bedrock usage', {
    fn: 'populate', model: MODEL, certCode,
    inputTokens:  usage.inputTokens  ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  })

  return { examGuide, pageCount: pages.length }
}

const CONCURRENCY = 3

async function fetchAndSave(certCode, landingUrl, ttl, fetchedAt) {
  const { examGuide, pageCount } = await processCert(certCode, landingUrl)
  await ddb.send(new PutItemCommand({
    TableName: process.env.EXAM_GUIDES_TABLE,
    Item: {
      pk:        { S: certCode },
      examGuide: { S: JSON.stringify(examGuide) },
      domains:   { S: JSON.stringify(examGuide.domains) },
      pageCount: { N: pageCount.toString() },
      fetchedAt: { S: fetchedAt },
      ttl:       { N: ttl.toString() },
    },
  }))
  return { certCode, pageCount, domains: examGuide.domains.length, services: examGuide.inScopeServices?.length ?? 0 }
}

export const handler = async () => {
  const ttl = Math.floor(Date.now() / 1000) + 45 * 24 * 3600
  const fetchedAt = new Date().toISOString()
  const entries = Object.entries(CERT_LANDING_PAGES)

  const succeeded = []
  const failedCerts = []

  for (let i = 0; i < entries.length; i += CONCURRENCY) {
    const chunk = entries.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      chunk.map(([certCode, landingUrl]) => fetchAndSave(certCode, landingUrl, ttl, fetchedAt))
    )
    results.forEach((result, j) => {
      const certCode = chunk[j][0]
      if (result.status === 'fulfilled') {
        succeeded.push(result.value)
        log.info('Exam guide populated', result.value)
      } else {
        failedCerts.push(certCode)
        log.error('Exam guide failed', { certCode, error: result.reason?.message })
      }
    })
  }

  log.info('Exam guide refresh complete', {
    total: entries.length,
    succeeded: succeeded.length,
    failed: failedCerts.length,
    failedCerts,
  })
}
