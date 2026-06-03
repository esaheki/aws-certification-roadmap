import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'
import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { randomUUID } from 'crypto'

const lambdaClient = new LambdaClient({})
const ddb = new DynamoDBClient({})
const ALLOWED_ORIGINS = new Set(['https://esaheki.com', 'http://localhost:5173'])
const RATE_LIMIT_SECONDS = 300 // 5 minutes between analyses per user
const log = {
  warn:  (msg, ctx = {}) => console.log(JSON.stringify({ level: 'WARN',  message: msg, ...ctx })),
  error: (msg, ctx = {}) => console.log(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
}

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  if (event.httpMethod === 'OPTIONS') return cors(200, '', origin)

  try {
    const body = JSON.parse(event.body || '{}')
    const { kmap, certNames, total, role } = body
    if (!kmap) return cors(400, { error: 'Missing kmap' }, origin)

    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub || 'anonymous'

    // Rate limit: reject if this user ran an analysis less than 5 minutes ago
    if (userId !== 'anonymous' && process.env.PROFILES_TABLE) {
      const profile = await ddb.send(new GetItemCommand({
        TableName: process.env.PROFILES_TABLE,
        Key: { pk: { S: userId } },
        ProjectionExpression: 'lastAnalysisAt',
      }))
      const lastAt = profile.Item?.lastAnalysisAt?.S
      if (lastAt) {
        const secondsSince = (Date.now() - new Date(lastAt).getTime()) / 1000
        if (secondsSince < RATE_LIMIT_SECONDS) {
          const retryAfter = Math.ceil(RATE_LIMIT_SECONDS - secondsSince)
          return cors(429, { error: `Rate limit exceeded. Try again in ${retryAfter}s.` }, origin)
        }
      }
    }

    // Generate execution ID locally (no longer derived from Step Functions ARN)
    const executionId = randomUUID()
    const ttl = Math.floor(Date.now() / 1000) + 86400

    // Write the initial execution record before starting the orchestrator so
    // the polling endpoint always finds a record, even on fast polls.
    await ddb.send(new PutItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Item: {
        pk:          { S: executionId },
        userId:      { S: userId },
        status:      { S: 'RUNNING' },
        currentStep: { S: 'Starting...' },
        ttl:         { N: ttl.toString() },
      },
    }))

    // Fire the durable orchestrator asynchronously. The alias ARN is a qualified
    // ARN (required by the durable execution runtime).
    await lambdaClient.send(new InvokeCommand({
      FunctionName:   process.env.ORCHESTRATOR_FN,  // alias ARN — already qualified
      InvocationType: 'Event',                       // fire-and-forget
      Payload: JSON.stringify({ executionId, userId, kmap, certNames: certNames || [], total: total || 0, role: role || null }),
    }))

    // Stamp the time so the rate limit check works on the next request
    if (userId !== 'anonymous' && process.env.PROFILES_TABLE) {
      await ddb.send(new UpdateItemCommand({
        TableName: process.env.PROFILES_TABLE,
        Key: { pk: { S: userId } },
        UpdateExpression: 'SET lastAnalysisAt = :t',
        ExpressionAttributeValues: { ':t': { S: new Date().toISOString() } },
      })).catch(e => log.warn('Failed to stamp lastAnalysisAt', { error: e.message }))
    }

    return cors(200, { executionId }, origin)
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
