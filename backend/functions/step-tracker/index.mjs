import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  const detail = event.detail || {}
  const { status, executionArn, output, cause, error: errMsg } = detail

  if (!executionArn) return

  const executionId = executionArn.split(':').pop()

  if (status === 'SUCCEEDED') {
    const result = output ? JSON.parse(output) : null
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET #s = :status, currentStep = :step, #r = :result',
      ExpressionAttributeNames: { '#s': 'status', '#r': 'result' },
      ExpressionAttributeValues: {
        ':status': { S: 'SUCCEEDED' },
        ':step':   { S: 'Analysis complete!' },
        ':result': { S: JSON.stringify(result) },
      },
    }))
  } else if (status === 'FAILED' || status === 'TIMED_OUT' || status === 'ABORTED') {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET #s = :status, currentStep = :step, #e = :error',
      ExpressionAttributeNames: { '#s': 'status', '#e': 'error' },
      ExpressionAttributeValues: {
        ':status': { S: 'FAILED' },
        ':step':   { S: 'Analysis failed.' },
        ':error':  { S: cause || errMsg || 'Unknown error' },
      },
    }))
  }
}
