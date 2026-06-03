import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'

const ddb = new DynamoDBClient({})
const log = {
  error: (msg, ctx = {}) => console.log(JSON.stringify({ level: 'ERROR', message: msg, ...ctx })),
}

export const handler = async (event) => {
  const { certCode } = event

  try {
    const res = await ddb.send(new GetItemCommand({
      TableName: process.env.EXAM_GUIDES_TABLE,
      Key: { pk: { S: certCode } },
    }))

    if (!res.Item) return { examGuide: null }

    const examGuide = res.Item.examGuide
      ? JSON.parse(res.Item.examGuide.S)
      : { domains: JSON.parse(res.Item.domains?.S || '[]') }

    return { examGuide }
  } catch (e) {
    log.error('Fetch docs error', { error: e.message, stack: e.stack })
    return { examGuide: null }
  }
}
