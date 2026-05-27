import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const sfn = new SFNClient({})
const ddb = new DynamoDBClient({})
const ALLOWED_ORIGINS = new Set(['https://esaheki.com', 'http://localhost:5173'])

export const handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin || ''
  if (event.httpMethod === 'OPTIONS') return cors(200, '', origin)

  try {
    const body = JSON.parse(event.body || '{}')
    const { kmap, certNames, total, role } = body
    if (!kmap) return cors(400, { error: 'Missing kmap' }, origin)

    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub || 'anonymous'

    const { executionArn } = await sfn.send(new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      input: JSON.stringify({ userId, kmap, certNames: certNames || [], total: total || 0, role: role || null }),
    }))

    const executionId = executionArn.split(':').pop()
    const ttl = Math.floor(Date.now() / 1000) + 86400

    await ddb.send(new PutItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Item: {
        pk:          { S: executionId },
        executionArn:{ S: executionArn },
        userId:      { S: userId },
        status:      { S: 'RUNNING' },
        currentStep: { S: 'Starting...' },
        ttl:         { N: ttl.toString() },
      },
    }))

    return cors(200, { executionId }, origin)
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
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Vary': 'Origin',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
