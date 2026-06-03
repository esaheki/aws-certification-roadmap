# AGENTS.md

Read `CLAUDE.md` for architecture, tech stack, and data shapes. This file only captures things that drift from reality or aren't obvious from the code.

## Build / dev / lint

- `npm run dev` / `npm run build` / `npm run preview` — frontend (Vite, React 18).
- **`npm run lint` is broken**: ESLint 9 is configured but there is no `eslint.config.js` flat config. Don't rely on lint as a verification gate.
- No tests, no CI, no pre-commit hooks. Nothing prevents broken code from being committed.
- Frontend is plain `.jsx` — no TypeScript, no typecheck.
- The only typecheck is CDK: `cd infrastructure && npx tsc --noEmit`. Run this to verify any infrastructure changes before deploying.
- Infra scripts: `npm run build` (tsc), `npm run diff`, `npm run deploy`, `npm run destroy`.

## Analysis pipeline — which files are live

The analysis pipeline uses a durable orchestrator pattern. When touching the analysis flow, the relevant files are:

```
src/lib/analysis.js              — frontend: startAnalysis(), pollAnalysis()
backend/functions/analyze-start/ — HTTP adapter: rate limit, write DDB record, fire orchestrator
backend/functions/analyze-orchestrator/ — durable orchestrator (Node.js 24, @aws/durable-execution-sdk-js)
backend/functions/analyze-classify/    — activity: Haiku → certCode
backend/functions/analyze-fetch-docs/  — activity: DynamoDB → examGuide
backend/functions/analyze-final/       — activity: Sonnet → full result
backend/functions/analyze-status/      — polling: GET /analyze/{id} → DynamoDB read
```

Activity functions (classify, fetch-docs, final) are **pure compute** — they take inputs and return outputs, no DynamoDB side effects. The orchestrator owns all progress/result writes to `certpath-executions`.

## Other Lambda functions

- `backend/functions/profile-get/` + `profile-save/` — DynamoDB user-profile persistence (GET/POST `/profile`).
- `backend/functions/populate-exam-guides/` — monthly EventBridge cron; fetches AWS docs, extracts exam domains via Haiku, writes to `certpath-examguides`. Must be invoked manually after first deploy to seed the cache.
- `backend/functions/update-distribution/` — CloudFormation custom-resource Lambda. Mutates an externally-owned CloudFront distribution to add a `/aws*` behavior + SPA-rewrite CloudFront Function. Don't remove or change this without understanding the path-prefix setup below.

## Deploy quirks

- The app lives under `/aws/`, not the domain root. `vite.config.js` sets `base: '/aws/'` and the CloudFront distribution is owned by a separate stack — this stack attaches only a `/aws*` behavior via the `update-distribution` custom resource. Don't change the base path to `/`.
- Deploy order: `cdk deploy` → invoke `certpath-populate-exam-guides` to seed the exam guide cache → `npm run build` → `cdk deploy` again to upload `dist/`.
- Bedrock model access for the Haiku + Sonnet cross-region inference profiles must be enabled in the account before any analysis will work.
- The durable orchestrator is invoked by `analyze-start` using the `live` alias ARN (not the bare function name). The durable execution runtime requires a qualified ARN.
- CDK versions: `aws-cdk-lib` 2.257, CLI `aws-cdk` 2.1125. Both are pinned in `infrastructure/package.json`. Run `npm install` inside `infrastructure/` if the CLI complains about a schema version mismatch.

## Conventions / gotchas

- AWS credentials are required even for `npm run dev` — the frontend calls real API Gateway/Bedrock, no local mock.
- Frontend env vars live in `.env.local` (gitignored). The required vars are in README's "Post-deploy .env.local" section (`VITE_COGNITO_*`, `VITE_API_BASE_URL`). No `VITE_ANTHROPIC_API_KEY`.
- `src/lib/auth.js` has `CLIENT_ID` and `COGNITO_DOMAIN` hardcoded. `src/lib/analysis.js` has a hardcoded API GW URL as fallback. These are intentional — don't move to env-only without updating the CDK outputs flow.
- `dist/` may be present in the tree even though `.gitignore` excludes it (committed before the rule). Do not delete it without rebuilding.
- Components use inline styles only (no CSS framework). Match that style when adding UI.
- Bedrock IAM policy uses a wildcard region (`arn:aws:bedrock:*::foundation-model/...`) — this is required because cross-region inference profiles route requests across us-east-1, us-east-2, and us-west-2. Don't narrow it to a single region or inference will fail intermittently.
