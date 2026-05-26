import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  const { executionId, certCode } = event

  if (executionId && process.env.EXECUTIONS_TABLE) {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET currentStep = :step',
      ExpressionAttributeValues: { ':step': { S: 'Fetching official AWS exam guide...' } },
    })).catch(e => console.warn('Step update failed:', e.message))
  }

  try {
    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.EXAM_GUIDES_TABLE,
      Key: { pk: { S: certCode } },
    }))

    if (!res.Item) return { ...event, domains: [] }

    return { ...event, domains: JSON.parse(res.Item.domains.S) }
  } catch (e) {
    console.error('Fetch docs error:', e)
    return { ...event, domains: [] }
  }
}
