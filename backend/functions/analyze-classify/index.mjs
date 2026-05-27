import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const ddb = new DynamoDBClient({})
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

// AWS-recommended certification paths by role (based on AWS Certification Paths guide)
const ROLE_PATHS = {
  'cloud-architect':    { label: 'Cloud Architect',     path: ['CLF-C02', 'SAA-C03', 'SAP-C02'] },
  'developer':          { label: 'Developer',           path: ['CLF-C02', 'DVA-C02', 'DOP-C02'] },
  'devops':             { label: 'DevOps / CloudOps',   path: ['CLF-C02', 'SOA-C03', 'DVA-C02', 'DOP-C02'] },
  'data-engineer':      { label: 'Data Engineer',       path: ['CLF-C02', 'DEA-C01'] },
  'ml-engineer':        { label: 'ML / AI Engineer',    path: ['AIF-C01', 'MLA-C01'] },
  'security':           { label: 'Security Engineer',   path: ['CLF-C02', 'SAA-C03', 'SCS-C02'] },
  'networking':         { label: 'Network Engineer',    path: ['CLF-C02', 'SAA-C03', 'ANS-C01'] },
  'generative-ai':      { label: 'GenAI Developer',     path: ['AIF-C01', 'MLA-C01', 'AIP-C01'] },
  'cloud-practitioner': { label: 'Cloud Generalist',    path: ['CLF-C02', 'SAA-C03'] },
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
  const { executionId, kmap, certNames, total, role } = event

  const updateStep = async (step) => {
    if (!executionId || !process.env.EXECUTIONS_TABLE) return
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET currentStep = :step',
      ExpressionAttributeValues: { ':step': { S: step } },
    })).catch(e => console.warn('Step update failed:', e.message))
  }

  await updateStep('Analyzing your AWS knowledge map...')

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
    ? `- Target role: ${ROLE_PATHS[role].label}
- AWS-recommended cert path for this role: ${ROLE_PATHS[role].path.join(' → ')}
- Prioritize the NEXT uncompleted cert in this path unless knowledge level suggests otherwise.`
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

  await updateStep('Certification path identified...')
  return { ...event, certCode }
}
