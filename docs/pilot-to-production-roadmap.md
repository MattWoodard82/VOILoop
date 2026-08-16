# VOILoop: Pilot → Production Roadmap
**For Matt's Review & Implementation Approval**

---

## 1. Context

Client 2 brings 175–200 users — roughly 5x current scale. This document categorizes every initiative across three tiers: **Must Have**, **Recommended**, and **Nice to Have**, with open issues cross-referenced. Scope recommendations for the open backlog are included at the end.

---

## 2. 🔴 Must Have
*Non-negotiable for operating with a second client at production scale with PHI sensitivity.*

### 2.1 Multi-Tenancy (Issue #18)
The most foundational architectural change. Without it, two clients share the same data boundaries.
- Introduce `organizations` / `pilots` table with lifecycle metadata
- `org_memberships` table: user ↔ org ↔ role
- Add `org_id` FK to all domain tables: challenges, pulse_surveys, interventions, participants, daily_wellness, etc.
- All APIs and queries must be org-scoped — no global reads except for super-admin
- Pilot-switcher UX for operators managing multiple orgs
- Include a tenant onboarding flow to set up a new customer org end-to-end (org creation, role assignment, defaults, and first-access setup)
- Tenant onboarding should include a repeatable checklist or wizard so new customer environments can be provisioned without ad hoc setup
- Backfill existing data to `org_id = 1` (Lyle Pearson)
- **Blocks almost everything else. Do this first.**

### 2.2 Azure PostgreSQL RLS Hardening (Issues #8, #53, #57, #4)
Azure PostgreSQL is the production database, so row-level security and org scoping need to be implemented directly there from the start.
- Enable native Postgres RLS on all browser-accessible PHI tables in Azure PostgreSQL
- Deny-by-default posture + explicit policies per role (`participant`, `wellness_director`, `admin`)
- Keep all high-risk browser writes behind server-side API routes
- CI guardrail: fail schema PRs that introduce new public tables without RLS or org scoping
- Validate that every table used by the app enforces `org_id`-aware access rules in the Azure database

### 2.3 Proper Identity Provider — Replace Custom Login
Current system: custom email/password with forced password change on first login. Does not scale, lacks MFA, lacks enterprise SSO.
- **Recommendation: Clerk** for the near-term product layer — faster to implement, stronger developer experience, polished hosted auth UI, better session/user management primitives, and less custom auth plumbing than Entra
- Clerk is especially attractive if we want to move quickly while keeping the app and identity concerns simple; it reduces implementation time and support burden
- Tradeoff: Clerk is less enterprise-IT-native than Entra External ID and may require later migration if a client demands deeper Azure-native control, SAML-first enterprise integration, or tighter Microsoft ecosystem alignment
- Azure Entra External ID remains the stronger long-term enterprise option, but it is heavier to implement and operate
- Replace Supabase Auth as the identity layer; Supabase continues as the data layer (service role only, no browser Supabase auth calls)
- Benefits: MFA out-of-box, password reset/self-service, audit log, no home-rolled credential handling

### 2.4 Azure Infrastructure & Proper CI/CD
Move from Vercel + manual Supabase CLI deploys to a durable, observable, cost-controlled Azure stack.

**Proposed minimal production stack:**
| Component | Service | Notes |
| --- | --- | --- |
| App hosting | Azure Container Apps or App Service (Linux) | Container Apps preferred for scale-to-zero |
| Database | Azure Database for PostgreSQL Flexible | Replaces Supabase hosted Postgres; retain PG for migration simplicity |
| Auth | Clerk | Replaces Supabase Auth |
| Secrets | Azure Key Vault | All env vars, connection strings |
| Observability | Azure Monitor + Application Insights | Logs, traces, alerts |
| CDN/Edge | Azure Front Door (Basic) | For static assets + WAF |
| IaC | Bicep or Terraform | Codify everything |

**CI/CD pipeline (GitHub Actions → Azure):**
- PR → lint + typecheck + build + unit tests (already passing)
- Merge to `main` → build Docker image → push to Azure Container Registry → deploy to staging slot
- Manual approval gate → promote to production
- Schema migrations: `psql`/Flyway in pipeline, replacing Supabase CLI deploy
- Environment promotion: dev → staging → production with isolated databases


### 2.4.1 4a. Explicit hosted environments
Stand up and document three hosted environments so the team has clear separation between review, validation, and production use.
- **Production** — client-facing, real data only, locked down
- **Staging** — production-like environment for release validation, seeded with realistic data and protected from client traffic
- **Demo** — safe, resettable environment for walkthroughs, sales, and UX testing without risking production data or workflows
- Each environment should have separate auth config, database, secrets, and deploy cadence

### 2.5 Schema Release Pipeline Hardening (Issue #15)
Pre-requisite for safe production database operations with two clients.
- Destructive SQL guards (auto-detect `DROP`, mass `DELETE`, risky constraint changes)
- Post-deploy schema smoke checks
- PR governance: schema checklist required on any migration-touching PR
- Forward-only migration model (already partially in place)

### 2.6 Architecture Quality & Extensibility Pass
The codebase was built rapidly for the pilot and now needs a targeted hardening pass before scaling to a second client and larger data volume.
- Refactor duplicated import, mapping, and persistence patterns into provider-agnostic domain services
- Standardize authz, validation, and error handling across server-side APIs
- Consolidate one-off feature flags / scripts / data handling into documented, testable modules
- Add regression coverage around import flows, role enforcement, token refresh, and dashboard queries
- Remove technical debt that would otherwise make multi-tenancy, API ingestion, and future integrations brittle
- **This is not cosmetic cleanup; it is required foundation work for long-term extensibility.**

### 2.7 Fitbit Integration via Terra
Fitbit should be integrated through Terra so onboarding is easier for new devices and provider-specific complexity stays out of the core app.
- Terra provides a single OAuth widget and a normalized wearable schema, which lets VOILoop add Fitbit without building a second full direct integration stack
- Terra also reduces the amount of Fitbit-specific onboarding work for participants and operators
- **Tradeoffs:** vendor dependency, custom pricing, less direct control over Fitbit data freshness/sync timing, and a normalized schema that may not preserve every Fitbit- or WHOOP-specific field exactly
- **Tradeoff summary:** use Terra to accelerate Fitbit onboarding and keep the codebase simpler, but accept that it adds a third-party layer and may require provider-aware display logic for fields that do not map cleanly
- **Recommendation:** if we do Fitbit next, use Terra rather than a direct Fitbit API integration
- Fitbit should still expose provider-aware onboarding copy and connection status in `/my` so participants know what they are connecting and why

---

## 3. 🟡 Recommended
*Materially improves operations, reliability, or client value. Do within the first 60–90 days of client 2 onboarding.*

### 3.1 SRE / Observability Foundation
With two clients and PHI in play, you need to know about problems before clients do.
- **Application Insights** — trace every API call, capture exceptions
- Structured logging: every API route logs `org_id`, `user_id`, action, duration — no PII in logs
- Synthetic availability monitor: ping key routes every 5 min, alert on failure
- Uptime SLA target: 99.9% (< 44 min downtime/month) — track incidents, build toward it
- On-call runbook and alerting to Slack/Teams for P1s

### 3.2 Pulse Survey v2 (Issue #21)
Complete spec exists. Employee submission flow is expected day-one by a second client.
- Activate employee submission from `/my`
- v2 question set with HRV/RHR context at submission time
- Aggregate dashboard updates for new questions

### 3.3 Performance at 175–200 Users: Database & Query Optimization
Currently built for ~40 users. Required attention areas:
- **Indexing audit:** Add indexes on `(org_id, employee_id)`, `(org_id, date)`, `(period_key)` on high-read tables
- **Pagination:** All list endpoints (team roster, intervention log, import history) must paginate — no unbounded queries
- **Aggregation queries:** Risk scoring and dashboard KPIs should run server-side on a schedule (cron), not inline per page request
- **Connection pooling:** PgBouncer or Azure built-in — 175 concurrent users will exhaust direct PG connection limits
- **Dashboard query budget:** Target P95 < 500ms for all dashboard loads at 200 users

### 3.4 Dashboard Changes for a Larger Participant Group
At 175–200 users, current dashboard patterns break down:
- **Team roster:** Search + multi-column filter (risk tier, submission status, org) — scrolling 175 rows is unusable without it
- **WD KPI cards:** Org-level aggregates + week-over-week trend delta as primary; drill-down available
- **Cohort segmentation:** Filter by department, hire date range, enrollment date — clients will want subgroup comparisons
- **Risk score distribution:** Replace per-person scanning with a histogram/breakdown (X green, Y yellow, Z red) as the primary top-level view
- **Pulse survey completion rate:** Track per-week response rate as a metric in its own right
- **Export:** Wellness Director should be able to export aggregate (never individual) reports as CSV/PDF for client stakeholder reporting
- **Large-cohort seed validation:** Add a reproducible seed profile for **~175 participants** with realistic variation in departments, enrollment dates, device data freshness, pulse completion, submission compliance, and risk distribution so the UX can be exercised before Client 2 goes live
- **Unexpected UI breakpoints:** Expect row-density, filter discoverability, empty/loading states, pagination controls, sticky headers, mobile/tablet overflow, and chart legibility to change once the app is tested with a real 175-person cohort instead of a 9-person demo dataset

### 3.5 Large-Cohort Test Data & UX Validation
Before calling the app "ready" for Client 2, the team should be able to boot a realistic local/staging environment with **175 participants worth of seeded data** and review the main operator and participant flows against it.
- Extend the existing seed system to generate 175 participants across multiple departments / cohorts with realistic biometric spread, participation patterns, and missing-data cases
- Seed multiple behavioral segments on purpose: highly engaged, average, disengaged, recent enrollee, missing uploads, declining trend, red-flag participant
- Seed enough interventions, pulse responses, uploads/sync events, and rewards activity to surface pagination, sorting, and filter problems
- Use this dataset as a formal UX review gate for `/team`, `/wellness-director`, `/pulse`, `/interventions`, `/outcomes`, and `/my`
- Capture resulting UX fixes as first-class scope, not polish; large-cohort testing will likely reveal real information architecture changes
- **Recommendation:** treat this as required validation before finalizing the larger-group dashboard work, because several needed UI changes will only become obvious with realistic volume

### 3.6 User Journey Mapping & Full UX Review
Map the end-to-end journey for participant, wellness director, executive sponsor, and operator across every major page so UX changes are driven by actual workflow friction instead of isolated page fixes.
- Review all pages: `/my`, `/team`, `/wellness-director`, `/pulse`, `/interventions`, `/outcomes`, onboarding, import/connect flows, and admin views
- Identify page-by-page friction, dead ends, inconsistent patterns, unclear hierarchy, and missing state handling
- Convert the journey map into a prioritized UI/UX consistency pass with concrete page-level changes
- Use the 175-participant seed environment as the primary review dataset for this pass

### 3.7 Admin import UI fallback for API sync (Issue #74 dependency)
Keep the admin CSV import UI as a fallback even after API sync is live.
- Participants who don't want to connect their wearable account can still be loaded manually
- Historical backfill remains possible when a participant newly connects
- Failsafe if the API is unavailable or a user's token is revoked
- Fitbit/WHOOP export CSVs still need a parser path

---

## 4. 🟢 Nice to Have
*Real value, but deferrable without risk to client 2 success.*

### 4.1 Anonymized Benchmark Comparisons (Issue #17)
Showing employees how their metrics compare to an anonymized cohort. Valuable for engagement but needs sufficient data volume to be statistically meaningful. Revisit in Q2 of client 2.

### 4.2 Intervention Tracking Logging (Issue #52)
Additional audit trail for intervention actions. Useful for compliance reporting. Bundle lightly with engagement feature work.

### 4.3 WHOOP / Oura API Direct Integration
Direct API sync eliminates all friction but requires OAuth, token management, polling/webhook infrastructure, and a background sync worker. The current import pipeline is CSV/batch-file based: admin uploads through `/admin/import`, the file is parsed in a Next.js route, mappers normalize rows into WHOOP DTOs, persistence upserts to `workouts`, `daily_wellness`, and `habits`, and batch tables record the result. That model does not apply to API responses.

API ingestion needs a per-participant `wearable_connections` table, encrypted access/refresh tokens, a `connect your device` onboarding flow, token refresh handling, and async sync execution. WHOOP and Fitbit both need provider-specific API-to-domain mappers, but the persistence layer should remain source-agnostic.

WHOOP retains full field fidelity and is still the best direct-integration candidate. Fitbit should go through Terra instead of a direct integration because the rate limit, onboarding friction, and provider complexity make it a better fit for normalization.

### 4.4 Multi-Region / Disaster Recovery
Azure PostgreSQL backup + point-in-time restore (PITR) plus a documented recovery runbook is the current DR posture. That covers recovery from data loss/corruption and manual restoration after an outage, but not multi-region active/active resilience or seamless regional failover. RTO/RPO are still to be defined.

---

## 5. Cost Estimate (Azure Production Stack)

| Service | Est. Monthly |
| --- | --- |
| Azure Container Apps (2 replicas, ~2 vCPU) | ~$30–60 |
| Azure PostgreSQL Flexible (Standard_B2ms) | ~$60–80 |
| Azure Entra External ID (≤50K MAU) | Free tier |
| Azure Key Vault | ~$5 |
| Application Insights + Log Analytics | ~$10–30 (depends on ingestion volume) |
| Azure Front Door (Basic) | ~$35 |
| **Total estimate** | **~$140–210/mo** |

Current Vercel Pro + Supabase Pro: ~$45–100/mo. Delta is justified by enterprise observability, security posture, and multi-tenant scale requirements.
