# Specification Creation Guide (PRD Style)

Use this template for all new feature specs.

## 1) Header
- **Title**
- **Owner**
- **Date**
- **Related issue(s)**
- **Target release / milestone**

## 2) Problem Statement
- What user/business problem exists today?
- Why now?
- What happens if we do nothing?

## 3) Goals and Non-Goals
- **Goals:** measurable outcomes this work must achieve
- **Non-goals:** explicitly out of scope for this phase

## 4) Users and Use Cases
- Primary user personas
- Top user journeys (happy path + important edge cases)

## 5) Functional Requirements
Write requirements as testable statements.
- **FR-1:** ...
- **FR-2:** ...

## 6) Non-Functional Requirements
- Security/privacy requirements
- Performance targets
- Reliability/availability expectations
- Observability/logging requirements

## 7) Detailed Implementation Instructions
Provide enough detail for direct implementation:
- Architecture/design decisions
- Data model/schema changes (tables, columns, constraints, indexes)
- API/routes/components to add or modify
- Validation and error-handling rules
- Migration/backfill plan (if applicable)
- Rollout and rollback approach

## 8) Trunk-Based Delivery Plan (Required)
Describe how this work will land safely to `main` in small slices:
- Planned branch name (`feat/<issue>-...`, `fix/<issue>-...`, or `chore/<issue>-...`)
- Vertical slice plan (what ships in PR1, PR2, etc. if needed)
- Feature flag or non-breaking strategy for incomplete pieces
- Merge cadence (target same day / max ~2 days per branch)
- Rebase/sync plan with trunk to minimize merge conflicts
- Rollback plan if production behavior regresses

## 9) Acceptance Criteria (Required)
Every spec must include explicit acceptance criteria:
- **AC-1:** Given/When/Then ...
- **AC-2:** Given/When/Then ...

Acceptance criteria must be complete enough to drive:
1. unit tests
2. integration tests
3. end-to-end tests

## 10) Test Plan (Required)
List concrete cases and map each AC to all required layers:
- Unit test cases (pure logic/validation/formatting)
- Integration test cases (route handlers, Supabase interactions, auth-protected flows)
- E2E scenarios (primary user journey + key failure path)
- Required test data/fixtures
- Commands/checks that must pass (`npm run lint`, `npm run typecheck`, `npm run build`, `npm test`, plus e2e command if applicable)
- Regression test(s) for each bug fix

## 11) Open Questions / Risks
- Unknowns requiring decision
- Technical or product risks with mitigation

## 12) PR Readiness Checklist (Required)
Before implementation starts, each spec must define:
- Expected commit strategy (small atomic commits, Conventional Commit prefixes)
- PR sizing/slicing plan (single PR or stacked PR sequence)
- Required PR description fields (what, why, risk, rollback)
- Feature-flag plan for incomplete/risky behavior
- Observability updates needed (logs/metrics/alerts)
- Data handling constraints (PII exposure prevention, secret boundaries, server-only credentials)
