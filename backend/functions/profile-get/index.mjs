import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return cors(200, '')

  try {
    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub
    if (!userId) return cors(401, { error: 'Unauthorized' })

    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.PROFILES_TABLE,
      Key: { pk: { S: userId } },
    }))

    if (!res.Item) return cors(200, { kmap: {}, owned: [], role: null })

    return cors(200, {
      kmap:  res.Item.kmap  ? JSON.parse(res.Item.kmap.S)  : {},
      owned: res.Item.owned ? JSON.parse(res.Item.owned.S) : [],
      role:  res.Item.role  ? res.Item.role.S              : null,
    })
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
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
