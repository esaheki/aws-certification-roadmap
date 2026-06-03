import { withDurableExecution } from '@aws/durable-execution-sdk-js'
import { createRetryStrategy } from '@aws/durable-execution-sdk-js'
import { DynamoDBClient, UpdateItemCommand } from '@aws-sdk/client-dynamodb'
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda'

const ddb    = new DynamoDBClient({})
const lambda = new LambdaClient({})

// Invoke an activity Lambda and unwrap the response, throwing on function errors.
async function invokeActivity(functionName, payload) {
  const res = await lambda.send(new InvokeCommand({
    FunctionName: functionName,
    Payload: JSON.stringify(payload),
  }))
  const body = JSON.parse(Buffer.from(res.Payload).toString())
  if (res.FunctionError) throw new Error(body.errorMessage ?? 'Activity invocation failed')
  return body
}

// Non-fatal DynamoDB progress write — idempotent, acceptable to replay.
async function updateStep(executionId, step) {
  await ddb.send(new UpdateItemCommand({
    TableName: process.env.EXECUTIONS_TABLE,
    Key: { pk: { S: executionId } },
    UpdateExpression: 'SET currentStep = :step',
    ExpressionAttributeValues: { ':step': { S: step } },
  })).catch(() => {})
}

async function writeResult(executionId, status, result, errorMsg) {
  if (status === 'SUCCEEDED') {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET #s = :s, currentStep = :step, #r = :r',
      ExpressionAttributeNames: { '#s': 'status', '#r': 'result' },
      ExpressionAttributeValues: {
        ':s':    { S: 'SUCCEEDED' },
        ':step': { S: 'Analysis complete!' },
        ':r':    { S: JSON.stringify(result) },
      },
    }))
  } else {
    await ddb.send(new UpdateItemCommand({
      TableName: process.env.EXECUTIONS_TABLE,
      Key: { pk: { S: executionId } },
      UpdateExpression: 'SET #s = :s, currentStep = :step, #e = :e',
      ExpressionAttributeNames: { '#s': 'status', '#e': 'error' },
      ExpressionAttributeValues: {
        ':s':    { S: 'FAILED' },
        ':step': { S: 'Analysis failed. Please try again.' },
        ':e':    { S: errorMsg ?? 'Unknown error' },
      },
    }))
  }
}

const retryStrategy = createRetryStrategy({
  maxAttempts: 3,
  initialDelay: { seconds: 2 },
  backoffRate: 2.0,
})

export const handler = withDurableExecution(async (event, context) => {
  const { executionId, userId, kmap, certNames, total, role } = event

  try {
    // Step 1: classify
    await updateStep(executionId, 'Analyzing your AWS knowledge map...')
    const { certCode } = await context.step(
      'classify',
      async () => invokeActivity(process.env.CLASSIFY_FN, { kmap, certNames, total, role }),
      { retryStrategy },
    )

    // Step 2: fetch exam guide
    await updateStep(executionId, 'Loading official exam guide...')
    const { examGuide } = await context.step(
      'fetchDocs',
      async () => invokeActivity(process.env.FETCH_DOCS_FN, { certCode, kmap, certNames, total, role }),
      { retryStrategy },
    )

    // Step 3: final analysis
    await updateStep(executionId, 'Generating your personalized roadmap...')
    const result = await context.step(
      'final',
      async () => invokeActivity(process.env.FINAL_FN, { certCode, examGuide, kmap, certNames, total, role }),
      { retryStrategy },
    )

    await writeResult(executionId, 'SUCCEEDED', result)
    return result

  } catch (e) {
    await writeResult(executionId, 'FAILED', null, e.message)
    throw e
  }
})
