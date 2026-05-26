/**
 * Anthropic API helper
 *
 * ⚠️  PRODUCTION TODO (Claude Code task):
 *   This currently calls Anthropic directly from the browser using an env var.
 *   Before deploying to production, replace callAnthropic() with a call to your
 *   API Gateway endpoint that proxies to a Lambda function holding the real key.
 *
 *   Target endpoint: POST ${import.meta.env.VITE_API_BASE_URL}/analyze
 *   Lambda source:   backend/functions/analyze/index.mjs
 */

const MODEL = 'claude-sonnet-4-20250514'

/**
 * Build the analysis prompt from the user's profile.
 * @param {{ kmap: Record<string,number>, owned: string[], total: number }} profile
 * @returns {string}
 */
export function buildPrompt({ kmap, certNames, total }) {
  const kStr = Object.entries(kmap)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k}:${['None','Basic','Intermediate','Advanced'][v]}`)
    .join(', ') || 'No services marked yet'

  const cStr = certNames.length ? certNames.join(', ') : 'None'

  return `You are a senior AWS certification advisor. Analyze this learner and return ONLY a compact JSON object — no markdown, no backticks, no commentary.

Learner profile:
- AWS services knowledge: ${kStr}
- Certifications held: ${cStr}
- Total services with knowledge: ${total}

Return this exact JSON shape:
{
  "rec":{ "cert":"full name","code":"e.g. SAA-C03","level":"Foundational|Associate|Professional|Specialty","why":"2 concise sentences explaining why","readiness":72,"timeline":"8-10 weeks" },
  "gaps":[{ "name":"service","priority":"High|Med","why":"short reason" }],
  "roadmap":[{ "phase":1,"title":"short phase title","weeks":"2-3 wk","topics":["topic1","topic2","topic3"],"goal":"what learner can do after" }],
  "projects":[{ "name":"title","diff":"Beginner|Intermediate|Advanced","svcs":["SVC1","SVC2"],"desc":"2 sentence description","time":"4-6h" }]
}

Provide 3-5 gaps, 3-5 roadmap phases, and 3 projects.`
}

/**
 * Call the analysis endpoint.
 *
 * In development: calls Anthropic directly (requires VITE_ANTHROPIC_API_KEY).
 * In production:  swap the fetch target to VITE_API_BASE_URL + '/analyze'
 *                 and pass the Cognito JWT in the Authorization header.
 *
 * @param {string} prompt
 * @param {string} [idToken]  Cognito ID token for production API Gateway auth
 * @returns {Promise<object>} Parsed analysis object
 */
export async function callAnalysis(prompt, idToken) {
  const isProd = Boolean(import.meta.env.VITE_API_BASE_URL)

  if (isProd) {
    // ── Production: call your Lambda proxy ──────────────────────────────────
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Cognito JWT — API Gateway Cognito authorizer validates this
        ...(idToken && { Authorization: idToken }),
      },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) throw new Error(`API error ${res.status}`)
    return res.json()
  }

  // ── Development: direct Anthropic call ──────────────────────────────────
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('Set VITE_ANTHROPIC_API_KEY in .env.local for local dev')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)

  const raw = data.content.map(i => i.text || '').join('').replace(/```json\n?|```/g, '').trim()
  return JSON.parse(raw)
}
