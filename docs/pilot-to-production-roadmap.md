# VOILoop: Pilot → Production Roadmap
**For Matt's Review & Implementation Approval**

---

## 1. Context

Client 2 brings 175–200 users — roughly 5x current scale. This document categorizes every initiative across three tiers: **Must Have**, **Recommended**, and **Nice to Have**, with open issues cross-referenced. Scope recommendations for the open backlog are included at the end.

---

## 2. 🔴 Must Have
*Non-negotiable for operating with a second client at production scale with PHI sensitivity.*

### 2.1 1. Multi-Tenancy (Issue #18)
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

### 2.2 2. Azure PostgreSQL RLS Hardening (Issues #8, #53, #57, #4)
Azure PostgreSQL is the production database, so row-level security and org scoping need to be implemented directly there from the start.
- Enable native Postgres RLS on all browser-accessible PHI tables in Azure PostgreSQL
- Deny-by-default posture + explicit policies per role (`participant`, `wellness_director`, `admin`)
- Keep all high-risk browser writes behind server-side API routes
- CI guardrail: fail schema PRs that introduce new public tables without RLS or org scoping
- Validate that every table used by the app enforces `org_id`-aware access rules in the Azure database
- **Estimated LOE: 3–5 engineering days**

### 2.3 3. Proper Identity Provider — Replace Custom Login
Current system: custom email/password with forced password change on first login. Does not scale, lacks MFA, lacks enterprise SSO.
- **Recommendation: Clerk** for the near-term product layer — faster to implement, stronger developer experience, polished hosted auth UI, better session/user management primitives, and less custom auth plumbing than Entra
- Clerk is especially attractive if we want to move quickly while keeping the app and identity concerns simple; it reduces implementation time and support burden
- Tradeoff: Clerk is less enterprise-IT-native than Entra External ID and may require later migration if a client demands deeper Azure-native control, SAML-first enterprise integration, or tighter Microsoft ecosystem alignment
- Azure Entra External ID remains the stronger long-term enterprise option, but it is heavier to implement and operate
- Replace Supabase Auth as the identity layer; Supabase continues as the data layer (service role only, no browser Supabase auth calls)
- Benefits: MFA out-of-box, password reset/self-service, audit log, no home-rolled credential handling
- **LOE: ~1–2 weeks including integration testing**

### 2.4 4. Azure Infrastructure & Proper CI/CD
Move from Vercel + manual Supabase CLI deploys to a durable, observable, cost-controlled Azure stack.

**Proposed minimal production stack:**
| Component | Service | Notes |
|---|---|---|
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

**Estimated LOE: 3–5 weeks** (can run parallel to RLS hardening)

### 2.4.1 4a. Explicit hosted environments
Stand up and document three hosted environments so the team has clear separation between review, validation, and production use.
- **Production** — client-facing, real data only, locked down
- **Staging** — production-like environment for release validation, seeded with realistic data and protected from client traffic
- **Demo** — safe, resettable environment for walkthroughs, sales, and UX testing without risking production data or workflows
- Each environment should have separate auth config, database, secrets, and deploy cadence

### 2.5 5. Schema Release Pipeline Hardening (Issue #15)
Pre-requisite for safe production database operations with two clients.
- Destructive SQL guards (auto-detect `DROP`, mass `DELETE`, risky constraint changes)
- Post-deploy schema smoke checks
- PR governance: schema checklist required on any migration-touching PR
- Forward-only migration model (already partially in place)
- **LOE: 2–3 days**

### 2.6 6. Architecture Quality & Extensibility Pass
The codebase was built rapidly for the pilot and now needs a targeted hardening pass before scaling to a second client and larger data volume.
- Refactor duplicated import, mapping, and persistence patterns into provider-agnostic domain services
- Standardize authz, validation, and error handling across server-side APIs
- Consolidate one-off feature flags / scripts / data handling into documented, testable modules
- Add regression coverage around import flows, role enforcement, token refresh, and dashboard queries
- Remove technical debt that would otherwise make multi-tenancy, API ingestion, and future integrations brittle
- **This is not cosmetic cleanup; it is required foundation work for long-term extensibility.**
- **LOE: 1–2 weeks for a focused pass, with follow-on cleanup tracked as part of the build**

### 2.7 7. Fitbit Integration via Terra
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

### 3.1 9. SRE / Observability Foundation
With two clients and PHI in play, you need to know about problems before clients do.
- **Application Insights** — trace every API call, capture exceptions
- Structured logging: every API route logs `org_id`, `user_id`, action, duration — no PII in logs
- Synthetic availability monitor: ping key routes every 5 min, alert on failure
- Uptime SLA target: 99.9% (< 44 min downtime/month) — track incidents, build toward it
- On-call runbook and alerting to Slack/Teams for P1s
- **LOE: 1 week to implement basics; ongoing ops discipline**

### 3.2 10. Pulse Survey v2 (Issue #21)
Complete spec exists. Employee submission flow is expected day-one by a second client.
- Activate employee submission from `/my`
- v2 question set with HRV/RHR context at submission time
- Aggregate dashboard updates for new questions
- **LOE: 1–2 weeks**

### 3.3 11. Performance at 175–200 Users: Database & Query Optimization
Currently built for ~40 users. Required attention areas:
- **Indexing audit:** Add indexes on `(org_id, employee_id)`, `(org_id, date)`, `(period_key)` on high-read tables
- **Pagination:** All list endpoints (team roster, intervention log, import history) must paginate — no unbounded queries
- **Aggregation queries:** Risk scoring and dashboard KPIs should run server-side on a schedule (cron), not inline per page request
- **Connection pooling:** PgBouncer or Azure built-in — 175 concurrent users will exhaust direct PG connection limits
- **Dashboard query budget:** Target P95 < 500ms for all dashboard loads at 200 users
- **LOE: 1 week audit + targeted fixes**

### 3.4 12. Dashboard Changes for a Larger Participant Group
At 175–200 users, current dashboard patterns break down:
- **Team roster:** Search + multi-column filter (risk tier, submission status, org) — scrolling 175 rows is unusable without it
- **WD KPI cards:** Org-level aggregates + week-over-week trend delta as primary; drill-down available
- **Cohort segmentation:** Filter by department, hire date range, enrollment date — clients will want subgroup comparisons
- **Risk score distribution:** Replace per-person scanning with a histogram/breakdown (X green, Y yellow, Z red) as the primary top-level view
- **Pulse survey completion rate:** Track per-week response rate as a metric in its own right
- **Export:** Wellness Director should be able to export aggregate (never individual) reports as CSV/PDF for client stakeholder reporting
- **Large-cohort seed validation:** Add a reproducible seed profile for **~175 participants** with realistic variation in departments, enrollment dates, device data freshness, pulse completion, submission compliance, and risk distribution so the UX can be exercised before Client 2 goes live
- **Unexpected UI breakpoints:** Expect row-density, filter discoverability, empty/loading states, pagination controls, sticky headers, mobile/tablet overflow, and chart legibility to change once the app is tested with a real 175-person cohort instead of a 9-person demo dataset
- **LOE: 2–3 weeks of UI work**

### 3.5 13. Large-Cohort Test Data & UX Validation
Before calling the app "ready" for Client 2, the team should be able to boot a realistic local/staging environment with **175 participants worth of seeded data** and review the main operator and participant flows against it.
- Extend the existing seed system to generate 175 participants across multiple departments / cohorts with realistic biometric spread, participation patterns, and missing-data cases
- Seed multiple behavioral segments on purpose: highly engaged, average, disengaged, recent enrollee, missing uploads, declining trend, red-flag participant
- Seed enough interventions, pulse responses, uploads/sync events, and rewards activity to surface pagination, sorting, and filter problems
- Use this dataset as a formal UX review gate for `/team`, `/wellness-director`, `/pulse`, `/interventions`, `/outcomes`, and `/my`
- Capture resulting UX fixes as first-class scope, not polish; large-cohort testing will likely reveal real information architecture changes
- **Recommendation:** treat this as required validation before finalizing the larger-group dashboard work, because several needed UI changes will only become obvious with realistic volume
- **LOE: 2–4 days for seed generation + 2–5 days of follow-on UX fixes discovered from review**

### 3.6 14. User Journey Mapping & Full UX Review
Map the end-to-end journey for participant, wellness director, executive sponsor, and operator across every major page so UX changes are driven by actual workflow friction instead of isolated page fixes.
- Review all pages: `/my`, `/team`, `/wellness-director`, `/pulse`, `/interventions`, `/outcomes`, onboarding, import/connect flows, and admin views
- Identify page-by-page friction, dead ends, inconsistent patterns, unclear hierarchy, and missing state handling
- Convert the journey map into a prioritized UI/UX consistency pass with concrete page-level changes
- Use the 175-participant seed environment as the primary review dataset for this pass
- **LOE: 1–2 weeks including review, synthesis, and first implementation batch**

### 3.7 15. Admin import UI fallback for API sync (Issue #74 dependency)
Keep the admin CSV import UI as a fallback even after API sync is live.
- Participants who don't want to connect their wearable account can still be loaded manually
- Historical backfill remains possible when a participant newly connects
- Failsafe if the API is unavailable or a user's token is revoked
- Fitbit/WHOOP export CSVs still need a parser path
- **LOE: 1–2 days**

---

## 4. 🟢 Nice to Have
*Real value, but deferrable without risk to client 2 success.*

### 4.1 16. Anonymized Benchmark Comparisons (Issue #17)
Showing employees how their metrics compare to an anonymized cohort. Valuable for engagement but needs sufficient data volume to be statistically meaningful. Revisit in Q2 of client 2.

### 4.2 17. Intervention Tracking Logging (Issue #52)
Additional audit trail for intervention actions. Useful for compliance reporting. Bundle lightly with engagement feature work; low LOE.

### 4.3 18. WHOOP / Oura API Direct Integration
Direct API sync eliminates all friction but requires OAuth, token management, polling/webhook infrastructure, and a background sync worker. The current import pipeline is CSV/batch-file based: admin uploads through `/admin/import`, the file is parsed in a Next.js route, mappers normalize rows into WHOOP DTOs, persistence upserts to `workouts`, `daily_wellness`, and `habits`, and batch tables record the result. That model does not apply to API responses.

API ingestion needs a per-participant `wearable_connections` table, encrypted access/refresh tokens, a `connect your device` onboarding flow, token refresh handling, and async sync execution. WHOOP and Fitbit both need provider-specific API-to-domain mappers, but the persistence layer should remain source-agnostic.

WHOOP retains full field fidelity and is still the best direct-integration candidate. Fitbit should go through Terra instead of a direct integration because the rate limit, onboarding friction, and provider complexity make it a better fit for normalization.

### 4.4 19. Multi-Region / Disaster Recovery
Azure PostgreSQL backup + point-in-time restore (PITR) plus a documented recovery runbook is the current DR posture. That covers recovery from data loss/corruption and manual restoration after an outage, but not multi-region active/active resilience or seamless regional failover. RTO/RPO are still to be defined.

---

## 5. Sequencing Recommendation

```
Week 1–2:   RLS hardening (#8, #53) → unblocks safe client 2 data
Week 2–4:   Multi-tenancy schema + APIs (#18) → unblocks org isolation
Week 2–6:   Azure infra + CI/CD (#4) → run parallel to above
Week 2–4:   Architecture quality + extensibility pass → reduces pilot-era debt before bulk scale work
Week 3–4:   Self-import + submission tracking (#74, #9)
Week 4–5:   Identity provider migration (Clerk)
Week 5–6:   Schema pipeline hardening (#15)
Week 6–7:   Large-cohort seed dataset (175 participants) + UX review pass
Week 7–8:   Pulse v2 (#21) + dashboard scaling changes + performance tuning
Week 8–12:  New page/journey UX review + consistency pass
Ongoing:    Observability, benchmarks, API direct integrations
```

---

## 6. Cost Estimate (Azure Production Stack)

| Service | Est. Monthly |
|---|---|
| Azure Container Apps (2 replicas, ~2 vCPU) | ~$30–60 |
| Azure PostgreSQL Flexible (Standard_B2ms) | ~$60–80 |
| Azure Entra External ID (≤50K MAU) | Free tier |
| Azure Key Vault | ~$5 |
| Application Insights + Log Analytics | ~$10–30 (depends on ingestion volume) |
| Azure Front Door (Basic) | ~$35 |
| **Total estimate** | **~$140–210/mo** |

Current Vercel Pro + Supabase Pro: ~$45–100/mo. Delta is justified by enterprise observability, security posture, and multi-tenant scale requirements.

---

*Document version: 2026-08-05 | Author: Garrison Neely | For: Matt Woodard review*

---

## 7. Appendix A: API Ingestion — Architecture, Application Changes, and Integrator Decision

### 7.1 The shift from manual CSV upload to automated API ingestion

Moving from "Matt uploads an XLSX once a week" to "data arrives automatically when participants sync their devices" is not just a backend plumbing change. It touches the data model, the import pipeline, the application surface, token management infrastructure, and the background job layer. This section documents what changes and why.

---

### 8.2 What the current import pipeline does (and what must change)

The current pipeline is designed around **batch file uploads**:

1. Admin uploads an XLSX or CSV zip through `/admin/import`
2. The file is parsed in-memory inside a Next.js API route (`/api/import/whoop/route.ts`)
3. Parser extracts Exercise, Stress/Sleep, and Manual Entries tabs
4. Mappers normalize rows into `WhoopWorkout`, `WhoopWellness`, and `WhoopHabit` DTOs
5. Persistence layer upserts to `workouts`, `daily_wellness`, and `habits` with `source_batch_id` tracking
6. `upload_batches` and `import_row_outcomes` record the result

The WHOOP CSV column names (`Recovery score %`, `Heart rate variability (ms)`, etc.) are mapped directly. The Stress/Sleep merge logic, cycle-start date resolution, and habit question-to-column pivoting are all specific to how WHOOP structures its export files.

**None of this logic applies to an API response.** The API returns structured JSON with different field names, different granularity, and different object shapes than the CSV export.

---

### 8.3 Application changes required for API ingestion

#### 8.3.1 1. OAuth token management infrastructure (new)
This is the largest new system. Every participant must independently authorize VOILoop to access their wearable account. Per-user tokens must be stored securely and kept fresh.

- **New DB table: `wearable_connections`** — stores per-participant OAuth tokens
  - `participant_id`, `provider` (whoop | fitbit), `access_token` (encrypted), `refresh_token` (encrypted), `token_expires_at`, `scope`, `connected_at`, `last_sync_at`, `status` (active | revoked | error)
  - Tokens must be encrypted at rest (Azure Key Vault or column-level encryption)
- **New UI flow: "Connect your device"** — participants visit `/my/connect` and initiate OAuth with their wearable provider. This replaces admin-mediated onboarding for data collection
- **Token refresh service** — access tokens expire (WHOOP: typically 1 hour; Fitbit: 8 hours). A background job must check expiry and refresh proactively before sync jobs run
- **Revocation handling** — when a participant disconnects or revokes consent in the wearable app, the API will return 401; the sync system must handle this gracefully and update `status = 'revoked'`

#### 8.3.2 2. New background sync worker (new — cannot run in Next.js API routes)
API-driven sync jobs run on a schedule or on webhook trigger — not during a user's HTTP request. **Next.js serverless functions (Vercel or Azure) have a maximum execution time of 10–60 seconds and are not appropriate for bulk historical backfill or multi-participant batch sync.**

Options in the Azure stack:
- **Azure Container Apps Jobs** (recommended) — scheduled or event-triggered, same container image as the web app, scales to zero when idle
- **Azure Functions with timer trigger** — simpler for periodic tasks, cold-start latency acceptable for non-time-sensitive sync
- The worker should: iterate active connections → check last sync → call provider API for new data since last sync → normalize → upsert via the same persistence layer → update `last_sync_at`

#### 8.3.3 3. New API-to-domain mappers (new)
The existing `src/lib/whoop/mappers.ts` maps CSV column names. API responses have completely different shapes. New mappers are needed per provider:

**WHOOP API data model** (from `api.prod.whoop.com/developer/v1`):
- `GET /v1/recovery` → recovery score, HRV (rmssd), resting HR, SPO2, skin temp, respiratory rate, sleep performance, sleep consistency — maps to `daily_wellness`
- `GET /v1/sleep` → sleep stage durations (light, REM, deep, awake), efficiency, debt, need — additional `daily_wellness` fields
- `GET /v1/workout` → activity type, strain, duration, calories, max HR, avg HR, HR zones — maps to `workouts`
- `GET /v1/cycle` → day strain, kilojoules — maps to `daily_wellness.day_strain`
- WHOOP uses cycle-based time (a "day" is anchored to sleep cycle start, not calendar midnight) — the current CSV Stress/Sleep merge logic handles this same ambiguity; the API mapper must too

**Fitbit API data model** (see next section for full comparison):
- `GET /1/user/-/sleep/date/{date}.json` → sleep stages, efficiency, duration, HRV — maps to `daily_wellness`
- `GET /1/user/-/activities/heart/date/{date}/1d.json` → resting HR, HR zones — maps to `daily_wellness`
- `GET /1/user/-/hrv/date/{date}.json` → daily HRV (RMSSD) — maps to `daily_wellness.hrv_ms`
- `GET /1/user/-/activities/list.json` → workout log — maps to `workouts`
- `GET /1/user/-/body/temperature/skin/date/{date}.json` → skin temp
- `GET /1/user/-/spo2/date/{date}.json` → blood oxygen
- Fitbit **does not have a recovery score** equivalent to WHOOP's composite Recovery %. Fitbit has a "Cardio Fitness Score (VO2 Max)" but it is not the same concept. This is a schema gap to address (see below)

#### 8.3.4 4. Data model changes: provider-agnostic schema
The current `daily_wellness` and `workouts` tables are implicitly WHOOP-shaped (field names like `sleep_consistency` and `day_strain` are WHOOP-specific concepts). Adding Fitbit requires decisions:

- Add `data_source` column to `daily_wellness`, `workouts`, and `habits` (values: `whoop_csv`, `whoop_api`, `fitbit_api`, `manual`) — critical for knowing what source a row came from and for dedup logic
- `recovery_score` is WHOOP-proprietary. Fitbit has no direct equivalent. Options:
  1. Leave it null for Fitbit participants; dashboard components must render gracefully when null
  2. Compute a proxy score from available Fitbit signals (HRV, resting HR, sleep efficiency) — but this is custom logic and should be clearly labeled as "estimated" not vendor recovery score
- `day_strain` is WHOOP-specific. Fitbit equivalent is active zone minutes or activity score — new field or different mapping
- **Recommendation:** Add a `device_type` column and make recovery/strain fields nullable with provider-aware display logic in the UI

#### 8.3.5 5. Webhook ingestion endpoint (new, recommended for Fitbit)
Fitbit offers a Subscription API (webhooks) that pushes a notification when new data is available for a user. This is strongly preferred over polling because:
- Fitbit rate limit: **150 requests/hour per user token** — with 175+ users, polling all users every hour consumes 175+ API calls just for existence checks before fetching any data
- Fitbit subscription webhooks notify on new sleep, activity, heart rate, and body data
- WHOOP also supports webhooks — check your developer app configuration

Webhook handler: new Next.js API route `POST /api/webhooks/fitbit` and `POST /api/webhooks/whoop` that validates the request signature and enqueues a sync job for the affected user. The actual data fetch happens asynchronously in the worker.

#### 8.3.6 6. Import History and submission tracking rethink (Issue #74 dependency)
The current `upload_batches` table tracks admin-uploaded files. With API sync, "upload" is no longer the right concept:
- Rename or extend `upload_batches` → `sync_events` with `source_type: 'csv_upload' | 'api_sync' | 'webhook_trigger'`
- The per-week submission tracking from Issue #74 still works — just populated by API sync events instead of file uploads
- The Wellness Director submission visibility card ("24 of 37 submitted — 65%") becomes "24 of 37 synced this week" — same concept, different mechanism

#### 8.3.7 7. Admin import UI remains needed (nice to have)
Even with full API integration, admin CSV upload should stay for:
- Participants who don't want to connect their wearable account (consent is voluntary)
- Historical backfill when a participant newly connects and you want their prior data
- Failsafe when API is unavailable or a user's token is revoked
- Fitbit/WHOOP export CSVs have different formats — Fitbit CSVs would need their own mapper

#### 8.3.8 8. Participant onboarding flow changes
Current: admin provisions accounts, Matt imports their data. API model:
1. Admin provisions account (unchanged)
2. Participant logs in for the first time → `/my` shows "Connect your WHOOP" or "Connect your Fitbit" CTA
3. Participant completes OAuth → token stored → initial historical backfill job triggered (last 90 days or enrollment date, whichever is more recent)
4. Daily sync runs automatically thereafter

This is a meaningful UX and trust change — participants must actively consent to data sharing rather than having it done by their employer. This is arguably a **positive** privacy signal consistent with VOILoop's positioning.

---

### 8.4 WHOOP vs Fitbit: data richness comparison

| Metric | WHOOP API | Fitbit API | Notes |
|---|---|---|---|
| Recovery score | ✅ Proprietary composite (0–100) | ❌ No equivalent | WHOOP's core differentiator |
| HRV (rmssd) | ✅ Daily | ✅ Daily (during sleep) | Both available; methodology differs slightly |
| Resting heart rate | ✅ | ✅ | Comparable |
| Sleep stages (light/deep/REM) | ✅ | ✅ | Both available |
| Sleep efficiency | ✅ | ✅ | Both available |
| Sleep debt / sleep need | ✅ | ❌ | WHOOP-specific calculated metrics |
| Sleep consistency | ✅ | ❌ | WHOOP-specific |
| Day strain | ✅ Proprietary (0–21) | ❌ | Active Zone Minutes is partial equivalent |
| Blood oxygen (SpO2) | ✅ | ✅ | Both available |
| Skin temperature | ✅ | ✅ (Sense/Versa 3+) | Device-dependent for Fitbit |
| Respiratory rate | ✅ | ✅ (Breathing Rate endpoint) | Both available |
| Workout detection | ✅ | ✅ | Both with HR zones |
| Cardio fitness (VO2 Max) | ❌ | ✅ | Fitbit advantage |
| Webhooks | ✅ | ✅ (Subscription API) | Both push models available |
| Developer program | Self-service, free | Self-service, free | See notes below |
| Rate limits | Not publicly published | 150 req/hr per user | Fitbit more restrictive |

**WHOOP developer program:** Self-service registration at developer-dashboard.whoop.com. Create a Team, create an App, configure scopes and redirect URIs. No approval gate for standard access. Up to 5 apps per team.

**Fitbit developer program:** Self-service at dev.fitbit.com/apps. Standard access (all scopes except intraday) requires registration only. **Intraday data** (granular HR, HRV throughout the day, not just daily summaries) requires a formal application and approval process, and commercial use is reviewed individually. For VOILoop's current use case (daily summaries: resting HR, daily HRV, sleep stages) standard access is sufficient and does not require approval.

**Key Fitbit limitation:** Fitbit is a Google product. The Fitbit API has historically been deprioritized since the Google acquisition (2021). There are no signals of API deprecation, but this is a real vendor risk over a 3–5 year horizon.

---

### 8.5 Do current tooling and framework choices matter?

**Next.js 14 (App Router) — assessment: stay, with architectural additions**

Next.js is the right choice for the web application layer. The App Router's server components and route handlers handle the OAuth callback, token exchange, and webhook ingestion well. What Next.js cannot do:

- **Long-running sync jobs.** Vercel serverless functions max out at 60 seconds (Pro tier). Azure Container Apps has no such limit, but even there, running a 200-user sync in a route handler is wrong architecture. The sync worker should be a separate process (Azure Container Apps Job or Azure Function with timer trigger). The Next.js app triggers and monitors jobs; it does not run them.
- **Webhook delivery timing.** Fitbit and WHOOP webhook deliveries must be acknowledged within a few seconds (200 OK). The handler should write the event to a queue (Azure Service Bus or a simple `pending_sync_events` table) and return immediately. The worker consumes the queue asynchronously.

**Supabase (current) / Azure PostgreSQL (proposed) — assessment: schema changes needed, engine doesn't matter**

The underlying Postgres engine is compatible with both. The schema additions described above (wearable_connections, device_type column, data_source column, sync_events) are straightforward migrations regardless of host.

**TypeScript — assessment: no change needed, well-positioned**

The existing mapper/validator/persistence pattern in `src/lib/whoop/` is well-structured for adding new provider modules alongside it (`src/lib/fitbit/`, `src/lib/terra/`). The `WhoopWellness` DTO shape should be generalized to a `DailyWellnessRecord` interface that both WHOOP and Fitbit mappers produce.

**Key refactor:** Rename or alias the `WhoopWellness` / `WhoopWorkout` types to provider-agnostic names (`DailyWellnessRecord`, `WorkoutRecord`) so the persistence layer is source-agnostic. The WHOOP CSV mapper continues to produce these types. The new API mapper produces the same types. The upsert functions in `persistence.ts` change nothing.

---

### 8.7 Summary: what must be built for API ingestion

| Component | Effort | Notes |
|---|---|---|
| `wearable_connections` table + token encryption | 2–3 days | New migration + Key Vault integration |
| "Connect your device" OAuth flow (participant UI) | 3–4 days | Per provider; WHOOP first |
| Token refresh background service | 2 days | Run in Container Apps Job or Function |
| WHOOP API mapper (JSON → domain DTOs) | 2–3 days | Different from CSV mapper; same output types |
| Fitbit API mapper (via Terra normalization) | 2–4 days | Terra handles provider OAuth + normalized schema |
| Background sync worker | 3–4 days | Scheduled Container Apps Job |
| Webhook ingestion endpoints | 1–2 days | Per provider; quick-ack + queue pattern |
| `sync_events` table / upload_batches extension | 1 day | Replace file-upload concept with sync concept |
| UI: device connection status on `/my` | 1 day | Show connected/last synced state |
| Admin import: keep + add Fitbit CSV mapper if needed | 1–2 days | Fitbit CSV has different column format |
| DTO generalization (WHOOP-specific types → agnostic) | 1 day | Refactor; no behavior change |
| **Total estimate** | **~3–5 weeks** | Can phase: WHOOP API first, Fitbit second |

---

## 9. Appendix B: Personas & Key Journey Moments

*This is a living reference, not a finished artifact. Edit it as you learn more from Client 2.*

The goal is not to produce a wall poster. It is to have a shared answer to "who is this for and what do they need at this moment?" that actually changes what gets built and how it gets prioritized.

---

### 9.1 The Four Personas

---

#### 9.1.1 Persona 1: The Participant
**Archetype:** Travis Brandenburgh (Client 1 COO), and the 174 people like him at Client 2

**Who they are:**
An employee who agreed to participate in a wellness program. They have varying levels of buy-in — some are genuinely motivated, some are there for the PTO incentive, some signed up because their manager did. They wear a WHOOP or Fitbit. They are not necessarily tech-forward or data-literate beyond "my recovery was 72% today."

**What they care about:**
- Am I getting better? Am I trending the right direction?
- How do I compare to myself (not others — they raised this concern themselves)
- Am I doing anything "wrong"?
- Is this worth my time? What's in it for me?

**What they fear:**
- Their employer seeing their individual data and using it against them (Travis raised this *on his own call* while simultaneously building a leaderboard — the tension is real)
- Being judged for low scores during bad weeks (travel, illness, stress)
- Having their private health data stored somewhere they don't control

**Their relationship with VOILoop:**
Mostly passive consumers. They upload data (or in the future, sync their device). They check their `/my` dashboard occasionally, more often when Heather sends a nudge. They answer pulse surveys when prompted. They want a short, rewarding experience — not a second job.

**Key moments that matter:**
| Moment | What they need | What currently exists | Gap |
|---|---|---|---|
| First login | Understand why they're here, what's safe, what they'll get back | Account provisioning → password change → dashboard | No welcome context, no consent clarity, no "here's what you'll see" |
| Onboarding intake | Trust that data is safe; quick and purposeful | Spec'd in Issue #19, not yet built | Missing entirely |
| Connecting their device (future) | Confidence that only the right data is shared | Not yet built | Full OAuth connect flow needed |
| Weekly check-in | Quick summary: how'd I do? What stood out? | `/my` dashboard with metrics | Personal baseline comparisons missing (Issue #66 FR-11/12) |
| Receiving a nudge | Feel seen, not managed | Weekly nudge (broadcast only) | No personalized nudge; no reply mechanism |
| Pulse survey | Fast, relevant, not repetitive | Survey exists but submission flow not live | Issue #21 |
| Earning points / rewards | Know the rules, feel it's fair | Performance Points behind feature flag | Rules page and redemption flow not live (Issue #66 FR-9/10) |
| Bad week | Not feel like a failure; understand context | No grace messaging | No "you traveled 4 days" context; no cold-start grace on dashboards |

**Design implications:**
- Personal baseline comparisons (vs. *your own* history) matter more than cohort comparisons
- The privacy framing on every data-touching surface must be explicit and consistent — "Heather can see your trends; your employer cannot see your individual scores"
- Onboarding and device connect must feel like opt-in, not opt-out
- Short-form interaction is the norm; deep dives are opt-in

---

#### 9.1.2 Persona 2: The Wellness Director
**Archetype:** Heather (Client 1), and her equivalent at Client 2

**Who they are:**
A health professional employed by or contracted to the client organization. She is the human in the loop that makes VOILoop different from an automated wellness app. She knows participants personally. She has the context that no algorithm has. Her job is to identify who needs attention and act on it — not to manage a dashboard.

**What they care about:**
- Who is at risk right now, and why?
- Did the nudge I sent last week land?
- Am I spending my time on the right people?
- Can I show my employer this program is working?

**What they fear:**
- Missing someone who needs help because the dashboard didn't surface them
- Being overwhelmed with data and no clear "here's what to do"
- A participant who falls through the cracks between uploads or surveys
- Looking ineffective to the executive sponsor at review time

**Their two operating modes (currently conflated, should be separated):**
1. **Proactive mode (weekly):** Review the cohort, send nudges, check submission compliance, plan outreach
2. **Reactive mode (anytime):** Someone was just flagged. What do I know? What do I do? What did I do last time?

**Key moments that matter:**
| Moment | What they need | What currently exists | Gap |
|---|---|---|---|
| Monday morning review | Fast cohort snapshot: who submitted, who didn't, any flags | Team roster + KPI cards | No submission compliance view; no risk tiers (Issue #66, #74) |
| Sending nudges | Target by individual or subgroup; attach a question for reply | Broadcast-only nudge | Targeted send + reply box missing (Issue #66 FR-7/8) |
| Reviewing pulse results | Trend + context, not just this week's average | `/pulse` dashboard | No completion rate as a signal; limited WD context view |
| Responding to a red flag | Who is this person? What's their history? What have I done before? | Participant detail view | Intervention log incomplete; no "last contacted" visibility |
| End-of-month reporting | Show the exec sponsor the program is working | `/outcomes` | Needs export capability; aggregate-only framing for stakeholder reports |
| Onboarding a new participant | Know when they're ready, consent captured | Admin panel | No onboarding completion dashboard; Issue #19 not built |

**Design implications:**
- The WD dashboard at 175 users must lead with **exceptions and flags**, not a full roster scroll
- Heather needs to see the *reason* for a flag (which components triggered it), not just the flag color — already in Issue #66 FR-15
- "Last contacted" and intervention history belong on the participant detail view, not buried in a separate log
- Weekly WD workflow should have a clear entry point: "Here's what needs your attention this week" as the primary landing state

---

#### 9.1.3 Persona 3: The Executive Sponsor / Buyer
**Archetype:** Travis in his *buyer* role (distinct from his participant role), and the equivalent at Client 2

**Who they are:**
The person who approved the program, writes the check, and will decide whether to renew. They are typically a C-suite or VP-level leader. They have access to aggregate data but must never see individual employee wellness scores. They want to validate the ROI of the program without managing it day-to-day.

**What they care about:**
- Is this working? Can I prove it to my CFO?
- What does program engagement look like across the org?
- Are we avoiding the liability issues we were worried about?
- What does renewal/expansion look like?

**What they fear:**
- Being asked to renew a program they can't quantify
- A compliance or privacy incident they didn't see coming
- Data that looks good in the dashboard but doesn't translate to business outcomes

**Travis's specific tension (Client 1):**
Travis is *both* a participant and the buyer. He built his own competing prototype that showed real coworker names in a leaderboard. He raised the ADA-adjacent risk himself — which means he is simultaneously the most privacy-sensitive person in the room *and* the one who built the privacy violation. VOILoop's privacy model must be **visible and legible** to him in the product UI, not just technically correct in the database.

**Key moments that matter:**
| Moment | What they need | What currently exists | Gap |
|---|---|---|---|
| Monthly review | Cohort-level outcomes: engagement trends, avg recovery, program ROI | `/outcomes` page | Needs cleaner aggregate-only framing; VOI calculation explanation |
| Renewal conversation | Before/after comparison; "here's what changed" narrative | Outcomes page exists | Needs exportable summary; narrative framing |
| First sign-in (as participant) | Immediately understand the privacy model | No explicit welcome context | Privacy positioning not surfaced in-product |
| Exec-level nudge (Issue #66 FR-5) | Cohort-wide observations, no individual data | Not yet built | Exec nudge tier needed |
| Accidentally navigating somewhere with individual data | Reassurance they cannot see it | RLS hardening pending | Depends on #8 completion; UI-level labeling also needed |

**Design implications:**
- The `/outcomes` page is the buyer's primary surface — it should present aggregate trends and VOI narrative, not raw tables
- VOI (Value on Investment) calculation must be explainable and defensible, not a black-box number
- The exec-level nudge (FR-5) gives the buyer a weekly signal the program is active and producing insight
- Privacy model should be *shown* in the UI — a visible "Wellness Director view only" label on sensitive fields builds trust with buyers who are also participants

---

#### 9.1.4 Persona 4: The VOILoop Operator
**Archetype:** Matt and Garrison

**Who they are:**
The small team running the platform across multiple clients. At current scale this means Matt is doing everything from client onboarding to data imports to support. The operator persona exists to design a platform where each new client does *not* linearly increase Matt's workload.

**What they care about:**
- Can I onboard a new client without a custom engineering sprint?
- Can I monitor the health of all client environments from one place?
- When something breaks, do I find out before the client does?
- Can participants self-serve enough that I'm not the first line of support?

**What they fear:**
- A client escalation they didn't see coming
- Manual work that scales with user count (currently: importing CSVs for 200 people)
- A data incident that crosses client boundaries
- Spending more time on platform operations than on product and sales

**Key moments that matter:**
| Moment | What they need | What currently exists | Gap |
|---|---|---|---|
| Onboarding a new client org | Create org, provision WD + admin accounts, configure settings | Manual + ad-hoc | No multi-tenant admin panel; no org onboarding checklist |
| Weekly data ingestion | Participants submit their own data; compliance visible | Matt imports manually | Issue #74; self-service import + submission tracking |
| Something breaks | Alert before client calls; structured runbook | RUNBOOK.md (text only) | No automated alerting; SRE baseline not built |
| Client asks "how's the program going?" | Pull aggregate report in < 5 minutes | Requires screen-sharing dashboard | Export capability missing |
| Renewal / end of pilot | Clean summary of outcomes and engagement | `/outcomes` exists | Needs executive-ready export format |
| Adding a second device type | Configure new provider without a code deploy | Everything hardcoded to WHOOP | Device-agnostic ingestion layer not yet built |

**Design implications:**
- The multi-tenant admin panel is as much about reducing Matt's workload as it is about data isolation
- Self-service import (Issue #74) directly translates to N fewer hours per week as user count grows
- Observability (alerts, structured logs) means Matt knows about problems before the client does
- Org-level configuration (WD assignment, scoring weights, device types) should be data-driven and admin-manageable, not code deploys

---

### 9.2 Journey Intersection Map

Where personas collide at the same moment — these are the highest-leverage design points:

| Moment | Personas | Design requirement |
|---|---|---|
| Weekly data sync | Participant submits → Operator confirms → WD sees compliance | Submission tracking visible to WD (Issue #74); no operator manual step |
| Nudge cycle | WD composes → Participant receives + replies → WD reads reply | Targeted nudge + reply inbox (Issue #66 FR-6/7/8) |
| Risk flag surfaces | WD reviews → acts on intervention → logs it | Flag reason visible; intervention log updated; snooze available (FR-15/18) |
| Monthly report | WD prepares → Exec Sponsor reviews | Export: aggregate-only, no individual data, exportable summary |
| New participant onboarding | Operator provisions → Participant completes intake → WD sees ready | Onboarding completion visible to WD; privacy consent captured (Issue #19) |
| Renewal conversation | Exec Sponsor asks for outcomes → Operator/WD produces evidence | Exportable outcomes summary; VOI framing; before/after comparison |

---

### 9.3 What this changes about prioritization

1. **Onboarding (Issue #19) is higher priority than it currently appears.** It is the entry point for the Participant's trust relationship with the product, and it unblocks the WD's visibility into participant readiness. At 175 users, launching without it means 175 people hit an unclear first experience.

2. **The WD dashboard redesign should lead with exceptions.** At 175 users, Heather cannot scan a roster. The primary landing view should be "X people need attention this week" with the full list as a secondary drill-down.

3. **The exec-level nudge (FR-5 in Issue #66) is underweighted in the current roadmap.** It directly serves the Buyer persona's need to feel the program is active and producing value without being shown individual data. It is also a natural touch point in the renewal cycle.

4. **Export capability is a renewal blocker.** Every buyer renewal conversation eventually becomes "can you send me a summary?" A basic PDF/CSV export of aggregate outcomes should move from Nice to Have to Recommended.

5. **Privacy labeling should be a UI concern, not just a backend concern.** The Buyer-as-Participant tension (Travis) is best resolved by making the privacy model *visible* at the surfaces where it matters, not just enforced at the database layer.
