import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const ddb = new DynamoDBClient({})
const MODEL = 'us.anthropic.claude-sonnet-4-6'

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

export const handler = async (event) => {
  const { executionId, kmap, certNames, certCode, examGuide, role } = event
  const enriched = examGuide && Array.isArray(examGuide.domains) && examGuide.domains.length > 0

  const updateStep = async (step) => {
    if (!executionId || !process.env.EXECUTIONS_TABLE) return
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET currentStep = :step',
      ExpressionAttributeValues: { ':step': { S: step } },
    })).catch(e => console.warn('Step update failed:', e.message))
  }

  await updateStep('Generating your personalized roadmap...')

  const kStr = Object.entries(kmap)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${['None','Basic','Intermediate','Advanced'][v]}`)
    .join(', ') || 'No services marked yet'

  const cStr = (certNames || []).length ? certNames.join(', ') : 'None'

  const roleCtx = role && ROLE_PATHS[role]
    ? (() => {
        const rp = ROLE_PATHS[role]
        const aiLine = rp.aiRecommended.length
          ? ` AWS also recommends ${rp.aiRecommended.join(' and ')} for AI literacy in this role.`
          : ''
        return `\n\nLearner's target role: ${rp.label}\nAWS certification path for this role: ${rp.path.join(' → ')}.${aiLine}\nTailor the roadmap, projects, and gap analysis to skills needed for this role.`
      })()
    : ''

  const systemText = enriched
    ? `You are a senior AWS certification advisor. Ground your analysis in the official exam guide content below.${roleCtx}

Official exam guide for ${certCode}:
- Overview: ${examGuide.examOverview || ''}
- Target candidate: ${examGuide.targetCandidate || ''}
- Recommended knowledge: ${(examGuide.recommendedKnowledge || []).join('; ')}
- Domains: ${JSON.stringify(examGuide.domains, null, 2)}
- In-scope services: ${(examGuide.inScopeServices || []).join(', ')}
- Out-of-scope services: ${(examGuide.outOfScopeServices || []).join(', ')}

Use this to make gap analysis, roadmap, and project suggestions highly specific to what this exam actually tests. Return ONLY JSON matching the exact shape requested.`
    : `You are a senior AWS certification advisor.${roleCtx} Return ONLY JSON matching the exact shape requested.`

  const userText = `Learner profile:
- AWS services knowledge: ${kStr}
- Certifications held: ${cStr}

Return this exact JSON shape with NO markdown or commentary:
{
  "rec":{ "cert":"full cert name","code":"${certCode}","level":"Foundational|Associate|Professional|Specialty","why":"2 concise sentences explaining why","readiness":72,"timeline":"8-10 weeks" },
  "gaps":[{ "name":"service","priority":"High|Med","why":"short reason" }],
  "roadmap":[{ "phase":1,"title":"short phase title","weeks":"2-3 wk","topics":["topic1","topic2","topic3"],"goal":"what learner can do after" }],
  "projects":[{ "name":"title","diff":"Beginner|Intermediate|Advanced","svcs":["SVC1","SVC2"],"desc":"2 sentence description","time":"4-6h" }],
  "examDomains":${enriched ? JSON.stringify(examGuide.domains.map(d => ({ domain: d.domain, weight: d.weight }))) : '[]'},
  "metadata":{ "enriched":${enriched},"certCode":"${certCode}" }
}

Provide 3-5 gaps, 3-5 roadmap phases, and 3 projects.`

  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL,
    system: [{ text: systemText }],
    messages: [{ role: 'user', content: [{ text: userText }] }],
    inferenceConfig: { maxTokens: 4096 },
  }))

  const text = res.output.message.content[0].text.trim()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in final response: ${text.slice(0, 200)}`)
  await updateStep('Almost there...')
  return JSON.parse(jsonMatch[0])
}
