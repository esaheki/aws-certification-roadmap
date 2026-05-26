# PLAN: AWS Exam Guide Enriched Analysis Pipeline

> Specification for replacing the single-Lambda Anthropic API call with a
> Step Functions–orchestrated, Bedrock-powered pipeline grounded in official
> AWS exam guide content.

---

## Context

The current `/analyze` Lambda makes a single Anthropic call with a static,
freeform prompt containing only the user's self-reported proficiency ratings
and owned certs. It has no grounding in official AWS content.

This plan replaces that with a **3-step Step Functions Standard Workflow**
using **Amazon Bedrock** (cross-region inference profiles) as the AI provider.
All AI calls use IAM authentication — no API keys or Secrets Manager required.

**Pipeline:**
1. Claude Haiku 4.5 (Bedrock) classifies the recommended cert
2. DynamoDB read returns the official exam guide domain JSON (pre-cached monthly
   from docs.aws.amazon.com, extracted by Haiku during the cron — no AI at runtime)
3. Claude Sonnet 4.6 (Bedrock) produces a roadmap grounded in official domain
   weights and task statements

**Frontend gains:**
- Real-time step-name progress UI during analysis
- New `examDomains` tab showing official AWS exam domains + weights

---

## What Changes and What Stays

### Unchanged
- `src/config/services.js` — service list
- `src/config/certifications.js` — cert list
- `src/components/KnowledgeMap.jsx`
- `src/components/Certifications.jsx`
- `src/lib/auth.js`, `src/hooks/useAuth.js`
- DynamoDB `certpath-profiles` table (user profiles)
- Cognito User Pool and auth flow

### Changed

| Area | What changes |
|---|---|
| `POST /analyze` | Now starts Step Functions execution; returns `{executionId}` |
| `GET /analyze/{executionId}` | New polling endpoint; returns `{status, currentStep, result}` |
| `backend/functions/analyze/index.mjs` | Replaced by `analyze-start` Lambda |
| `src/lib/anthropic.js` | Renamed to `src/lib/analysis.js`; new `startAnalysis()` + `pollAnalysis()` |
| `src/App.jsx` | Poll loop with sessionStorage resume |
| `src/components/Analysis.jsx` | Step-name progress + new `examDomains` tab |
| `infrastructure/lib/certpath-stack.ts` | 2 new DynamoDB tables, 7 new Lambdas, Step Functions SM, 2 EventBridge rules, remove Secrets Manager |

---

## New Backend Files

```
backend/functions/
  analyze-start/index.mjs          ← Starts SF execution; replaces old /analyze
  analyze-classify/index.mjs       ← Step 1: Haiku (Bedrock) → certCode
  analyze-fetch-docs/index.mjs     ← Step 2: DynamoDB GetItem → pre-extracted domains
  analyze-final/index.mjs          ← Step 3: Sonnet (Bedrock) → full analysis + examDomains
  analyze-status/index.mjs         ← GET /analyze/{executionId} polling handler
  step-tracker/index.mjs           ← EventBridge → writes currentStep to DynamoDB
  populate-exam-guides/index.mjs   ← Monthly cron: fetches .md + Haiku extract → DynamoDB
```

> The Haiku domain extraction happens **once per month** inside
> `populate-exam-guides`, not at analysis time. Runtime Step 2 is a plain
> DynamoDB read — no AI calls in the hot path beyond Step 1 (classify) and
> Step 3 (final).

---

## Step Functions State Machine

**Type:** Standard Workflow (async, no time-bound limit)
**Invocation:** POST /analyze → `analyze-start` Lambda calls `StartExecution` → returns `{executionId}`
**Progress:** Each state transition emits `ExecutionStateChange` → EventBridge rule → `step-tracker` Lambda → DynamoDB

### States

```
StartExecution
  → ClassifyCert (Lambda: analyze-classify)
      Input:  { userId, kmap, certNames, total }
      Output: { ...input, certCode: "SAA-C03" }

  → FetchDocs (Lambda: analyze-fetch-docs)
      Input:  { ...prev, certCode }
      Output: { ...prev, domains: [{domain, weight, taskStatements}] }  ← [] on cache miss

  → FinalAnalysis (Lambda: analyze-final)
      Input:  { userId, kmap, certNames, certCode, domains }
      Output: { rec, gaps, roadmap, projects, examDomains, metadata }
```

**Step-name progress shown to user:**

| State name | User-visible label |
|---|---|
| `ClassifyCert` | "Identifying your certification path..." |
| `FetchDocs` | "Fetching official AWS exam guide..." |
| `FinalAnalysis` | "Building your personalized roadmap..." |

**Failure handling:** Each Lambda uses a `Retry` policy (3 attempts, 2s backoff).
On terminal failure, `step-tracker` writes `status: "FAILED"` to DynamoDB;
the polling endpoint surfaces the error to the frontend.

---

## Lambda Responsibilities

### `analyze-start/index.mjs`
- POST from API Gateway (Cognito auth; `claims.sub` = userId)
- Validates `{ kmap, certNames, total }` in request body
- Calls `StartExecution` on the Step Functions ARN (env: `STATE_MACHINE_ARN`)
- Writes initial record to `certpath-executions`:
  `{ pk: executionId, userId, status: "RUNNING", currentStep: "Starting...", ttl: now+24h }`
- Returns `{ executionId }`

### `analyze-classify/index.mjs`
- `@aws-sdk/client-bedrock-runtime` `ConverseCommand`
- Model: `us.anthropic.claude-haiku-4-5-20251001-v1:0`
- Prompt: given kmap + owned certs → `{ certCode: "SAA-C03" }`
- `inferenceConfig.maxTokens: 50`
- IAM: `bedrock:InvokeModel` on execution role; no API key

### `analyze-fetch-docs/index.mjs`
- DynamoDB `GetItem` on `certpath-examguides`: `pk = certCode`
- Cache hit: returns pre-extracted `domains` JSON
- Cache miss: returns `domains: []` → Step 3 sets `metadata.enriched: false`

### `analyze-final/index.mjs`
- `@aws-sdk/client-bedrock-runtime` `ConverseCommand`
- Model: `us.anthropic.claude-sonnet-4-6-20251101-v1:0`
- System message: exam domain JSON (if non-empty) as grounding context
- User message: learner profile (kmap, owned certs, total)
- `inferenceConfig.maxTokens: 2000`
- IAM: `bedrock:InvokeModel` on execution role; no API key
- Returns:
  ```json
  {
    "rec": { "cert", "code", "level", "why", "readiness", "timeline" },
    "gaps": [{ "name", "priority", "why" }],
    "roadmap": [{ "phase", "title", "weeks", "topics", "goal" }],
    "projects": [{ "name", "diff", "svcs", "desc", "time" }],
    "examDomains": [{ "domain", "weight" }],
    "metadata": { "enriched": true|false, "certCode": "SAA-C03" }
  }
  ```

### `analyze-status/index.mjs`
- GET `/analyze/{executionId}` (Cognito auth required)
- DynamoDB `GetItem` on `certpath-executions`: `pk = executionId`
- Ownership check: `item.userId === claims.sub` → 403 if mismatch
- Returns `{ status, currentStep, result }` (result null until SUCCEEDED)

### `step-tracker/index.mjs`
- EventBridge trigger: `source = "aws.states"`, `detail-type = "Step Functions Execution Status Change"`
- Maps state names → human-readable strings (table above)
- On SUCCEEDED: writes result from event detail output to DynamoDB
- On FAILED: writes error message
- `dynamodb:UpdateItem` on `certpath-executions`

### `populate-exam-guides/index.mjs`
- EventBridge cron: `cron(0 0 1 * ? *)` (monthly, first of month)
- **Lambda timeout: 5 minutes (300s)** — needed for multi-page parallel fetching across 11 certs
- Hardcoded certCode → landing page URL map (HTML, not .md — used to discover sub-pages):
  ```js
  const CERT_LANDING_PAGES = {
    'AIF-C01': 'https://docs.aws.amazon.com/aws-certification/latest/ai-practitioner-01/ai-practitioner-01.html',
    'CLF-C02': 'https://docs.aws.amazon.com/aws-certification/latest/cloud-practitioner-02/cloud-practitioner-02.html',
    'SAA-C03': 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-associate-03/solutions-architect-associate-03.html',
    'DVA-C02': 'https://docs.aws.amazon.com/aws-certification/latest/developer-associate-02/developer-associate-02.html',
    'DEA-C01': 'https://docs.aws.amazon.com/aws-certification/latest/data-engineer-associate-01/data-engineer-associate-01.html',
    'SOA-C03': 'https://docs.aws.amazon.com/aws-certification/latest/sysops-administrator-associate-03/sysops-administrator-associate-03.html',
    'MLA-C01': 'https://docs.aws.amazon.com/aws-certification/latest/machine-learning-engineer-associate-01/machine-learning-engineer-associate-01.html',
    'SAP-C02': 'https://docs.aws.amazon.com/aws-certification/latest/solutions-architect-professional-02/solutions-architect-professional-02.html',
    'DOP-C02': 'https://docs.aws.amazon.com/aws-certification/latest/devops-engineer-professional-02/devops-engineer-professional-02.html',
    'AIP-C01': 'https://docs.aws.amazon.com/aws-certification/latest/ai-professional-01/ai-professional-01.html',
    'ANS-C01': 'https://docs.aws.amazon.com/aws-certification/latest/advanced-networking-specialty-01/advanced-networking-specialty-01.html',
    'SCS-C02': 'https://docs.aws.amazon.com/aws-certification/latest/security-specialty-03/security-specialty-03.html',
  }
  ```
- **Per-cert scraping flow:**
  1. Fetch the cert landing page HTML
  2. Parse `<a href>` links — keep only relative links that are sub-paths of the current cert
     (e.g. `./aws-certified-solutions-architect-associate/exam-overview.html`)
  3. Convert each link to its `.md` equivalent by replacing `.html` suffix with `.md`
     (AWS docs expose a markdown version of every page at the same path with `.md` extension)
  4. Fetch all sub-page `.md` URLs in parallel (`Promise.all`) with a per-request 10s timeout
  5. Also fetch the landing page itself as `.md` (it may contain the domain weight table directly)
  6. Concatenate all successfully fetched markdown, separated by `\n\n---\n\n`
  7. Truncate concatenated content to **16,000 characters** before passing to Haiku
     (preserves the domain/weight table which appears near the top of most guides)
- Call Haiku to extract domain JSON from concatenated content
- Store `{ pk: certCode, domains: JSON, pageCount: N, fetchedAt: ISO, ttl: now+45d }` in DynamoDB
- Per-page fetch failures are logged but skipped; cert is still stored if at least one page succeeded
- Per-cert failures don't abort the full 11-cert loop
- IAM: `bedrock:InvokeModel` (Haiku) + `dynamodb:PutItem` on examguides table

---

## DynamoDB Tables

### `certpath-examguides` (new)

| pk (String) | domains (String) | pageCount (Number) | fetchedAt (String) | ttl (Number) |
|---|---|---|---|---|
| `"SAA-C03"` | JSON array of domain objects | pages fetched | ISO timestamp | Unix, 45d TTL |

- PAY_PER_REQUEST, TTL on `ttl`, RemovalPolicy: DESTROY
- `pageCount` is informational only — useful for debugging scrape coverage

### `certpath-executions` (new)

| pk (String) | userId | status | currentStep | result | error | ttl |
|---|---|---|---|---|---|---|
| execution ID | Cognito sub | RUNNING/SUCCEEDED/FAILED | human label | JSON string | error msg | Unix, 24h TTL |

- PAY_PER_REQUEST, TTL on `ttl`, RemovalPolicy: DESTROY

---

## API Gateway Changes

| Method | Path | Lambda | Auth |
|---|---|---|---|
| POST | `/analyze` | `analyze-start` | Cognito |
| GET | `/analyze/{executionId}` | `analyze-status` | Cognito |

Old single-call Lambda route is replaced. CORS unchanged.

---

## CDK Infrastructure Changes (`infrastructure/lib/certpath-stack.ts`)

1. Add two new DynamoDB tables (`certpath-examguides`, `certpath-executions`)
2. Add 7 new Lambda functions (`nodejs20.x`, 256MB):
   - `populate-exam-guides`: **300s timeout** (multi-page parallel fetching across 11 certs)
   - All others: 30s timeout
3. Add Step Functions Standard state machine (3 states + retry policies)
4. Add EventBridge rule: SF execution state changes → `step-tracker`
5. Add EventBridge cron rule: monthly → `populate-exam-guides`
6. Replace old `/analyze` POST Lambda with `analyze-start`
7. Add GET `/analyze/{executionId}` → `analyze-status`
8. **Remove** `certpath/anthropic-api-key` Secrets Manager resource
9. IAM grants:
   - `analyze-start` → `states:StartExecution` + `dynamodb:PutItem` on executions table
   - `analyze-classify` → `bedrock:InvokeModel` (Haiku cross-region profile)
   - `analyze-fetch-docs` → `dynamodb:GetItem` on examguides table
   - `analyze-final` → `bedrock:InvokeModel` (Sonnet cross-region profile)
   - `analyze-status` → `dynamodb:GetItem` on executions table
   - `step-tracker` → `dynamodb:UpdateItem` on executions table
   - `populate-exam-guides` → `dynamodb:PutItem` on examguides table + `bedrock:InvokeModel` (Haiku)
   - State machine → `lambda:InvokeFunction` on classify, fetch-docs, final
10. Env vars (no API keys):
    - `analyze-start`: `STATE_MACHINE_ARN`, `EXECUTIONS_TABLE`
    - `analyze-fetch-docs`: `EXAM_GUIDES_TABLE`
    - `analyze-status`: `EXECUTIONS_TABLE`
    - `step-tracker`: `EXECUTIONS_TABLE`
    - `populate-exam-guides`: `EXAM_GUIDES_TABLE`

---

## Frontend Changes

### `src/lib/anthropic.js` → `src/lib/analysis.js`

```js
export async function startAnalysis({ kmap, certNames, total }, idToken) {
  // POST /analyze → { executionId }
}

export async function pollAnalysis(executionId, idToken) {
  // GET /analyze/{executionId} → { status, currentStep, result }
}
```

No `VITE_ANTHROPIC_API_KEY`. Both dev and prod use API Gateway.

### `src/App.jsx` — polling flow

```js
const generate = async () => {
  setLoading(true)
  setCurrentStep('Starting...')
  const { executionId } = await startAnalysis({ kmap, certNames, total }, idToken)
  sessionStorage.setItem('executionId', executionId)

  const interval = setInterval(async () => {
    const { status, currentStep, result } = await pollAnalysis(executionId, idToken)
    setCurrentStep(currentStep)
    if (status === 'SUCCEEDED') {
      clearInterval(interval)
      sessionStorage.removeItem('executionId')
      setAnalysis(result)
      setStep(2)
    }
    if (status === 'FAILED') {
      clearInterval(interval)
      setError('Analysis failed. Please try again.')
      setLoading(false)
    }
  }, 2000)
}
```

On mount: if `sessionStorage.getItem('executionId')` exists, resume polling immediately.

### `src/components/Analysis.jsx`

1. Loading: show `currentStep` string instead of static text
2. New 5th tab "Exam Guide": renders `examDomains` as a domain/weight table (shown only when non-empty)
3. Recommendation tab: show "Based on official AWS exam guide" badge when `metadata.enriched === true`

---

## Models

| Usage | Model | Bedrock cross-region ID |
|---|---|---|
| Runtime classify (Step 1) | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Monthly cron extract | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Runtime final (Step 3) | Claude Sonnet 4.6 | `us.anthropic.claude-sonnet-4-6-20251101-v1:0` |

All calls via `@aws-sdk/client-bedrock-runtime` `ConverseCommand`. No API keys.

---

## Prompts

### Haiku classify (runtime Step 1)

```
Given this AWS learner profile, return ONLY JSON: {"certCode":"SAA-C03"}

Profile:
- Services: ${kStr}
- Certs held: ${cStr}
- Total services: ${total}

Return the AWS exam code for the single best next certification.
```

### Haiku extract (monthly cron only)

Input is the concatenated markdown from all sub-pages of the cert guide,
truncated to 16,000 characters.

```
Extract the exam domain table from this AWS certification exam guide content.
Return ONLY JSON:
{"domains":[{"domain":"string","weight":"XX%","taskStatements":["string"]}]}
The content spans multiple pages — find the domain/weight breakdown wherever it appears.
Omit all other content.

<examguide>
${concatenatedMarkdown}
</examguide>
```

### Sonnet final — system message (runtime Step 3)

```
You are a senior AWS certification advisor. Ground your analysis in the
official exam domains below.

Official exam domains for ${certCode}:
${JSON.stringify(domains, null, 2)}

Return ONLY JSON: { rec, gaps, roadmap, projects, examDomains, metadata }
```

---

## Verification

1. Manually invoke `populate-exam-guides` → confirm 11 items in `certpath-examguides`
2. POST /analyze → verify `{executionId}` returned
3. Poll GET /analyze/{id} every 2s → verify `currentStep` cycles through all 3 labels
4. Verify final result has `examDomains` array and `metadata.enriched: true`
5. Delete one examguides item → re-run → verify `metadata.enriched: false`, analysis still completes
6. Poll with wrong user JWT → verify 403
7. Refresh page mid-poll → verify sessionStorage resume

---

## Implementation Order

1. Verify markdown URL slugs for all 11 certs against the AWS docs index page
2. `populate-exam-guides/index.mjs`
3. `analyze-classify/index.mjs`
4. `analyze-fetch-docs/index.mjs`
5. `analyze-final/index.mjs`
6. `analyze-start/index.mjs`
7. `analyze-status/index.mjs`
8. `step-tracker/index.mjs`
9. `infrastructure/lib/certpath-stack.ts` (full update)
10. `src/lib/anthropic.js` → `src/lib/analysis.js`
11. `src/App.jsx`
12. `src/components/Analysis.jsx`

---

## Open Implementation Note

The exact per-cert markdown URL slugs (e.g. `aws-certified-solutions-architect-associate.md`)
must be verified by fetching the AWS docs index page before hardcoding in
`populate-exam-guides`. The base URL is:
`https://docs.aws.amazon.com/aws-certification/latest/examguides/`
