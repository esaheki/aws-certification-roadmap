import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsResponse(200, '')

  try {
    const executionId = event.pathParameters?.executionId
    if (!executionId) return corsResponse(400, { error: 'Missing executionId' })

    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub

    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
    }))

    if (!res.Item) return corsResponse(404, { error: 'Execution not found' })

    if (userId && res.Item.userId?.S !== userId) {
      return corsResponse(403, { error: 'Forbidden' })
    }

    const item = res.Item
    return corsResponse(200, {
      status:      item.status?.S      || 'RUNNING',
      currentStep: item.currentStep?.S || 'Processing...',
      result:      item.result?.S      ? JSON.parse(item.result.S) : null,
      error:       item.error?.S       || null,
    })
  } catch (e) {
    console.error(e)
    return corsResponse(500, { error: 'Internal server error' })
  }
}

function corsResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
