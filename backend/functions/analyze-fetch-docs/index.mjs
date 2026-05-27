import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  const { executionId, certCode } = event

  if (executionId && process.env.EXECUTIONS_TABLE) {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET currentStep = :step',
      ExpressionAttributeValues: { ':step': { S: 'Loading official exam guide...' } },
    })).catch(e => console.warn('Step update failed:', e.message))
  }

  try {
    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.EXAM_GUIDES_TABLE,
      Key: { pk: { S: certCode } },
    }))

    if (!res.Item) return { ...event, examGuide: null }

    const examGuide = res.Item.examGuide
      ? JSON.parse(res.Item.examGuide.S)
      : { domains: JSON.parse(res.Item.domains?.S || '[]') }

    return { ...event, examGuide }
  } catch (e) {
    console.error('Fetch docs error:', e)
    return { ...event, domains: [] }
  }
}
