# A La Carte Feature Estimate: Terra/Device Integration Build-Out

## How to read this doc
Each feature below is scoped as if **one 20-year software architect** implements it solo, end-to-end (design, code, tests, docs), with no team to parallelize against. Two estimates are given:
- **Human-only**: no AI coding agent, traditional IDE/tooling only.
- **Agent-assisted**: same architect, working with a current-generation coding agent (e.g., this CLI) for scaffolding, boilerplate, test generation, and research lookups, while the architect retains all design decisions, review, and integration judgment.

Cost = `hours x $100/hr`, shown explicitly per feature. All math is shown inline — no hidden multipliers. These are independent, granular estimates (not the team/person-week estimates in the other rollout docs), meant to support incremental "build vs. skip vs. defer" decisions per feature.

> Estimates assume the architect already has the context from the other three docs in this folder (rollout plan, architecture options, buy-vs-build) and is not re-deriving requirements from scratch.

---

### 1. WHOOP OAuth2 + Core API Client
Implements the OAuth2 auth-code flow and a typed client for WHOOP's `/v2/recovery`, `/v2/cycle`, `/v2/activity/sleep`, `/v2/activity/workout`, and profile/body-measurement endpoints.
- Auth/token exchange + refresh token handling
- Typed request/response models per endpoint
- Rate-limit-aware client (100/min, 10,000/day headers)
- Error handling + retry-with-backoff on 429/5xx

| Metric | Value | Math |
|---|---:|---|
| Human-only | 24 hrs | — |
| Agent-assisted | 14 hrs | — |
| Human-only cost | $2,400 | 24 hrs × $100/hr |
| Agent-assisted cost | $1,400 | 14 hrs × $100/hr |
| Hours saved | 10 hrs | 24 − 14 |
| Cost saved | $1,000 | 10 hrs × $100/hr |

---

### 2. WHOOP Webhook Receiver + Signature Verification
Endpoint that accepts WHOOP's `recovery/sleep/workout updated/deleted` events and verifies the `X-WHOOP-Signature` HMAC-SHA256 header before processing.
- Route + payload parsing per event type
- HMAC signature verification against client secret
- Fast 200-OK ack pattern (per WHOOP's <1s recommendation)
- Dead-letter logging for verification failures

| Metric | Value | Math |
|---|---:|---|
| Human-only | 12 hrs | — |
| Agent-assisted | 6 hrs | — |
| Human-only cost | $1,200 | 12 hrs × $100/hr |
| Agent-assisted cost | $600 | 6 hrs × $100/hr |
| Hours saved | 6 hrs | 12 − 6 |
| Cost saved | $600 | 6 hrs × $100/hr |

---

### 3. WHOOP Reconciliation / Polling Job
Scheduled job that polls WHOOP's REST endpoints to catch any records missed by webhook delivery, since WHOOP's retry count/interval is undocumented and can't be treated as guaranteed.
- Cursor/date-range-based polling per user
- Diff against already-ingested `source_record_id`s
- Backfill on first connect (historical range)
- Alerting on prolonged reconciliation drift

| Metric | Value | Math |
|---|---:|---|
| Human-only | 16 hrs | — |
| Agent-assisted | 9 hrs | — |
| Human-only cost | $1,600 | 16 hrs × $100/hr |
| Agent-assisted cost | $900 | 9 hrs × $100/hr |
| Hours saved | 7 hrs | 16 − 9 |
| Cost saved | $700 | 7 hrs × $100/hr |

---

### 4. Ingestion Gateway + Source Adapter Framework
The `src/lib/integrations/` provider-registry pattern: a common interface each source adapter implements so new providers can be added without touching KPI/persistence logic.
- Adapter interface definition (per-provider normalize/validate contract)
- Provider registry + dynamic dispatch by source
- Adapter-level error isolation (one provider failing doesn't break others)
- Unit test harness/fixtures for adapter conformance

| Metric | Value | Math |
|---|---:|---|
| Human-only | 20 hrs | — |
| Agent-assisted | 11 hrs | — |
| Human-only cost | $2,000 | 20 hrs × $100/hr |
| Agent-assisted cost | $1,100 | 11 hrs × $100/hr |
| Hours saved | 9 hrs | 20 − 11 |
| Cost saved | $900 | 9 hrs × $100/hr |

---

### 5. Canonical DTO Schema + Validation
Defines and enforces `CanonicalDailyWellness`, `CanonicalWorkout`, and `CanonicalHabitSignals` shapes, including metadata (`source`, `source_record_id`, `recorded_at`, `ingested_at`) and quality fields (`field_completeness_pct`, `mapping_confidence`, `synthetic_fields[]`).
- Schema definitions + runtime validation (e.g., zod/io-ts equivalent)
- Metadata + quality-field enforcement on every adapter output
- Versioning strategy for schema evolution
- Golden-file tests per provider mapping

| Metric | Value | Math |
|---|---:|---|
| Human-only | 18 hrs | — |
| Agent-assisted | 10 hrs | — |
| Human-only cost | $1,800 | 18 hrs × $100/hr |
| Agent-assisted cost | $1,000 | 10 hrs × $100/hr |
| Hours saved | 8 hrs | 18 − 10 |
| Cost saved | $800 | 8 hrs × $100/hr |

---

### 6. iOS Apple Health Integration (Terra SDK)
Native iOS integration embedding the Terra iOS SDK against HealthKit, since Apple publishes no server-side API and this is the only path to Apple Health data.
- HealthKit permission request flow + `Info.plist` usage strings
- Terra SDK session init, `reference_id` linking
- Background delivery setup (`Terra.setUpBackgroundDelivery()`) and scoped data-type configuration
- Auth/connection-state event handling (`auth`, `connection_error`, `deauth`)

| Metric | Value | Math |
|---|---:|---|
| Human-only | 60 hrs | — |
| Agent-assisted | 38 hrs | — |
| Human-only cost | $6,000 | 60 hrs × $100/hr |
| Agent-assisted cost | $3,800 | 38 hrs × $100/hr |
| Hours saved | 22 hrs | 60 − 38 |
| Cost saved | $2,200 | 22 hrs × $100/hr |

---

### 7. Android Health Connect Integration (Terra SDK, default path)
Android integration using Terra's SDK against Health Connect — the recommended default because it works across all Android 9+ devices without requiring Samsung partner approval, and it's Google Play's preferred model for Android 14+.
- Health Connect permission flow (min SDK 28)
- Terra SDK session init, `reference_id` linking
- Data-type scoping and sync-lag handling (phone → Health Connect → backend)
- Auth/connection-state event handling

| Metric | Value | Math |
|---|---:|---|
| Human-only | 50 hrs | — |
| Agent-assisted | 32 hrs | — |
| Human-only cost | $5,000 | 50 hrs × $100/hr |
| Agent-assisted cost | $3,200 | 32 hrs × $100/hr |
| Hours saved | 18 hrs | 50 − 32 |
| Cost saved | $1,800 | 18 hrs × $100/hr |

---

### 8. Android Direct Samsung Health SDK Integration (P2 enhancement)
Engineering-only estimate to switch to Terra's Samsung-specific SDK dependency for the most granular Samsung Health data, once Samsung's partner program approves access. **Excludes the partner-approval calendar time itself**, which is external and not effort-bound.
- Samsung partner-approved SDK dependency swap
- Developer Mode enablement + device-specific test pass
- Field-parity comparison against Health Connect path
- Fallback logic to Health Connect if direct SDK unavailable per-device

| Metric | Value | Math |
|---|---:|---|
| Human-only | 40 hrs | — |
| Agent-assisted | 26 hrs | — |
| Human-only cost | $4,000 | 40 hrs × $100/hr |
| Agent-assisted cost | $2,600 | 26 hrs × $100/hr |
| Hours saved | 14 hrs | 40 − 26 |
| Cost saved | $1,400 | 14 hrs × $100/hr |

---

### 9. Consent & Revocation Management
User-facing consent screens plus backend audit logging and revocation processing for all mobile-linked sources.
- Consent screen UI + copy per platform
- Revocation trigger handling (user- and admin-initiated)
- Immutable audit log of consent grant/revoke events
- Data-deletion cascade on revocation

| Metric | Value | Math |
|---|---:|---|
| Human-only | 30 hrs | — |
| Agent-assisted | 18 hrs | — |
| Human-only cost | $3,000 | 30 hrs × $100/hr |
| Agent-assisted cost | $1,800 | 18 hrs × $100/hr |
| Hours saved | 12 hrs | 30 − 18 |
| Cost saved | $1,200 | 12 hrs × $100/hr |

---

### 10. Identity Linkage Service
Stable, auditable mapping between VOILoop employee/user records and Terra's per-provider `user_id`/`reference_id`.
- Mapping table + uniqueness constraints
- Linkage creation/lookup on first connect
- Orphan/duplicate detection and admin resolution tooling
- Linkage-success-rate metric feed (for the ≥98% go/no-go gate)

| Metric | Value | Math |
|---|---:|---|
| Human-only | 16 hrs | — |
| Agent-assisted | 9 hrs | — |
| Human-only cost | $1,600 | 16 hrs × $100/hr |
| Agent-assisted cost | $900 | 9 hrs × $100/hr |
| Hours saved | 7 hrs | 16 − 9 |
| Cost saved | $700 | 7 hrs × $100/hr |

---

### 11. Webhook Idempotency & Dedupe Layer
Shared cross-source logic to prevent double-counting from duplicate or replayed webhook events.
- Idempotency-key generation per event
- Upsert semantics on canonical DTO writes
- Duplicate-event metrics/alerting
- Replay-safe design for reconciliation-job overlap with webhooks

| Metric | Value | Math |
|---|---:|---|
| Human-only | 14 hrs | — |
| Agent-assisted | 8 hrs | — |
| Human-only cost | $1,400 | 14 hrs × $100/hr |
| Agent-assisted cost | $800 | 8 hrs × $100/hr |
| Hours saved | 6 hrs | 14 − 8 |
| Cost saved | $600 | 6 hrs × $100/hr |

---

### 12. Mobile QA + Release Hardening
Device-matrix testing, crash/performance monitoring, and release-cadence process for the iOS/Android apps carrying the Terra SDK. Agentic assist is lower here since physical device testing and store review cycles are inherently manual/calendar-bound.
- Device/OS-version test matrix definition and execution
- Crash reporting + performance monitoring wiring
- Store submission/release checklist (iOS + Android)
- Regression suite for permission/consent edge cases

| Metric | Value | Math |
|---|---:|---|
| Human-only | 44 hrs | — |
| Agent-assisted | 30 hrs | — |
| Human-only cost | $4,400 | 44 hrs × $100/hr |
| Agent-assisted cost | $3,000 | 30 hrs × $100/hr |
| Hours saved | 14 hrs | 44 − 30 |
| Cost saved | $1,400 | 14 hrs × $100/hr |

---

### 13. Garmin Web API Adapter
Server-side adapter for Garmin via Terra's web API path (no mobile app required).
- OAuth/connection flow via Terra Widget or direct API
- Field mapping to canonical DTOs (workout, wellness)
- Missing-field handling (recovery_score, sleep_debt, sleep_need, skin_temp)
- Adapter conformance tests

| Metric | Value | Math |
|---|---:|---|
| Human-only | 16 hrs | — |
| Agent-assisted | 8 hrs | — |
| Human-only cost | $1,600 | 16 hrs × $100/hr |
| Agent-assisted cost | $800 | 8 hrs × $100/hr |
| Hours saved | 8 hrs | 16 − 8 |
| Cost saved | $800 | 8 hrs × $100/hr |

---

### 14. Fitbit Web API Adapter
Server-side adapter for Fitbit via Terra's web API path.
- OAuth/connection flow via Terra Widget or direct API
- Field mapping to canonical DTOs
- Missing-field handling (recovery_score, skin_temp, HR zone detail, sleep_need)
- Adapter conformance tests

| Metric | Value | Math |
|---|---:|---|
| Human-only | 14 hrs | — |
| Agent-assisted | 7 hrs | — |
| Human-only cost | $1,400 | 14 hrs × $100/hr |
| Agent-assisted cost | $700 | 7 hrs × $100/hr |
| Hours saved | 7 hrs | 14 − 7 |
| Cost saved | $700 | 7 hrs × $100/hr |

---

### 15. Oura Web API Adapter
Server-side adapter for Oura via Terra's web API path.
- OAuth/connection flow via Terra Widget or direct API
- Field mapping to canonical DTOs (sleep/recovery-depth focus)
- Missing-field handling (activity strain semantics, workout zone detail)
- Adapter conformance tests

| Metric | Value | Math |
|---|---:|---|
| Human-only | 12 hrs | — |
| Agent-assisted | 6 hrs | — |
| Human-only cost | $1,200 | 12 hrs × $100/hr |
| Agent-assisted cost | $600 | 6 hrs × $100/hr |
| Hours saved | 6 hrs | 12 − 6 |
| Cost saved | $600 | 6 hrs × $100/hr |

---

### 16. Withings Web API Adapter
Server-side adapter for Withings via Terra's web API path.
- OAuth/connection flow via Terra Widget or direct API
- Field mapping to canonical DTOs (body-metrics focus)
- Missing-field handling (day_strain, workout strain, HR zones, sleep_need/debt — largest gap of all sources)
- Adapter conformance tests

| Metric | Value | Math |
|---|---:|---|
| Human-only | 14 hrs | — |
| Agent-assisted | 7 hrs | — |
| Human-only cost | $1,400 | 14 hrs × $100/hr |
| Agent-assisted cost | $700 | 7 hrs × $100/hr |
| Hours saved | 7 hrs | 14 − 7 |
| Cost saved | $700 | 7 hrs × $100/hr |

---

### 17. Polar Web API Adapter
Server-side adapter for Polar via Terra's web API path.
- OAuth/connection flow via Terra Widget or direct API
- Field mapping to canonical DTOs
- Missing-field handling (recovery_score, sleep_debt, sleep_need, skin_temp, some zone detail)
- Adapter conformance tests

| Metric | Value | Math |
|---|---:|---|
| Human-only | 16 hrs | — |
| Agent-assisted | 8 hrs | — |
| Human-only cost | $1,600 | 16 hrs × $100/hr |
| Agent-assisted cost | $800 | 8 hrs × $100/hr |
| Hours saved | 8 hrs | 16 − 8 |
| Cost saved | $800 | 8 hrs × $100/hr |

---

### 18. Synthetic Metrics Engine
Derives `recovery_score`, `day_strain`, `sleep_need`, `sleep_debt`, workout strain, and HR zones for sources missing native equivalents, per the documented derivation formulas.
- Weighted composite recovery_score model (sleep_perf, HRV z-score, resting_hr deviation, resp_rate deviation)
- Activity-load day_strain model (duration, intensity zones, active calories)
- 14-day baseline sleep_need model + sleep_debt formula
- HR zone calculation from max_hr estimate + sampled HR
- Confidence-grade tagging on every synthetic output

| Metric | Value | Math |
|---|---:|---|
| Human-only | 36 hrs | — |
| Agent-assisted | 22 hrs | — |
| Human-only cost | $3,600 | 36 hrs × $100/hr |
| Agent-assisted cost | $2,200 | 22 hrs × $100/hr |
| Hours saved | 14 hrs | 36 − 22 |
| Cost saved | $1,400 | 14 hrs × $100/hr |

---

### 19. KPI Confidence & Quality Labeling (Direct/Derived/Unavailable)
Backend + UI treatment that labels every KPI value by trust tier so users never see synthetic data presented as clinical-grade.
- Quality-tier tagging pipeline (Direct/Derived/Unavailable)
- UI confidence-label components + source-note tooltips
- "Not available for this source" empty-state handling
- Policy enforcement: block synthetic values from high-stakes clinical flows unless validated

| Metric | Value | Math |
|---|---:|---|
| Human-only | 20 hrs | — |
| Agent-assisted | 12 hrs | — |
| Human-only cost | $2,000 | 20 hrs × $100/hr |
| Agent-assisted cost | $1,200 | 12 hrs × $100/hr |
| Hours saved | 8 hrs | 20 − 12 |
| Cost saved | $800 | 8 hrs × $100/hr |

---

### 20. Observability & Parity Dashboards
Freshness, completeness, error, and synthetic-vs-direct parity dashboards used for the go/no-go gates and weekly operational review.
- Per-source freshness SLA tracking + alerting
- Completeness/error-rate dashboards
- Weekly synthetic-vs-direct parity report generation
- Incident-rate and support-load tracking feed for pilot staffing decisions

| Metric | Value | Math |
|---|---:|---|
| Human-only | 32 hrs | — |
| Agent-assisted | 20 hrs | — |
| Human-only cost | $3,200 | 32 hrs × $100/hr |
| Agent-assisted cost | $2,000 | 20 hrs × $100/hr |
| Hours saved | 12 hrs | 32 − 20 |
| Cost saved | $1,200 | 12 hrs × $100/hr |

---

### 21. Terra Widget Integration (web-API sources only)
Wires Terra's hosted authentication widget for the non-mobile-only sources (WHOOP, Garmin, Fitbit, Oura, Withings, Polar) so those providers don't need custom OAuth UI built in-house. **Does not apply to Apple/Samsung** — see docs/terra-buy-vs-build-recommendation.md for why.
- Widget session generation + branding config
- Callback handling into identity linkage (#10)
- Multi-provider selection UI within the widget
- Error/cancel-state handling back to VOILoop UI

| Metric | Value | Math |
|---|---:|---|
| Human-only | 10 hrs | — |
| Agent-assisted | 5 hrs | — |
| Human-only cost | $1,000 | 10 hrs × $100/hr |
| Agent-assisted cost | $500 | 5 hrs × $100/hr |
| Hours saved | 5 hrs | 10 − 5 |
| Cost saved | $500 | 5 hrs × $100/hr |

---

## Summary rollup (all 21 features)

| # | Feature | Human-only hrs | Agent-assisted hrs | Human-only cost | Agent-assisted cost | Cost saved |
|---:|---|---:|---:|---:|---:|---:|
| 1 | WHOOP OAuth2 + Core API Client | 24 | 14 | $2,400 | $1,400 | $1,000 |
| 2 | WHOOP Webhook Receiver + Signature Verification | 12 | 6 | $1,200 | $600 | $600 |
| 3 | WHOOP Reconciliation/Polling Job | 16 | 9 | $1,600 | $900 | $700 |
| 4 | Ingestion Gateway + Source Adapter Framework | 20 | 11 | $2,000 | $1,100 | $900 |
| 5 | Canonical DTO Schema + Validation | 18 | 10 | $1,800 | $1,000 | $800 |
| 6 | iOS Apple Health Integration | 60 | 38 | $6,000 | $3,800 | $2,200 |
| 7 | Android Health Connect Integration | 50 | 32 | $5,000 | $3,200 | $1,800 |
| 8 | Android Direct Samsung Health SDK | 40 | 26 | $4,000 | $2,600 | $1,400 |
| 9 | Consent & Revocation Management | 30 | 18 | $3,000 | $1,800 | $1,200 |
| 10 | Identity Linkage Service | 16 | 9 | $1,600 | $900 | $700 |
| 11 | Webhook Idempotency & Dedupe Layer | 14 | 8 | $1,400 | $800 | $600 |
| 12 | Mobile QA + Release Hardening | 44 | 30 | $4,400 | $3,000 | $1,400 |
| 13 | Garmin Web API Adapter | 16 | 8 | $1,600 | $800 | $800 |
| 14 | Fitbit Web API Adapter | 14 | 7 | $1,400 | $700 | $700 |
| 15 | Oura Web API Adapter | 12 | 6 | $1,200 | $600 | $600 |
| 16 | Withings Web API Adapter | 14 | 7 | $1,400 | $700 | $700 |
| 17 | Polar Web API Adapter | 16 | 8 | $1,600 | $800 | $800 |
| 18 | Synthetic Metrics Engine | 36 | 22 | $3,600 | $2,200 | $1,400 |
| 19 | KPI Confidence & Quality Labeling | 20 | 12 | $2,000 | $1,200 | $800 |
| 20 | Observability & Parity Dashboards | 32 | 20 | $3,200 | $2,000 | $1,200 |
| 21 | Terra Widget Integration (web-API sources) | 10 | 5 | $1,000 | $500 | $500 |
| **Total** | | **514** | **306** | **$51,400** | **$30,600** | **$20,800** |

**Totals math:**
- Human-only hours: 24+12+16+20+18+60+50+40+30+16+14+44+16+14+12+14+16+36+20+32+10 = **514 hrs**
- Agent-assisted hours: 14+6+9+11+10+38+32+26+18+9+8+30+8+7+6+7+8+22+12+20+5 = **306 hrs**
- Human-only cost: 514 hrs × $100/hr = **$51,400**
- Agent-assisted cost: 306 hrs × $100/hr = **$30,600**
- Total hours saved: 514 − 306 = **208 hrs**
- Total cost saved: 208 hrs × $100/hr = **$20,800** (≈40% reduction)

> These are solo-architect, full-scope estimates — useful for "build it all myself" budgeting or for deciding which individual features to defer/cut. They are not directly comparable to the team-based person-week estimates in `device-rollout-plan.md` and `terra-buy-vs-build-recommendation.md`, which assume parallel specialists (mobile engineer, backend engineer, QA) rather than one person doing everything sequentially.
