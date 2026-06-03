import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'
const log = {
  info:  (msg, ctx = {}) => console.log(JSON.stringify({ level: 'INFO',  message: msg, ...ctx })),
  error: (msg, ctx = {}) => console.log(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
}

// AWS-recommended certification paths by role (source: AWS Certification Paths guide 2025)
// aiRecommended: certs AWS suggests alongside the main path for AI literacy
const ROLE_PATHS = {
  'cloud-architect':    { label: 'Cloud Architect',     path: ['CLF-C02', 'SAA-C03', 'SAP-C02'],              aiRecommended: ['AIF-C01'] },
  'developer':          { label: 'Developer',           path: ['CLF-C02', 'DVA-C02', 'DOP-C02'],              aiRecommended: ['AIF-C01'] },
  'devops':             { label: 'DevOps / CloudOps',   path: ['CLF-C02', 'SOA-C03', 'DVA-C02', 'DOP-C02'],  aiRecommended: ['MLA-C01'] },
  'data-engineer':      { label: 'Data Engineer',       path: ['CLF-C02', 'DEA-C01'],                         aiRecommended: ['AIF-C01', 'MLA-C01'] },
  'ml-engineer':        { label: 'ML / AI Engineer',    path: ['AIF-C01', 'MLA-C01'],                         aiRecommended: [] },
  'security':           { label: 'Security Engineer',   path: ['CLF-C02', 'SAA-C03', 'SCS-C02'],              aiRecommended: ['AIF-C01'] },
  'networking':         { label: 'Network Engineer',    path: ['CLF-C02', 'SAA-C03', 'ANS-C01'],              aiRecommended: [] },
  'generative-ai':      { label: 'GenAI Developer',     path: ['AIF-C01', 'MLA-C01', 'AIP-C01'],             aiRecommended: [] },
  'cloud-practitioner': { label: 'Cloud Generalist',    path: ['CLF-C02', 'SAA-C03'],                         aiRecommended: ['AIF-C01'] },
}

const CERTS = [
  { code: 'CLF-C02', name: 'Cloud Practitioner',         level: 'Foundational' },
  { code: 'AIF-C01', name: 'AI Practitioner',            level: 'Foundational' },
  { code: 'SAA-C03', name: 'Solutions Architect',         level: 'Associate'    },
  { code: 'DVA-C02', name: 'Developer',                   level: 'Associate'    },
  { code: 'SOA-C03', name: 'CloudOps Engineer',           level: 'Associate'    },
  { code: 'DEA-C01', name: 'Data Engineer',               level: 'Associate'    },
  { code: 'MLA-C01', name: 'Machine Learning Engineer',   level: 'Associate'    },
  { code: 'SAP-C02', name: 'Solutions Architect Pro',     level: 'Professional' },
  { code: 'DOP-C02', name: 'DevOps Engineer Pro',         level: 'Professional' },
  { code: 'AIP-C01', name: 'Generative AI Developer Pro', level: 'Professional' },
  { code: 'ANS-C01', name: 'Advanced Networking',         level: 'Specialty'    },
  { code: 'SCS-C02', name: 'Security',                    level: 'Specialty'    },
]

export const handler = async (event) => {
  const { kmap, certNames, total, role } = event

  const kStr = Object.entries(kmap)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${['None','Basic','Intermediate','Advanced'][v]}`)
    .join(', ') || 'No services marked yet'

  const cStr = (certNames || []).length ? certNames.join(', ') : 'None'

  const heldCodes = new Set(
    CERTS.filter(c => (certNames || []).some(n => n.includes(c.name))).map(c => c.code)
  )

  const certList = CERTS
    .filter(c => !heldCodes.has(c.code))
    .map(c => `  ${c.code} — ${c.name} (${c.level})`)
    .join('\n')

  const roleInfo = role && ROLE_PATHS[role]
    ? (() => {
        const rp = ROLE_PATHS[role]
        const aiLine = rp.aiRecommended.length
          ? `- AWS also recommends ${rp.aiRecommended.join(' or ')} alongside this path for AI literacy.`
          : ''
        return `- Target role: ${rp.label}
- AWS-recommended cert path for this role: ${rp.path.join(' → ')}
${aiLine}
- Prioritize the NEXT uncompleted cert in this path. If the learner already holds all path certs, suggest an AI-recommended cert or the most relevant specialty.`
      })()
    : '- No specific role selected — use knowledge level and held certs to decide.'

  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL,
    messages: [{
      role: 'user',
      content: [{ text: `You are an AWS certification advisor. Choose the single best next certification for this learner.

Available certifications (you MUST pick one of these exact codes):
${certList}

Learner profile:
- AWS services knowledge (${total} services marked): ${kStr}
- Certifications already held: ${cStr || 'None'}
${roleInfo}

Rules:
- If the learner has fewer than 5 services marked or low overall knowledge, prefer Foundational.
- If they hold no certs and have moderate knowledge, prefer Associate.
- Never suggest a cert they already hold.
- When a role path is provided, strongly prefer the next cert in that path.
- Pick the cert that best matches their current skill level and knowledge gaps.

Return ONLY JSON: {"certCode":"CHOSEN-CODE"}` }],
    }],
    inferenceConfig: { maxTokens: 50 },
  }))

  const text = res.output.message.content[0].text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in classify response: ${text}`)
  const { certCode } = JSON.parse(jsonMatch[0])

  const usage = res.usage ?? {}
  log.info('Bedrock usage', {
    fn: 'classify', model: MODEL, certCode,
    inputTokens:  usage.inputTokens  ?? 0,
    outputTokens: usage.outputTokens ?? 0,
  })

  return { certCode }
}
