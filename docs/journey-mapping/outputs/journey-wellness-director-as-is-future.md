# Journey Map — Wellness Director (As-Is & Future-State)

## 1. Persona Snapshot
- **Persona:** Outcomes-focused wellness program manager (internal HR/benefits or dedicated vendor role)
- **Context:** Manages day-to-day program across one or more sites; often juggling with other HR duties
- **Accountable for:** Participation rates, incentive-budget accuracy, participant satisfaction, "engagement story" for leadership
- **Key constraint:** Limited dedicated time; no analyst support; low-to-moderate tolerance for workflow complexity
- **Confidence:** H (based on pre-work from Heather); M (variation across orgs)

---

## 2. Triggers (As-Is)
- Challenge launch/close date
- Monthly/quarterly reporting cycle
- Leadership request for data update
- Participant escalation about missing data or incentive issues
- Ad hoc questions ("Show me site-to-site comparison")

---

## 3. Current Journey (As-Is) — With Pain Points

| Stage | User Action | Thought | Emotion | Touchpoint | Pain Point | Severity | Evidence |
|---|---|---|---|---|---|---|
| **Daily/Weekly Check-in (Light)** | Logs into VOILoop dashboard | "Did participants show up? Any issues?" | Routine but anxious if problems | Web/mobile dashboard | **Time investment:** ~1 hour per participant per month (industry standard 1-2h); no clear ROI measurement yet | 4/5 | **Evidence-backed:** "Monthly it takes around 1h per participant on average" |
| **Check Enrollment & Participation** | Views enrollment counts, active challenges, participation rates | "Are we on track? Who's engaged?" | Moderately confident if numbers look right | Dashboard (enrollment section) | **No raw data access:** Can't drill down to verify anomalies; must export to investigate | 5/5 | **Evidence-backed:** "Usually investigating participant-felt discrepancies that require manual review of CSV data—there is no access to raw data" |
| **Cross-check for Anomalies** | Scans for unexpected drops, missing records, data mismatches | "What went wrong here?" | Frustrated when can't pinpoint cause | Dashboard + manual CSV export | **No visibility into sync failures:** Doesn't know if a missing record is a device sync failure, participant data issue, or system bug | 4/5 | **Hypothesis:** Pain point inferred from "no raw data access"; needs confirmation |
| **Export Data** | Exports data to CSV for analysis | "Let me build the real report" | Resigned—knows platform export won't be "good enough" | CSV export button | **Export format gaps:** Missing columns; doesn't match "leadership-ready" format; requires manual rework | 4/5 | **Evidence-backed:** "Exports data into Excel to build the 'real' report" in pre-work |
| **Rework in Excel** | Rebuilds pivot tables, aggregations, charts in Excel to match leadership expectations | "This is the report I actually present" | Frustrated that platform can't do this | Excel/Google Sheets | **Manual formatting work:** Rebuilds report structure each cycle; error-prone; time-consuming | 4/5 | **Evidence-backed:** Pre-work flags manual export/rework as #1 pain point |
| **Reconcile Exceptions** | Manually reviews a side spreadsheet of incentive exceptions and overrides from prior cycle | "Did we fix all of these?" | Anxious about inconsistency | Side spreadsheet (not in VOILoop) | **Exception handling not in-system:** No audit trail; easy to miss corrections; doesn't scale | 4/5 | **Hypothesis:** "Keeps a side spreadsheet of incentive exceptions" — system doesn't support this workflow |
| **Compile Summary for Leadership** | Assembles slides or dashboard link showing key metrics | "Will they understand this? Will they ask questions I can't answer?" | Nervous about credibility | PowerPoint/Google Slides or dashboard link | **Limited trend visibility:** Only point-in-time snapshots; can't show historical trends easily | 3/5 | **Hypothesis:** "No easy trend view over time" flagged in pre-work |
| **Answer Participant Questions** | Follows up on participant escalations (missing data, unclear rules, incentive questions) | "Is this a platform issue or a data issue?" | Frustrated when can't easily verify | Email, VOILoop messaging (if available) | **Limited visibility into participant actions:** Can't see what participant saw, when they synced, what error they hit | 4/5 | **Hypothesis:** Inferred from no raw data access + manual investigation need |
| **Coordinate with Vendor** | Emails biometric/wearable vendor for a data pull when VOILoop dashboard can't answer a question | "I need the raw data from the vendor" | Dependent on vendor responsiveness | Email | **Dashboard gaps require vendor workaround:** Increases cycle time; vendor delays affect reporting | 3/5 | **Evidence-backed:** "Emails the vendor for a data pull when the dashboard can't answer a question" |

---

## 4. High-Friction & Cognitively Heavy Steps (As-Is)

| Step | What Makes It Hard | Impact | Root Cause |
|---|---|---|---|
| **Reconciling data across multiple sites with different rules** | Different employer groups have different incentive rules, definitions of "eligible participant," goal thresholds | Confusion about which numbers apply where | System designed for single site; no multi-tenant rule engine |
| **Interpreting dense dashboard without benchmarks** | Dashboard shows numbers but no context: "Is a 40% participation rate good or bad?" | Leadership asks "How do we compare to industry?" but WD can't answer quickly | No comparison/benchmark view; limited KPI guidance |
| **Remembering last cycle's exceptions** | Manual spreadsheet of exceptions not documented in platform | Rework of fixes; easy to miss edge cases | Exceptions not tracked in-system with audit trail |
| **Finding the root cause of missing participant data** | Participant says "My data isn't showing up"; WD can't see if it's a sync failure, upload error, or system issue | Time spent investigating in email + Excel instead of in platform | No error logs or sync status visible to WD; no drill-down |
| **Building a report that leadership will trust** | Must rebuild in Excel because platform export doesn't match expected format | Creates distrust of platform numbers | Platform export designed for data dump, not leadership presentation |

---

## 5. Metrics & Signals (As-Is)

**Current metrics WD tracks:**
- Participation rate (enrollment / active)
- Biometric screening completion rate
- Incentive redemption rate and cost
- Year-over-year engagement trend
- Participant satisfaction/NPS (if collected)

**Current dashboards/reports used:**
- VOILoop native dashboard (partial trust; she rebuilds in Excel)
- Excel version she creates (full trust; this is what she presents)
- Vendor reports (for validation)

**Metric blind spots (risky):**
- No funnel visibility: *why* does participation drop?
- No site-to-site comparison
- No link between engagement metrics and health/claims outcomes
- No way to measure effectiveness of nudges/challenges
- No trend visibility over multiple cycles

---

## 6. Desired Future-State Journey

| Stage | Desired Behavior | Why It Matters | UX Implication |
|---|---|---|---|
| **Dashboard check-in** | See health summary with flagged anomalies + root causes surfaced | Quickly spot issues without manual investigation | Alert system: "3 participants have sync failures," "Enrollment below target," etc. |
| **Investigate anomaly** | Drill into participant record; see all events (sync attempts, uploads, errors) with timestamps | Understand what went wrong; feel confident in data | Participant debug view: sync history, upload log, error messages |
| **Compare across sites/groups** | Multi-site dashboard with configurable rules per group | Understand variation; benchmark performance | Site selector + rule configuration UI; side-by-side comparison views |
| **Export or save report** | One-click export to leadership-ready PDF/PPT with standard format OR saved report templates that auto-populate | Stop spending time on formatting; present with confidence | Smart export: format choices, pre-built templates, "this is what execs see" |
| **Track incentive exceptions** | Log exceptions in-system with reason, owner, deadline; auto-flag if not resolved by due date | Audit trail; no more side spreadsheets; accountability | Exception tracker UI: log, comment, assign, track status |
| **Communicate with participant** | In-platform coaching + clear visibility to participant of what WD sees (participation %, trend, personalized recommendations) | More effective coaching; participant feels "seen" | Coach message UI with suggested insights pulled from participant data |
| **Report on nudge effectiveness** | See which nudges drove engagement, which ones were ignored, time-to-response | Measure return on coaching effort | Nudge analytics: send count, engagement rate, response rate, correlation with behavior change |

---

## 7. As-Is vs. Future-State — Biggest Gaps

| As-Is Problem | Future-State Requirement | Effort | Risk |
|---|---|---|---|
| No raw data access; manual investigation | Participant debug view + sync error visibility | M | Low |
| Manual CSV export + Excel rework | Smart export + saved report templates | S-M | Low |
| Exceptions in side spreadsheet | In-system exception tracker | S | Low |
| No multi-site/multi-rule support | Site selector + per-group rule configuration | L | Medium (complexity) |
| No trend visibility | Historical data views + chart generation | M | Low |
| Coaching is ad-hoc; no measurement | Nudge effectiveness analytics | M | Medium (depends on data infrastructure) |
| Manual email coordination with vendor | Clearer sync status in-platform (reduces vendor calls) | M | Low |

---

## 8. Assumptions & Unknowns

| Item | Type | Why It Matters | Owner | Next Step |
|---|---|---|---|---|
| Wellness Director always has dedicated time to check VOILoop monthly | Assumption | 1h/participant may be aspirational; may get deprioritized | Heather | Interview 3-5 actual WDs: realistic time commitment? |
| Multi-site complexity is common | Assumption | Affects prioritization of site-selector feature | Heather | How many clients run multi-site programs? |
| WD trust platform numbers if raw data is visible | Assumption | Blocks adoption if false; may need "bring your own data" or transparency layer | Heather | Test with pilot: does seeing raw data increase trust? |
| Exception tracking is widespread need | Assumption | May be edge case for simple/single-site programs | Heather | Survey: what % of WDs manually track exceptions? |
| Leadership wants auto-formatted report vs. customizable export | Assumption | Affects UX design: opinionated template vs. flexible builder | Matt | Show mockups of both; ask which leadership prefers |

---

## 9. Current Workarounds (Brittle)

- Side spreadsheet for exceptions
- Manual email to vendor for data validation
- Excel rebuilds each cycle (no template/automation)
- Email threads with participants for escalations (no in-system tracking)

---

## 10. Confidence Summary

| Aspect | Confidence | Why |
|---|---|---|
| Wellness Director role & accountability | H | Based on Heather's direct input |
| Current 1h/participant time investment | H | Explicit statement |
| Manual export + rework pain point | H | Flagged as #1 pain; confirmed in live discussion |
| No raw data access (root cause) | H | Direct evidence: "there is no access to raw data" |
| Multi-site complexity | M | Mentioned but not deeply explored |
| Nudge analytics as future need | M | Implied by coaching role but not deeply validated |
| Exception tracking as critical | M | Observed behavior but not confirmed as must-have |
