import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})
const ALLOWED_ORIGINS = new Set(['https://esaheki.com', 'http://localhost:5173'])
const log = {
  error: (msg, ctx = {}) => console.log(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
}

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  if (event.httpMethod === 'OPTIONS') return cors(200, '', origin)

  try {
    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub
    if (!userId) return cors(401, { error: 'Unauthorized' }, origin)

    const { kmap, owned, role, analysis, analysisInputHash } = JSON.parse(event.body || '{}')

    const item = {
      pk:        { S: userId },
      kmap:      { S: JSON.stringify(kmap  || {}) },
      owned:     { S: JSON.stringify(owned || []) },
      updatedAt: { S: new Date().toISOString() },
    }
    if (role)               item.role               = { S: role }
    if (analysis)           item.analysis           = { S: JSON.stringify(analysis) }
    if (analysisInputHash)  item.analysisInputHash  = { S: analysisInputHash }

    await ddb.send(new PutItemCommand({
      TableName: process.env.PROFILES_TABLE,
      Item: item,
    }))

    return cors(200, { ok: true }, origin)
  } catch (e) {
    log.error(e.message, { stack: e.stack })
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
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Vary': 'Origin',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
