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

## 8) Acceptance Criteria (Required)
Every spec must include explicit acceptance criteria:
- **AC-1:** Given/When/Then ...
- **AC-2:** Given/When/Then ...

Acceptance criteria must be complete enough to drive:
1. unit tests
2. integration tests
3. end-to-end tests

## 9) Test Plan
- Unit test cases
- Integration test cases
- E2E scenarios
- Required test data/fixtures

## 10) Open Questions / Risks
- Unknowns requiring decision
- Technical or product risks with mitigation

