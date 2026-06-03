# AWS CertPath

> AI-powered AWS certification path planner. Map your knowledge, get a personalized
> study roadmap grounded in official AWS exam content, and build hands-on projects.

## Quick Start (local dev)

```bash
# 1. Clone / download this project
cd aws-certpath

# 2. Install frontend dependencies
npm install

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local — add Cognito + API Gateway values (see post-deploy section)

# 4. Start dev server (requires AWS credentials in env or ~/.aws)
npm run dev
# → http://localhost:5173
```

> **Note:** Local dev calls API Gateway → Lambda Durable orchestrator → Bedrock directly.
> AWS credentials (`aws configure` or env vars) are required even for local development.

## Architecture

```
Browser (React/Vite)
  │
  ├── S3 + CloudFront              ← static hosting (esaheki.com/aws)
  │
  ├── Cognito User Pool            ← auth (Google OAuth 2.0, custom domain auth.esaheki.com)
  │
  └── API Gateway (Cognito auth)
        ├── POST /analyze          ← analyze-start → fires durable orchestrator; returns executionId
        │     └── analyze-orchestrator (Lambda Durable, Node.js 24)
        │           ├── analyze-classify    Haiku 4.5 (Bedrock): pick cert code
        │           ├── analyze-fetch-docs  DynamoDB: pre-extracted exam domains
        │           └── analyze-final       Sonnet 4.6 (Bedrock): full enriched analysis
        │
        ├── GET /analyze/{id}      ← polls DynamoDB for status + result
        │
        ├── GET /profile           ← load user profile (kmap, certs, role)
        └── POST /profile          ← save user profile
              └── DynamoDB
                    ├── certpath-profiles     user profiles (kmap, owned certs, role)
                    ├── certpath-examguides   official exam domain cache (monthly refresh)
                    └── certpath-executions   execution status + results

EventBridge cron (1st of each month)
  └── populate-exam-guides Lambda
        └── AWS docs → Haiku extract → certpath-examguides
```

All AI calls go through **Amazon Bedrock** using IAM authentication — no API keys required.
The orchestrator uses [Lambda Durable Functions](https://docs.aws.amazon.com/lambda/latest/dg/durable-functions.html) for resilient multi-step execution with built-in retry and state persistence.

## Project Structure

```
aws-certpath/
├── src/                              Frontend (React + Vite)
│   ├── App.jsx                       Root — step nav, poll loop, sessionStorage resume
│   ├── components/
│   │   ├── KnowledgeMap.jsx          Step 1: service proficiency map
│   │   ├── Certifications.jsx        Step 2: owned cert checklist
│   │   └── Analysis.jsx              Step 3: enriched AI recommendation display
│   ├── config/
│   │   ├── services.js               AWS services data (10 categories, 100+ services)
│   │   └── certifications.js         AWS certifications data (12 certs)
│   └── lib/
│       ├── analysis.js               startAnalysis(), pollAnalysis(), getProfile(), saveProfile()
│       └── auth.js                   Cognito helpers
│
├── backend/functions/
│   ├── analyze-start/                POST /analyze → fires durable orchestrator
│   ├── analyze-orchestrator/         Durable orchestrator: classify → fetch-docs → final
│   ├── analyze-classify/             Activity: Haiku → certCode (role-aware)
│   ├── analyze-fetch-docs/           Activity: DynamoDB → exam domains
│   ├── analyze-final/                Activity: Sonnet → full enriched analysis
│   ├── analyze-status/               GET /analyze/{id} → status + result
│   ├── profile-get/                  GET /profile
│   ├── profile-save/                 POST /profile
│   └── populate-exam-guides/         Monthly cron: AWS docs → Haiku → DynamoDB
│
└── infrastructure/                   AWS CDK (TypeScript) — aws-cdk-lib 2.257
    └── lib/certpath-stack.ts         Full stack definition
```

## Deploying to AWS

### Prerequisites
- AWS CLI configured (`aws configure`)
- Node.js 22+
- Amazon Bedrock model access enabled in your account for:
  - `us.anthropic.claude-haiku-4-5-20251001-v1:0`
  - `us.anthropic.claude-sonnet-4-6-20251101-v1:0`

### Steps

```bash
# 1. Bootstrap CDK (first time per account/region)
cd infrastructure
npm install
npx cdk bootstrap

# 2. Deploy the stack
npx cdk deploy
# Note the output values — you'll need them for .env.local

# 3. Seed the exam guide cache (required before first analysis)
aws lambda invoke \
  --function-name certpath-populate-exam-guides \
  /tmp/populate-out.json
cat /tmp/populate-out.json  # verify all 11 certs populated

# 4. Build and deploy the frontend
cd ..
npm run build
cd infrastructure
npx cdk deploy  # re-deploy to upload the dist/ folder
```

### Post-deploy `.env.local`

```
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=<UserPoolId from CDK output>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId from CDK output>
VITE_COGNITO_DOMAIN=auth.esaheki.com
VITE_COGNITO_REDIRECT_URI=https://esaheki.com/aws/callback
VITE_API_BASE_URL=<ApiGatewayURL from CDK output>
```

## How the Analysis Works

1. **Map your AWS knowledge** — rate 100+ services across 10 categories (None / Basic / Intermediate / Advanced)
2. **Select your target role** — Cloud Architect, Developer, DevOps, Data Engineer, ML/AI, Security, Networking, GenAI, or Cloud Generalist
3. **Check your certs** — mark which AWS certifications you already hold
4. **Click "Generate My Path"** — the durable orchestrator pipeline runs:
   - **Classify** (Haiku, ~2s): picks your best next cert guided by your role's official AWS certification path
   - **Fetch docs** (~instant): reads official AWS exam guide domains from DynamoDB cache
   - **Final analysis** (Sonnet, ~15-30s): builds a roadmap grounded in those official domains, tailored to your role — with Bedrock prompt caching for repeat cert requests
5. **You get:**
   - Cert recommendation with readiness % and timeline
   - Knowledge gaps with priority
   - Phase-by-phase study roadmap
   - Hands-on project suggestions
   - Official exam domains + weights tab

Your knowledge map, certifications, and role are saved to DynamoDB and restored on next login.

## Observability

- **CloudWatch dashboard** (`certpath`): analysis volume, token counts per model, Bedrock prompt cache hit rate, estimated cost per hour, average cost per analysis
- **CloudWatch alarms** → SNS email: orchestrator errors, API Gateway 5xx, populate-exam-guides failures, EventBridge DLQ depth
- **X-Ray tracing**: active on all 9 Lambda functions
- **Structured JSON logs**: all Lambdas emit `{ level, message, ...context }` — queryable via CloudWatch Logs Insights
