# AWS CertPath — Claude Code Project

## Project Overview
A React + Vite web app that helps AWS learners identify their next certification.
Users fill in a knowledge map of AWS services, check certifications they hold, and
receive AI-powered recommendations (next cert, study roadmap, hands-on projects)
grounded in official AWS exam guide content.

## Current Status
- ✅ Core React UI (KnowledgeMap, Certifications, Analysis views)
- ✅ CDK stack (Cognito + Google OAuth, API Gateway, Lambda, DynamoDB, S3+CloudFront)
- ✅ Enriched analysis pipeline (Lambda Durable Functions + Bedrock + exam guide cache)
- ✅ Cognito + Google OAuth integration (custom domain auth.esaheki.com)
- ✅ User data persistence (DynamoDB profiles)
- ✅ CloudFront + S3 deployment (esaheki.com/aws)
- ✅ CloudWatch dashboard, alarms, X-Ray tracing, structured logging
- ✅ Well-Architected review hardening (rate limiting, scoped IAM, DLQ, prompt caching)

## Tech Stack
- **Frontend**: React 18 + Vite, inline styles (no CSS framework dependency)
- **Auth**: AWS Cognito (User Pool + Google OAuth 2.0 IdP) — see `src/lib/auth.js`
- **AI**: Amazon Bedrock — Claude Haiku 4.5 + Claude Sonnet 4.6 via IAM (no API keys)
- **Orchestration**: Lambda Durable Functions (`@aws/durable-execution-sdk-js`)
- **Infra**: AWS CDK (TypeScript) v2.257 — see `infrastructure/`

## Architecture

```
Browser (React/Vite)
  │
  ├── S3 + CloudFront (esaheki.com/aws)       ← static hosting
  │
  ├── Cognito User Pool (auth.esaheki.com)    ← Google OAuth 2.0
  │
  └── API Gateway (Cognito authorizer)
        ├── POST /analyze                      ← analyze-start → fires durable orchestrator
        │     └── analyze-orchestrator (Durable, Node.js 24)
        │           ├── analyze-classify        Haiku: cert code recommendation
        │           ├── analyze-fetch-docs      DynamoDB: pre-extracted exam domains
        │           └── analyze-final           Sonnet: full enriched analysis
        │
        ├── GET /analyze/{id}                  ← analyze-status → polls DynamoDB
        │     └── certpath-executions DynamoDB
        │
        ├── GET /profile                       ← profile-get
        └── POST /profile                      ← profile-save
              └── DynamoDB
                    ├── certpath-profiles      user knowledge maps + certs
                    ├── certpath-examguides    cached exam domain JSON (monthly refresh)
                    └── certpath-executions    execution status + results

EventBridge cron (monthly)
  └── populate-exam-guides Lambda
        └── AWS docs (.md) → Haiku extract → certpath-examguides DynamoDB
```

## Project Structure
```
aws-certpath/
├── CLAUDE.md                           ← you are here
├── README.md
├── RISKS.md                            ← Well-Architected review (gitignored)
├── package.json
├── vite.config.js
├── index.html
├── .env.example
├── src/
│   ├── main.jsx
│   ├── App.jsx                         ← Root: step nav, poll loop, sessionStorage resume
│   ├── components/
│   │   ├── KnowledgeMap.jsx            ← Step 1: AWS service proficiency map
│   │   ├── Certifications.jsx          ← Step 2: Owned cert checklist
│   │   └── Analysis.jsx                ← Step 3: AI result + progress + examDomains tab
│   ├── lib/
│   │   ├── analysis.js                 ← startAnalysis() + pollAnalysis() via API Gateway
│   │   └── auth.js                     ← Cognito helpers
│   ├── hooks/
│   │   └── useAuth.js                  ← Auth state hook
│   └── config/
│       ├── services.js                 ← AWS services data (10 categories, 70+ services)
│       └── certifications.js           ← AWS certifications data (12 certs)
├── backend/
│   └── functions/
│       ├── analyze-start/              ← POST /analyze → fires durable orchestrator
│       ├── analyze-orchestrator/       ← Durable orchestrator: classify → fetch → final
│       ├── analyze-classify/           ← Activity: Haiku → certCode
│       ├── analyze-fetch-docs/         ← Activity: DynamoDB read → domains JSON
│       ├── analyze-final/              ← Activity: Sonnet → full enriched analysis
│       ├── analyze-status/             ← GET /analyze/{id} → polling status + result
│       ├── profile-get/                ← GET /profile
│       ├── profile-save/               ← POST /profile
│       ├── populate-exam-guides/       ← Monthly cron: AWS docs → Haiku → DynamoDB
│       └── update-distribution/        ← CloudFormation custom resource (CloudFront)
└── infrastructure/
    ├── package.json                    ← aws-cdk-lib 2.257, aws-cdk 2.1125
    ├── tsconfig.json
    ├── cdk.json
    └── lib/
        └── certpath-stack.ts           ← CDK stack (full infrastructure)
```

## Key Data Shapes

### Knowledge Map (kmap)
```js
{ "EC2": 2, "Lambda": 3, "S3": 1, ... }  // 0=None, 1=Basic, 2=Intermediate, 3=Advanced
```

### Owned Certifications (owned)
```js
Set(["saa", "ccp"])  // ids from config/certifications.js
```

### Analysis Response (from Bedrock Sonnet via durable orchestrator)
```js
{
  rec: { cert, code, level, why, readiness, timeline },
  gaps: [{ name, priority, why }],
  roadmap: [{ phase, title, weeks, topics, goal }],
  projects: [{ name, diff, svcs, desc, time }],
  examDomains: [{ domain, weight }],          // from official AWS exam guide
  metadata: { enriched: true|false, certCode }
}
```

### Execution Status (polling response from certpath-executions DynamoDB)
```js
{
  status: "RUNNING" | "SUCCEEDED" | "FAILED",
  currentStep: "Analyzing your AWS knowledge map...",  // human-readable, updated by orchestrator
  result: { ...analysis } | null,
  error: string | null
}
```

## AI Models (Amazon Bedrock)
| Usage | Model | Bedrock cross-region ID |
|---|---|---|
| Cert classification | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Exam guide extraction (cron) | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Final analysis | Claude Sonnet 4.6 | `us.anthropic.claude-sonnet-4-6` |

All Lambda roles use IAM `bedrock:InvokeModel` with scoped model ARNs (wildcard region required for cross-region inference routing). No API keys.

**Prompt caching**: `analyze-final` splits its system prompt at a `cachePoint` — the static exam guide block (per cert code) is cached by Bedrock, the dynamic role context is not. Saves ~85% latency on repeat requests for the same cert.

## Orchestrator Design
`analyze-orchestrator` uses `withDurableExecution` from `@aws/durable-execution-sdk-js`.
It invokes the three activity Lambdas in sequence via `context.step()`, writes DynamoDB
progress updates between steps, and writes the final SUCCEEDED/FAILED record.
The orchestrator is invoked via its `live` alias (qualified ARN required by durable runtime).

Activity functions (classify, fetch-docs, final) are pure compute — no DynamoDB side effects.
Rate limiting (5-min cooldown) is enforced in `analyze-start` before the orchestrator fires.

## Observability
- **CloudWatch dashboard** `certpath`: analysis volume, token counts (Haiku/Sonnet), cache hit rate %, estimated cost/hr, avg cost per analysis
- **CloudWatch alarms** → SNS email: orchestrator errors, API 5xx, populate failures, EventBridge DLQ depth
- **X-Ray**: active tracing on all 9 Lambda functions
- **Structured logs**: `{ level, message, ...ctx }` JSON on every Lambda — CloudWatch Logs Insights queryable
- **Bedrock metric filters**: `CertPath/Bedrock` namespace with 8 metrics (input/output/cache tokens per function)

## Environment Variables
Copy `.env.example` → `.env.local`. No `VITE_ANTHROPIC_API_KEY` needed.
Both dev and prod use API Gateway.

## Commands
```bash
npm install        # install frontend dependencies
npm run dev        # start dev server (localhost:5173)
npm run build      # production build → dist/
npm run preview    # preview production build

cd infrastructure
npm install
npx cdk bootstrap  # first time only
npx cdk deploy     # deploy to AWS

# After first deploy: seed the exam guide cache
aws lambda invoke --function-name certpath-populate-exam-guides /tmp/out.json
```
