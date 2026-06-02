import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})
const ALLOWED_ORIGINS = new Set(['https://esaheki.com', 'http://localhost:5173'])

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  if (event.httpMethod === 'OPTIONS') return cors(200, '', origin)

  try {
    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub
    if (!userId) return cors(401, { error: 'Unauthorized' }, origin)

    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.PROFILES_TABLE,
      Key: { pk: { S: userId } },
    }))

    if (!res.Item) return cors(200, { kmap: {}, owned: [], role: null }, origin)

    return cors(200, {
      kmap:               res.Item.kmap               ? JSON.parse(res.Item.kmap.S)               : {},
      owned:              res.Item.owned              ? JSON.parse(res.Item.owned.S)              : [],
      role:               res.Item.role               ? res.Item.role.S                           : null,
      analysis:           res.Item.analysis           ? JSON.parse(res.Item.analysis.S)           : null,
      analysisInputHash:  res.Item.analysisInputHash  ? res.Item.analysisInputHash.S              : null,
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
