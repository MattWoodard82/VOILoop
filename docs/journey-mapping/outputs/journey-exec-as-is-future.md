# Journey Map — Exec (Employer C-Suite) (As-Is & Future-State)

## 1. Persona Snapshot
- **Persona:** Employer-side C-suite executive (CFO, CHRO, CEO, COO)
- **Data access:** Aggregated/anonymized data only; NO participant-level visibility
- **Context:** Receives reports monthly/quarterly or as-needed; reviews to assess program ROI and effectiveness
- **Primary goals:** Demonstrate program value to stakeholders, justify program spend, make case for expansion/continuation, understand employee wellness trends
- **Key constraint:** Needs simple, "layman's terminology" not clinical metrics; needs trends over time and confidence in data accuracy
- **Confidence:** M (based on pre-work responses); L (actual exec workflow not deeply validated)

---

## 2. Triggers (As-Is)
- Monthly/quarterly reporting cycle (scheduled)
- Board/investor request for wellness program update
- Decision point: expand program, continue, or cut
- Ad hoc question from leadership team ("How's participation trending?")

---

## 3. Current Journey (As-Is) — With Pain Points

| Stage | User Action | Thought | Emotion | Touchpoint | Pain Point | Severity | Evidence |
|---|---|---|---|---|---|---|
| **Receive Report** | Gets monthly/quarterly report emailed or finds link to dashboard | "What's the status?" | Curious but busy; skims quickly | Email with link or attached PDF | **Manual report creation:** No self-serve option; dependent on VOILoop staff availability | 4/5 | **Evidence-backed:** "VOILoop staff manually creates exec reports" — doesn't scale |
| **Review Metrics** | Scans aggregated participation, sleep/steps/strain/recovery averages, nudge readouts, pulse survey results | "Are people healthier? Are we seeing ROI?" | Concerned if trending down; satisfied if stable or up | Dashboard or PDF report | **Layman's terminology:** Metrics use clinical jargon ("HRV," "recovery index") instead of simple language | 3/5 | **Hypothesis:** Pre-work says "layman's terminology" needed but unclear if current report achieves this |
| **Compare to Baseline** | Looks for year-over-year trend, site-to-site benchmark, or industry comparison | "How are we doing vs. last year or vs. peers?" | Frustrated if no context; confident if clear | Report or dashboard trend view | **Missing context:** Point-in-time snapshot only; hard to understand if 40% participation is good/bad/improving | 4/5 | **Hypothesis:** "No trend view" flagged in pre-work |
| **Review Nudge/Challenge Recommendations** | Sees WD recommendations for which nudges/challenges to deploy next based on effectiveness | "What should we do to improve engagement?" | Engaged if recommendations come with evidence | Report section or separate communication | **No historical recommendation tracking:** Can't see if past recommendations worked; no A/B test results | 4/5 | **Hypothesis:** "Historical recommendations/outcomes" mentioned but likely not in current report format |
| **Check Pulse Survey / Sentiment** | Reviews happiness scores, NPS, or open feedback from participants | "How do people feel about the program?" | Interested in morale impact | Survey dashboard or summary section | **Limited feedback loop:** Sentiment data collected but may not be clearly connected to program initiatives | 3/5 | **Hypothesis:** Collected "if available" but unclear how presented or actionable |
| **Prepare for Board/Exec Meeting** | Extracts key talking points from report; may need to answer ad hoc questions ("How many people hit step goals?") | "Do I have the numbers to tell this story?" | Nervous if incomplete or can't answer follow-ups | Email/PowerPoint + manual data pull from VOILoop staff | **Ad hoc requests require manual extraction:** Can't self-serve to answer custom questions; dependent on VOILoop staff | 4/5 | **Hypothesis:** Inferred from manual report workflow |

---

## 4. High-Friction & Cognitively Heavy Steps (As-Is)

| Step | What Makes It Hard | Impact | Root Cause |
|---|---|---|---|
| **Understanding jargon** | Report uses terms like "strain," "recovery," "HRV," "zone locations" without translation | Exec misunderstands or asks clarifying questions; slows decision | Metrics pulled directly from wearable data; no simplification layer |
| **Establishing baseline & benchmarking** | No clear "is this good?" standard; no comparison to industry or peer companies | Hard to justify program ROI; hard to set next-year goals | No benchmark data built into platform; manual research required |
| **Finding ROI evidence** | Hard to connect wellness metrics to claims cost, retention, or productivity outcomes | Can't prove business value; hard to justify continued spend | VOILoop measures engagement, not health outcomes; no integration with HR/payroll data |
| **Requesting custom data** | Wants "show me participation by office vs. remote workers" but can't self-serve; must email VOILoop staff | Delayed decision-making; low confidence in platform | No self-serve dashboard with filters/segmentation |

---

## 5. Current Metrics Captured (As-Is)

**Aggregated metrics currently reported:**
- Participation rate (%)
- Average sleep, steps, strain, recovery (aggregated)
- Zone locations breakdown
- Weekly nudge readouts (unclear format)
- Recommendation to execs on which nudges/challenges to implement
- Pulse survey / happiness scores

**Missing metrics:**
- Year-over-year trend (only point-in-time snapshots)
- Site-to-site or demographic comparison
- Nudge/challenge effectiveness (which ones drove behavior change?)
- Correlation with business outcomes (claims cost, retention, productivity)
- Engagement breakdown by cohort (auto-enrolled vs. joiners; office vs. shift workers)

---

## 6. Desired Future-State Journey

| Stage | Desired Behavior | Why It Matters | UX Implication |
|---|---|---|---|
| **Check dashboard (self-serve)** | Log into exec dashboard; see "quick health check" card with key metrics at a glance | Empower self-service; reduce dependency on VOILoop staff | Exec dashboard with auto-updated metrics; no manual report needed |
| **Understand metrics in plain language** | See "40% of employees improved their sleep quality" instead of "average sleep duration +0.3 hours" | Execs understand impact without clinical translation | Metric cards with narrative ("What this means") + trend arrow |
| **Compare performance over time** | See 12-month trend for participation, health metrics, engagement | Track progress; set goals; understand seasonality | Historical chart view with year-over-year overlay |
| **Benchmark program** | See how participation/engagement compares to industry standard or peer companies (if data available) | Justify program investment; set realistic goals | Comparison card showing VOILoop client aggregate or industry data |
| **Understand nudge effectiveness** | See report: "Nudge A was sent 500x, engaged 35%, led to 20% increase in step activity" | Make data-driven recommendations; optimize coaching | Nudge effectiveness table with engagement + behavior impact correlation |
| **Request custom report** | Select date range, segment (office/shift/department), metric bundle → auto-generate report | Answer ad hoc board questions; build confidence in data | Report builder UI: filter + metric selector → export to PDF/PPT |

---

## 7. As-Is vs. Future-State — Biggest Gaps

| As-Is Problem | Future-State Requirement | Effort | Risk |
|---|---|---|---|
| Manual report creation | Self-serve exec dashboard | M-L | Low |
| Clinical jargon | Metric translation + "what it means" narrative | S-M | Low |
| No trend visibility | 12-month historical view + year-over-year comparison | M | Low |
| No benchmarking | Aggregate industry data or peer comparison | L | Medium (data availability/privacy) |
| No nudge effectiveness tracking | Analytics dashboard correlating nudges to behavior change | L | Medium (data infrastructure) |
| No custom reporting | Self-serve report builder with filters | M | Low |
| No business outcome link | Integration with claims/HR/payroll data | L | High (data integration complexity, privacy) |

---

## 8. Assumptions & Unknowns

| Item | Type | Why It Matters | Owner | Next Step |
|---|---|---|---|---|
| Execs check reports monthly; plan to make decisions quarterly | Assumption | Affects report cadence and freshness requirements | Matt | Interview 3-5 employer exec sponsors: how often do they check? |
| Execs care about aggregated data, not individual participant stories | Assumption | Drives data visibility level; privacy requirement | Matt | Confirm with employer legal/compliance: can exec see any participant-level info (anonymized)? |
| Industry benchmark data is important for credibility | Assumption | May be table-stakes or nice-to-have depending on sophistication level | Matt | Survey: "If we showed you industry average participation, would that change your confidence?" |
| Nudge effectiveness is measurable from VOILoop data alone | Assumption | May require external behavioral data (claims, surveys) to validate | Heather | Can we correlate nudge sends to observable behavior change in the data we have? |
| Execs understand the difference between "engagement" and "health outcome" | Assumption | Misalignment here could cause false expectations or ROI disputes | Matt | Show exec mockup; ask: "What proof of ROI do you need?" |
| Year-over-year trend is more valuable than absolute numbers | Assumption | May vary by industry/program maturity | Matt | Do execs want trend, absolute numbers, or both? |

---

## 9. Current Workarounds / Dependencies

- VOILoop staff manually compiles report each month/quarter
- Exec stores reports locally; manually compares year-over-year
- Ad hoc questions require email to VOILoop staff + 1-2 day turnaround
- Board deck built from report data + external ROI assumptions

---

## 10. Risk & Compliance Concerns

- **HIPAA/Privacy:** No participant-level data visible; all aggregation must preserve anonymity
- **Data accuracy:** Exec bases decisions on data; must have high confidence in data quality
- **Audit trail:** May need to track who requested what data and when (for compliance)
- **Industry benchmark data:** Must be sourced from credible, unbiased source to avoid misrepresentation

---

## 11. Confidence Summary

| Aspect | Confidence | Why |
|---|---|---|
| Exec role exists & needs aggregated data | H | Clear from pre-work; no participant-level visibility |
| Current manual report workflow | H | Explicit: "VOILoop staff manually creates exec reports" |
| Layman's terminology requirement | M | Stated in pre-work but actual exec feedback limited |
| Metrics that matter to execs | M | Pre-work lists metrics but unclear if complete or prioritized |
| Nudge effectiveness as valuable metric | M | Mentioned but not deeply validated with actual execs |
| Year-over-year trend importance | L | Assumed helpful; not confirmed by actual exec request pattern |
| Benchmark data needed | L | Not mentioned in pre-work; inferred from "prove ROI" theme |
