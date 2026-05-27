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

> **Note:** Local dev calls API Gateway → Step Functions → Bedrock directly.
> AWS credentials (`aws configure` or env vars) are required even for local development.

## Architecture

```
Browser (React/Vite)
  │
  ├── S3 + CloudFront              ← static hosting
  │
  ├── Cognito User Pool            ← auth (Google OAuth 2.0)
  │
  └── API Gateway (Cognito auth)
        ├── POST /analyze          ← starts Step Functions; returns executionId
        │     └── Step Functions Standard Workflow
        │           ├── analyze-classify    Haiku 4.5 (Bedrock): pick cert code
        │           ├── analyze-fetch-docs  DynamoDB: pre-extracted exam domains
        │           └── analyze-final       Sonnet 4.6 (Bedrock): full analysis
        │
        ├── GET /analyze/{id}      ← polls execution status + result
        │     └── DynamoDB (certpath-executions)
        │
        ├── GET /profile           ← load user profile (kmap, certs, role)
        └── POST /profile          ← save user profile
              └── DynamoDB
                    ├── certpath-profiles     user profiles (kmap, owned certs, role)
                    ├── certpath-examguides   official exam domain cache (monthly refresh)
                    └── certpath-executions   in-flight execution tracking

EventBridge cron (1st of each month)
  └── populate-exam-guides Lambda
        └── AWS docs → Haiku extract → certpath-examguides
```

All AI calls go through **Amazon Bedrock** using IAM authentication — no API keys required.

## Project Structure

```
aws-certpath/
├── src/                          Frontend (React + Vite)
│   ├── App.jsx                   Root — step nav, poll loop, sessionStorage resume
│   ├── components/
│   │   ├── KnowledgeMap.jsx      Step 1: service proficiency map
│   │   ├── Certifications.jsx    Step 2: owned cert checklist
│   │   └── Analysis.jsx          Step 3: enriched AI recommendation display
│   ├── config/
│   │   ├── services.js           AWS services data (10 categories, 100+ services)
│   │   └── certifications.js     AWS certifications data (12 certs)
│   └── lib/
│       ├── analysis.js           startAnalysis(), pollAnalysis(), getProfile(), saveProfile()
│       └── auth.js               Cognito helpers
│
├── backend/functions/
│   ├── analyze-start/            POST /analyze → starts Step Functions
│   ├── analyze-classify/         SF Step 1: Haiku → certCode (role-aware)
│   ├── analyze-fetch-docs/       SF Step 2: DynamoDB → exam domains
│   ├── analyze-final/            SF Step 3: Sonnet → full enriched analysis
│   ├── analyze-status/           GET /analyze/{id} → status + result
│   ├── profile-get/              GET /profile → load user profile from DynamoDB
│   ├── profile-save/             POST /profile → save user profile to DynamoDB
│   ├── step-tracker/             EventBridge → step progress to DynamoDB
│   └── populate-exam-guides/     Monthly cron: docs → Haiku → DynamoDB
│
├── infrastructure/               AWS CDK (TypeScript)
│   └── lib/certpath-stack.ts     Full stack definition
│
└── PLAN.md                       Full spec for the enriched analysis pipeline
```

## Deploying to AWS

### Prerequisites
- AWS CLI configured (`aws configure`)
- Node.js 20+
- AWS CDK installed (`npm install -g aws-cdk`)
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

# 5. Update Cognito callback URLs with the CloudFront domain
#    (shown in CDK output as CloudFrontURL)
```

### Post-deploy .env.local

```
VITE_COGNITO_REGION=us-east-1
VITE_COGNITO_USER_POOL_ID=<UserPoolId from CDK output>
VITE_COGNITO_CLIENT_ID=<UserPoolClientId from CDK output>
VITE_COGNITO_DOMAIN=<CognitoDomain from CDK output>
VITE_COGNITO_REDIRECT_URI=https://<CloudFrontURL>/callback
VITE_API_BASE_URL=<ApiGatewayURL from CDK output>
```

## How the Analysis Works

1. **You map your AWS knowledge** — rate 100+ services across 10 categories (None / Basic / Intermediate / Advanced)
2. **You select your target role** — Cloud Architect, Developer, DevOps, Data Engineer, ML/AI, Security, Networking, GenAI, or Cloud Generalist
3. **You check your certs** — mark which AWS certifications you already hold
4. **Click "Generate My Path"** — the app:
   - Calls Haiku to classify your best next cert, guided by your role's official AWS certification path (~1s)
   - Reads the official AWS exam guide domains from cache (~instant)
   - Calls Sonnet to build a roadmap grounded in those official domains, tailored to your role (~5-10s)
5. **You see:**
   - Cert recommendation with readiness % and timeline
   - Knowledge gaps with priority
   - Phase-by-phase study roadmap
   - Hands-on project suggestions
   - Official exam domains + weights tab (when cache is populated)

Your knowledge map, certifications, and role are saved to DynamoDB and restored on next login.

## Pending

- [ ] Seed exam guide cache after first deploy (`aws lambda invoke --function-name certpath-populate-exam-guides /tmp/out.json`)
