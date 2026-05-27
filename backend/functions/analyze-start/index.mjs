import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn'
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'

const sfn = new SFNClient({})
const ddb = new DynamoDBClient({})

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return corsResponse(200, '')

  try {
    const body = JSON.parse(event.body || '{}')
    const { kmap, certNames, total, role } = body
    if (!kmap) return corsResponse(400, { error: 'Missing kmap' })

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

    return corsResponse(200, { executionId })
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
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
