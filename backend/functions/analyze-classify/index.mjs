import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const bedrock = new BedrockRuntimeClient({ region: 'us-east-1' })
const ddb = new DynamoDBClient({})
const MODEL = 'us.anthropic.claude-haiku-4-5-20251001-v1:0'

export const handler = async (event) => {
  const { executionId, kmap, certNames, total } = event

  if (executionId && process.env.EXECUTIONS_TABLE) {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET currentStep = :step',
      ExpressionAttributeValues: { ':step': { S: 'Identifying your certification path...' } },
    })).catch(e => console.warn('Step update failed:', e.message))
  }

  const kStr = Object.entries(kmap)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${['None','Basic','Intermediate','Advanced'][v]}`)
    .join(', ') || 'No services marked yet'

  const cStr = (certNames || []).length ? certNames.join(', ') : 'None'

  const res = await bedrock.send(new ConverseCommand({
    modelId: MODEL,
    messages: [{
      role: 'user',
      content: [{ text: `Given this AWS learner profile, return ONLY JSON: {"certCode":"SAA-C03"}

Profile:
- Services: ${kStr}
- Certs held: ${cStr}
- Total services: ${total}

Return the AWS exam code for the single best next certification.` }],
    }],
    inferenceConfig: { maxTokens: 50 },
  }))

  const text = res.output.message.content[0].text.trim()
  const { certCode } = JSON.parse(text.replace(/```json\n?|```/g, '').trim())

  return { ...event, certCode }
}
