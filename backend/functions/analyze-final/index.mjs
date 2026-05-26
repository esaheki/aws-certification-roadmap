import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const ddb = new DynamoDBClient({})
const MODEL = 'us.anthropic.claude-sonnet-4-6-20251101-v1:0'

export const handler = async (event) => {
  const { executionId, kmap, certNames, certCode, domains } = event
  const enriched = Array.isArray(domains) && domains.length > 0

  if (executionId && process.env.EXECUTIONS_TABLE) {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET currentStep = :step',
      ExpressionAttributeValues: { ':step': { S: 'Building your personalized roadmap...' } },
    })).catch(e => console.warn('Step update failed:', e.message))
  }

  const kStr = Object.entries(kmap)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${['None','Basic','Intermediate','Advanced'][v]}`)
    .join(', ') || 'No services marked yet'

  const cStr = (certNames || []).length ? certNames.join(', ') : 'None'

  const systemText = enriched
    ? `You are a senior AWS certification advisor. Ground your analysis in the official exam domains below.\n\nOfficial exam domains for ${certCode}:\n${JSON.stringify(domains, null, 2)}\n\nReturn ONLY JSON matching the exact shape requested.`
    : `You are a senior AWS certification advisor. Return ONLY JSON matching the exact shape requested.`

  const userText = `Learner profile:
- AWS services knowledge: ${kStr}
- Certifications held: ${cStr}

Return this exact JSON shape with NO markdown or commentary:
{
  "rec":{ "cert":"full cert name","code":"${certCode}","level":"Foundational|Associate|Professional|Specialty","why":"2 concise sentences explaining why","readiness":72,"timeline":"8-10 weeks" },
  "gaps":[{ "name":"service","priority":"High|Med","why":"short reason" }],
  "roadmap":[{ "phase":1,"title":"short phase title","weeks":"2-3 wk","topics":["topic1","topic2","topic3"],"goal":"what learner can do after" }],
  "projects":[{ "name":"title","diff":"Beginner|Intermediate|Advanced","svcs":["SVC1","SVC2"],"desc":"2 sentence description","time":"4-6h" }],
  "examDomains":${enriched ? JSON.stringify(domains.map(d => ({ domain: d.domain, weight: d.weight }))) : '[]'},
  "metadata":{ "enriched":${enriched},"certCode":"${certCode}" }
}

Provide 3-5 gaps, 3-5 roadmap phases, and 3 projects.`

  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL,
    system: [{ text: systemText }],
    messages: [{ role: 'user', content: [{ text: userText }] }],
    inferenceConfig: { maxTokens: 2000 },
  }))

  const text = res.output.message.content[0].text.trim()
  return JSON.parse(text.replace(/```json\n?|```/g, '').trim())
}
