/**
 * Lambda function: POST /analyze
 *
 * Proxies analysis requests to the Anthropic API.
 * The API key lives ONLY in this Lambda's environment — never in the frontend.
 *
 * Expected event body: { prompt: string }
 * Authorization: Cognito ID token (validated by API Gateway Cognito authorizer)
 *
 * Environment variables (set in CDK stack):
 *   ANTHROPIC_API_KEY   - your Anthropic API key (stored in Secrets Manager)
 *
 * TODO (Claude Code task):
 *   1. Wire this Lambda to API Gateway in infrastructure/lib/certpath-stack.ts
 *   2. Add a Cognito authorizer to the API Gateway route
 *   3. Store ANTHROPIC_API_KEY in AWS Secrets Manager, reference it in CDK
 *   4. Optionally save the analysis result to DynamoDB keyed by user's Cognito sub
 */

const MODEL      = 'claude-sonnet-4-20250514'
const MAX_TOKENS = 1500

export const handler = async (event) => {
  // ── CORS pre-flight ──
  if (event.httpMethod === 'OPTIONS') {
    return corsResponse(200, '')
  }

  try {
    const { prompt } = JSON.parse(event.body || '{}')
    if (!prompt) return corsResponse(400, { error: 'Missing prompt' })

    // ── Extract Cognito user info (injected by API Gateway authorizer) ──
    const claims = event.requestContext?.authorizer?.claims || {}
    const userId = claims.sub  // Cognito user sub — use as DynamoDB key

    // ── Call Anthropic ──
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'x-api-key':       process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!anthropicRes.ok) {
      const err = await anthropicRes.text()
      console.error('Anthropic error:', err)
      return corsResponse(502, { error: 'Upstream API error' })
    }

    const data = await anthropicRes.json()
    const raw  = data.content.map(b => b.text || '').join('').replace(/```json\n?|```/g, '').trim()
    const analysis = JSON.parse(raw)

    // ── TODO: persist to DynamoDB ──
    // if (userId) {
    //   await ddb.put({ TableName: process.env.TABLE_NAME, Item: { pk: userId, analysis, updatedAt: Date.now() } }).promise()
    // }

    return corsResponse(200, analysis)

  } catch (e) {
    console.error('Handler error:', e)
    return corsResponse(500, { error: 'Internal server error' })
  }
}

function corsResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin':  '*',    // TODO: restrict to your CloudFront domain
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }
}
