# Development Standards (VOILoop Tech Stack)

## Trunk-Based Development Rules (Required)
`main` is the trunk and must stay releasable at all times.

1. Branch from the latest `main` and keep branches short-lived (target: same day, max ~2 days).
2. One branch = one focused change. Split large work into small vertical slices.
3. Rebase/merge from `main` frequently to avoid drift and late conflicts.
4. Open a PR early, keep it small/reviewable, and merge as soon as required checks are green.
5. Do not create long-lived integration branches. Incomplete work must be behind a feature flag or otherwise non-breaking.
6. Prefer squash merge so each PR lands as one logical change on trunk.

### Branch naming (trunk-friendly)
- `feat/<issue-number>-<short-description>`
- `fix/<issue-number>-<short-description>`
- `chore/<issue-number>-<short-description>`

Example: `feat/123-csv-upload-whoop-import`

## Stack-Aware Engineering Practices
- **Framework:** Next.js 14 App Router + TypeScript.
- Prefer server components for data reads; use client components only for UI interactivity/state.
- Keep Supabase query logic centralized in shared data-layer modules (`src/lib/supabase/*`) rather than in pages/components.
- Keep route handlers in `src/app/api/**/route.ts`; keep parsing/validation/business logic in reusable modules.
- When schema changes, update SQL, TypeScript types, and all impacted queries together in the same PR.
- Keep components small/composable; avoid mixing heavy business logic into `page.tsx`.
- Reuse existing utilities and naming patterns before introducing new helpers.

## Testing Standards for Every Feature PR (Required)
Every feature must include or update all three test layers:

1. **Unit tests (Jest):** Pure functions, validators, mappers, formatters, and isolated component behavior.
2. **Integration tests (Jest):** Route handlers, Supabase-backed data flows, and auth/protected-path behavior with realistic fixtures/mocks.
3. **End-to-end tests (user journey):** Browser-level happy path and key failure path for the feature (for example: import flow, login flow, intervention workflow).

No feature is complete until all impacted layers are covered. If a required layer is missing test harness coverage, add that harness as part of the same work before merge.

## CI and Merge Gates
Before merge to trunk, PRs must pass repository checks:
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm test`

If a feature introduces/updates e2e coverage, include it in CI so trunk remains protected.

## Commit and Push Guardrails (Required)
- Never push directly to `main`. All changes land through PRs.
- Use small, atomic commits that each represent one logical change.
- Use Conventional Commit prefixes in commit messages (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).
- Every commit and PR must reference the related issue/spec so reviewers can trace intent.
- If a commit impacts platform operations (deploy flow, secrets, migrations, monitoring, rollback, access), update `RUNBOOK.md` in the same PR before merge.

## Pull Request Quality Bar (Required)
- Keep PRs small and reviewable; split large work into stacked/sequence PRs.
- PR description must include:
  - what changed
  - why it changed
  - risk assessment
  - rollback plan
- UI changes must include screenshots or short recordings for key states.

## Database Change Safety (Required)
- Migrations must be forward-only and idempotent where practical.
- Include explicit backfill steps when schema changes require historical data updates.
- PRs touching schema must document deployment order and rollback approach.

## Feature Flagging for Risky Work (Required)
- Incomplete, risky, or experimental functionality must be behind a feature flag or otherwise non-breaking default.
- Default behavior in `main` must remain stable and releasable when flags are off.

## Coverage Expectations (Required)
- Tests must cover the changed behavior, including success and failure paths.
- For bug fixes, add at least one regression test that fails before the fix and passes after.
- If test coverage is not feasible for a specific edge case, document rationale in the PR.

## Observability and Security Guardrails (Required)
- Add/adjust logs and metrics for critical flows touched by the change (imports, auth, interventions, outcomes).
- Ensure errors are observable (actionable messages, no silent failure paths).
- Never expose secrets in client code or logs. In particular, `SUPABASE_SERVICE_ROLE_KEY` must remain server-only.
- Redact or avoid logging PII and sensitive workforce health data.

## Naming Standards
- **Files:** kebab-case for routes/util modules where applicable; keep Next.js conventions (`page.tsx`, `layout.tsx`, `route.ts`).
- **Components:** PascalCase (`InterventionDetailClient.tsx`).
- **Functions/variables:** camelCase.
- **Types/interfaces:** PascalCase.
- **Constants:** UPPER_SNAKE_CASE only for true constants; otherwise descriptive camelCase.
- **Database:** snake_case table/column names.
- Prefer clear domain names over abbreviations.

## Definition of Done
- Scope matches spec and acceptance criteria.
- Schema, types, and docs are updated together.
- Unit + integration + e2e coverage is added/updated for changed behavior.
- Security/privacy implications are addressed for all touched surfaces.
- PR is small, reviewable, and ready to merge cleanly into `main`.
