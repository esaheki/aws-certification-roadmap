import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})
const ALLOWED_ORIGINS = new Set(['https://esaheki.com', 'http://localhost:5173'])

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  if (event.httpMethod === 'OPTIONS') return cors(200, '', origin)

  try {
    const executionId = event.pathParameters?.executionId
    if (!executionId) return cors(400, { error: 'Missing executionId' }, origin)

    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub

    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
    }))

    if (!res.Item) return cors(404, { error: 'Execution not found' }, origin)

    if (!userId || res.Item.userId?.S !== userId) {
      return cors(403, { error: 'Forbidden' }, origin)
    }

    const item = res.Item
    return cors(200, {
      status:      item.status?.S      || 'RUNNING',
      currentStep: item.currentStep?.S || 'Processing...',
      result:      item.result?.S      ? JSON.parse(item.result.S) : null,
      error:       item.error?.S       || null,
    }, origin)
  } catch (e) {
    console.error(e)
    return cors(500, { error: 'Internal server error' }, origin)
  }
}

function cors(statusCode, body, origin) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://esaheki.com',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
      'Vary': 'Origin',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
