# AGENTS.md

Read `CLAUDE.md` and `PLAN.md` for architecture and the analysis-pipeline spec. This file only captures things those docs miss or that have drifted from reality.

## Build / dev / lint

- `npm run dev` / `npm run build` / `npm run preview` — frontend (Vite, React 18).
- **`npm run lint` is currently broken**: it runs ESLint 9 but there is no `eslint.config.js` (the repo only has the old-style `eslint-plugin-*` deps in `package.json`). Don't trust lint as a verification step until a flat config is added.
- There are no tests, no CI, and no pre-commit hooks. Nothing prevents broken code from being committed.
- There is no typecheck for the frontend (plain `.jsx`, no TS). The only typecheck in the repo is infra: `cd infrastructure && npm run build` (`tsc`). Run this to verify CDK changes.
- Infra (in `infrastructure/`) is the only TypeScript: `npm run build` there = `tsc`. Use `npm run diff` / `npm run deploy` / `npm run destroy` (thin wrappers over `cdk`).

## Stale / decoy files — do NOT edit these

The Step Functions migration (see `PLAN.md`) left old single-call code in the tree. Live code is the `analyze-*` split + `src/lib/analysis.js`:

- `backend/functions/analyze/index.mjs` — LEGACY single Anthropic-API Lambda. Not wired in the CDK stack. The active entrypoint is `backend/functions/analyze-start/`.
- `src/lib/anthropic.js` — LEGACY browser-direct Anthropic helper. Nothing imports it. `src/App.jsx` imports `src/lib/analysis.js` instead.

When touching the analysis flow, edit `analysis.js` and the `analyze-start / analyze-classify / analyze-fetch-docs / analyze-final / analyze-status / step-tracker` Lambdas, never the legacy pair.

## Lambdas not mentioned in CLAUDE.md

- `backend/functions/profile-get/` + `profile-save/` — DynamoDB user-profile persistence (GET/POST `/profile`).
- `backend/functions/update-distribution/` — a **CloudFormation custom-resource** Lambda. It mutates an *existing, externally-owned* CloudFront distribution to add a `/aws*` behavior + an SPA-rewrite CloudFront Function. This is why the app is served under a path prefix (next item).

## Deploy quirks

- The app is hosted under the `/aws/` path prefix, not the domain root. `vite.config.js` sets `base: '/aws/'`, and the CloudFront distribution is shared/owned by another stack — this stack only attaches a `/aws*` behavior via the `update-distribution` custom resource. Don't "fix" the base path to `/`.
- Deploy order matters (from README): `cdk deploy` → manually invoke `certpath-populate-exam-guides` to seed the exam-guide cache (analysis fails/degrades without it) → `npm run build` → `cdk deploy` again to upload `dist/`.
- Bedrock model access for the Haiku + Sonnet inference profiles must be enabled in the account first.

## Stale docs — CLAUDE.md status checkboxes are wrong

`CLAUDE.md` "Current Status" section marks the Step Functions pipeline, Cognito auth, DynamoDB profiles, and CloudFront deployment as `⬜` (not done). All of these are fully implemented. Ignore those checkboxes; the codebase is the source of truth.

## Conventions / gotchas

- AWS credentials are required even for `npm run dev` — the dev frontend calls real API Gateway/Bedrock, no local mock.
- Frontend env vars live in `.env.local` (gitignored). There is **no** `.env.example` despite CLAUDE.md referencing one; the real var list is in README's "Post-deploy .env.local" section (`VITE_COGNITO_*`, `VITE_API_BASE_URL`). No `VITE_ANTHROPIC_API_KEY`.
- `src/lib/auth.js` has `CLIENT_ID` and `COGNITO_DOMAIN` hardcoded (not read from env). `src/lib/analysis.js` has a hardcoded API GW URL as a fallback. These are intentional — don't "fix" them to env-only without updating the CDK outputs flow.
- `dist/` is present in the tree despite being in `.gitignore` (it was committed before the ignore rule). Do not delete it assuming it's spurious — it is the deployed frontend artifact.
- `infrastructure/cdk.out/` is committed locally but is generated CDK output — do not hand-edit; the root `.gitignore` ignores `cdk.out/` but there's no `infrastructure/.gitignore`, so avoid staging those asset files.
- Components use inline styles only (no CSS framework). Match that style.
