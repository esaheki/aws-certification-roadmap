# AWS CertPath — Claude Code Project

## Project Overview
A React + Vite web app that helps AWS learners identify their next certification.
Users fill in a knowledge map of AWS services, check certifications they hold, and
receive AI-powered recommendations (next cert, study roadmap, hands-on projects)
grounded in official AWS exam guide content.

## Current Status
- ✅ Core React UI complete (KnowledgeMap, Certifications, Analysis views)
- ✅ CDK stack scaffolded (Cognito, API Gateway, Lambda, DynamoDB, S3+CloudFront)
- ✅ Enriched analysis pipeline (see PLAN.md — Step Functions + Bedrock + exam guide cache)
- ✅ Cognito + Google OAuth integration
- ✅ User data persistence (DynamoDB profiles)
- ✅ CloudFront + S3 deployment

## Tech Stack
- **Frontend**: React 18 + Vite, inline styles (no CSS framework dependency)
- **Auth**: AWS Cognito (User Pool + Google OAuth 2.0 IdP) — see `src/lib/auth.js`
- **AI**: Amazon Bedrock — Claude Haiku 4.5 + Claude Sonnet 4.6 via IAM (no API keys)
- **Orchestration**: AWS Step Functions Standard Workflow (async, 3-state pipeline)
- **Infra**: AWS CDK (TypeScript) — see `infrastructure/`

## Architecture (Target)

```
Browser (React/Vite)
  │
  ├── S3 + CloudFront                    ← static hosting
  │
  ├── Cognito User Pool                  ← auth (Google OAuth 2.0)
  │
  └── API Gateway (Cognito authorizer)
        ├── POST /analyze                ← analyze-start Lambda → starts Step Functions
        │     └── Step Functions SM
        │           ├── analyze-classify  ← Haiku (Bedrock): cert code recommendation
        │           ├── analyze-fetch-docs← DynamoDB: pre-extracted exam domains
        │           └── analyze-final     ← Sonnet (Bedrock): full enriched analysis
        │
        └── GET /analyze/{id}            ← analyze-status Lambda → polls DynamoDB
              └── DynamoDB
                    ├── certpath-profiles    ← user knowledge maps + certs
                    ├── certpath-examguides  ← cached exam domain JSON (monthly refresh)
                    └── certpath-executions  ← in-flight analysis status + results

EventBridge cron (monthly)
  └── populate-exam-guides Lambda
        └── AWS docs (.md) → Haiku extract → certpath-examguides DynamoDB
```

## Priority Next Steps (see PLAN.md for full spec)

### 1. Build the enriched analysis pipeline
See `PLAN.md` for the full spec. Implementation order:
- 7 new Lambda functions under `backend/functions/`
- Step Functions state machine + EventBridge rules in CDK stack
- Monthly exam guide pre-population cron
- Frontend polling loop + progress UI + examDomains tab

### 2. Cognito + Google OAuth
Implement `src/lib/auth.js` using `amazon-cognito-identity-js` or Amplify Auth.
Required env vars (see `.env.example`):
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_CLIENT_ID`
- `VITE_COGNITO_DOMAIN`

Flow: Google Sign-In → Cognito hosted UI → JWT → store in memory (not localStorage)

### 3. DynamoDB persistence
After auth, load/save user's knowledge map and certs keyed by Cognito `sub`.
Endpoint: POST /profile (save), GET /profile (load)

### 4. CDK Stack finalization
- Wire S3 + CloudFront deployment
- Add Google IdP credentials to Cognito User Pool
- Update Cognito callback URLs to CloudFront domain

## Project Structure
```
aws-certpath/
├── CLAUDE.md                        ← you are here
├── README.md
├── PLAN.md                          ← full spec for the enriched analysis pipeline
├── package.json
├── vite.config.js
├── index.html
├── .env.example
├── src/
│   ├── main.jsx                     ← React entry point
│   ├── App.jsx                      ← Root: step nav, poll loop, sessionStorage resume
│   ├── components/
│   │   ├── KnowledgeMap.jsx         ← Step 1: AWS service proficiency map
│   │   ├── Certifications.jsx       ← Step 2: Owned cert checklist
│   │   └── Analysis.jsx             ← Step 3: AI result + progress + examDomains tab
│   ├── lib/
│   │   ├── analysis.js              ← startAnalysis() + pollAnalysis() via API Gateway
│   │   └── auth.js                  ← Cognito helpers (scaffold)
│   ├── hooks/
│   │   └── useAuth.js               ← Auth state hook (scaffold)
│   └── config/
│       ├── services.js              ← AWS services data (10 categories, 70 services)
│       └── certifications.js        ← AWS certifications data (11 certs)
├── backend/
│   └── functions/
│       ├── analyze-start/           ← POST /analyze → starts Step Functions execution
│       ├── analyze-classify/        ← SF Step 1: Haiku → certCode
│       ├── analyze-fetch-docs/      ← SF Step 2: DynamoDB read → domains JSON
│       ├── analyze-final/           ← SF Step 3: Sonnet → full enriched analysis
│       ├── analyze-status/          ← GET /analyze/{id} → polling status + result
│       ├── step-tracker/            ← EventBridge → writes step progress to DynamoDB
│       └── populate-exam-guides/    ← Monthly cron: AWS docs → Haiku extract → DynamoDB
└── infrastructure/
    ├── package.json
    ├── tsconfig.json
    ├── cdk.json
    └── lib/
        └── certpath-stack.ts        ← CDK stack (full infrastructure)
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

### Analysis Response (from Bedrock Sonnet via Step Functions)
```js
{
  rec: { cert, code, level, why, readiness, timeline },
  gaps: [{ name, priority, why }],
  roadmap: [{ phase, title, weeks, topics, goal }],
  projects: [{ name, diff, svcs, desc, time }],
  examDomains: [{ domain, weight }],          // from official AWS exam guide
  metadata: { enriched: true|false, certCode } // enriched=false if cache miss
}
```

### Execution Status (polling response)
```js
{
  status: "RUNNING" | "SUCCEEDED" | "FAILED",
  currentStep: "Identifying your certification path...",  // human-readable
  result: { ...analysis } | null  // populated on SUCCEEDED
}
```

## AI Models (Amazon Bedrock)
| Usage | Model | Bedrock cross-region ID |
|---|---|---|
| Cert classification (Step 1) | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Exam guide extraction (cron) | Claude Haiku 4.5 | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Final analysis (Step 3) | Claude Sonnet 4.6 | `us.anthropic.claude-sonnet-4-6-20251101-v1:0` |

All Lambda roles use IAM `bedrock:InvokeModel` permissions. No API keys or Secrets Manager.

## Environment Variables
Copy `.env.example` → `.env.local`. No `VITE_ANTHROPIC_API_KEY` needed.
Both dev and prod use API Gateway (Step Functions everywhere).

## Commands
```bash
npm install        # install dependencies
npm run dev        # start dev server (localhost:5173) — requires AWS credentials
npm run build      # production build → dist/
npm run preview    # preview production build

cd infrastructure
npm install
npx cdk bootstrap  # first time only
npx cdk deploy     # deploy to AWS

# After deploy: seed the exam guide cache
aws lambda invoke --function-name certpath-populate-exam-guides /tmp/out.json
```
