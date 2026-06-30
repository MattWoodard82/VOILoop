# Development Standards (VOILoop Tech Stack)

## Stack-Aware Best Practices
- **Framework:** Next.js App Router with TypeScript.
- Prefer server components for data reads; use client components only for interactivity.
- Keep data access in shared data-layer modules; avoid duplicating query logic in pages/components.
- For Supabase, enforce least-privilege access and align schema + app types together.
- Keep UI components small, composable, and reuse shared utilities.

## Testing Requirements (Mandatory)
All delivered code must include tests:
1. **Unit tests** for pure logic/helpers/components with deterministic behavior.
2. **Integration tests** for route/data interactions and auth-protected flows.
3. **End-to-end tests** for primary user journeys.

No feature is complete without passing tests for all three levels.

## Naming Standards
- **Files:** kebab-case for routes/util modules where applicable; follow existing Next.js conventions (`page.tsx`, `route.ts`).
- **Components:** PascalCase (`InterventionDetailClient.tsx`).
- **Functions/variables:** camelCase.
- **Types/interfaces:** PascalCase.
- **Constants:** UPPER_SNAKE_CASE when truly constant; otherwise descriptive camelCase.
- **Database:** snake_case table/column names.
- Prefer clear domain names over abbreviations.

## Branch Naming Standard
Branch names must include GitHub issue number + short description:
- `feat/<issue-number>-<short-description>`
- `fix/<issue-number>-<short-description>`
- `chore/<issue-number>-<short-description>`

Example: `feat/123-csv-upload-whoop-import`

## Delivery Checklist
- Scope matches spec and acceptance criteria.
- Schema/types/docs updated together.
- Tests added and passing (unit, integration, e2e).
- Security/privacy considerations addressed for changed surfaces.
