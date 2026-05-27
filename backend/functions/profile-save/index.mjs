import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(200, '')

  try {
    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub
    if (!userId) return cors(401, { error: 'Unauthorized' })

    const { kmap, owned, role } = JSON.parse(event.body || '{}')

    const item = {
      pk:        { S: userId },
      kmap:      { S: JSON.stringify(kmap  || {}) },
      owned:     { S: JSON.stringify(owned || []) },
      updatedAt: { S: new Date().toISOString() },
    }
    if (role) item.role = { S: role }

    await ddb.send(new PutItemCommand({
      TableName: process.env.PROFILES_TABLE,
      Item: item,
    }))

    return cors(200, { ok: true })
  } catch (e) {
    console.error(e)
    return cors(500, { error: 'Internal server error' })
  }
}

function cors(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
