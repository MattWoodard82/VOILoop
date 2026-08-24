# Gaps & Ambiguities Log

| Gap ID | Gap Type | Description | Decision Blocked | Owner | Resolution Method | Status |
|---|---|---|---|---|---|---|
| **GAP-001** | Definition gap | "Formal onboarding process" — do participants need in-app wizard, email series, live orientation call, or something else? No current definition of what "formal" means. | Participant UX roadmap | Matt | UX research: test 3 onboarding approaches with pilot participants; measure time-to-value | Open |
| **GAP-002** | Process gap | Invite delivery: where does the invite link come from and how does it reach participants? Email? Benefits portal? SMS? Today: unclear who owns this step or how it's executed. | Participant first-touch experience | Matt | Document current invite flow; audit why "they don't receive the link"; define SLA for delivery | Open |
| **GAP-003** | Data gap | What is the current **device sync failure rate**? We know CSV upload is manual and error-prone, but no metrics on frequency or impact. | Prioritization: sync reliability vs. other work | Matt | Instrument CSV upload flow; measure upload success rate, drop-off rate, retry count | Open |
| **GAP-004** | Data gap | **Participant usage patterns:** Do they check daily, weekly, or once per cycle? Current pilot too small to establish pattern. | Define realistic engagement targets; prioritize notification strategy | Heather | Log participant login activity over 30-90 days; segment by cohort (joiners vs. auto-enrolled) | Open |
| **GAP-005** | Process gap | **Trust in wearable data:** Pre-work flags concern that participants may not trust WHOOP data translates to platform correctly. No validation test done. | Participant engagement; incentive credibility | Heather | Post-login survey: "Do you trust the data shown reflects your wearable data?" | Open |
| **GAP-006** | Process gap | **Wellness Director multi-site complexity:** Pre-work says this varies by org. How much per-employer-group rule configurability do we actually need? 10% of clients or 80%? | Scope of "multi-site" feature; effort estimation | Heather | Survey current WD base: "How many employer groups do you manage?" and "Do they have different incentive rules?" | Open |
| **GAP-007** | Data gap | **Nudge effectiveness:** We want to measure which nudges drive behavior change, but do we have the telemetry? (Send count, engagement rate, correlation to activity/biometric change?) | Future roadmap: nudge effectiveness analytics | Heather | Audit current data collection: what events do we log for nudges? What behavior data can we correlate to? | Open |
| **GAP-008** | Process gap | **Participant success metric:** What does "success" mean for a participant? Reaching an incentive threshold? A behavior change? A streak? Unclear today. | Participant engagement design; goal messaging | Heather | Interview pilot participants: "What made you feel you 'won' the program?" | Open |
| **GAP-009** | Definition gap | **Admin persona:** We skipped this for now, but who is the VOILoop platform admin? System admin vs. client-side admin? Do they have different needs? | Roadmap prioritization (may return in Phase 2) | Matt | Defer to follow-up workshop; clarify scope | Parked |
| **GAP-010** | Ownership gap | **Incentive program design & payout:** Pre-work mentions incentive rules vary by employer and are "led by client team." Is VOILoop platform supposed to manage rules, or just track/report? | Scope of incentive management in VOILoop; UX requirements | Matt | Clarify: Who owns incentive rule definition—employer HR or VOILoop? Does VOILoop UI need to support rule config? | Open |
| **GAP-011** | Data gap | **Wellness Director report format:** Pre-work says she rebuilds in Excel because platform export isn't "leadership-ready." What specific columns/format does leadership expect? | Design smart export / report template feature | Heather | Collect 2-3 actual Excel reports that WDs send to leadership; reverse-engineer the format | Open |
| **GAP-012** | Process gap | **Exception handling:** WD maintains side spreadsheet of incentive exceptions/overrides. Is this a widespread need, or edge case? What % of WDs do this? | Decide if exception-tracker feature is MVP or Phase 2 | Heather | Survey: "Do you manually track exceptions? How often?" | Open |
| **GAP-013** | Constraint gap | **Participant device access:** Shift workers and frontline staff may not have reliable device/data access during work. How common is this constraint? | Affects cadence targets and nudge channel strategy | Heather | Usage audit: segment pilot participants by role (office vs. shift); compare login frequency and time-of-day patterns | Open |
| **GAP-014** | Data gap | **Exec report cadence & channels:** Does exec check VOILoop dashboard monthly? Quarterly? Does she need email alerts, automated reports, or manual pull? Unclear today. | Roadmap: exec dashboard vs. automated reporting | Matt | Interview 3-5 employer exec sponsors: "How often do you check wellness program metrics? How do you prefer to receive them?" | Open |
| **GAP-015** | Definition gap | **"Layman's terminology" for metrics:** Pre-work says "layman's terminology" but unclear what execs actually understand. Do they know "strain" means workload? Recovery means rest? | Exec metric naming and explanation | Matt | Show current exec report to 2-3 execs not familiar with wearable tech; ask what terms confuse them | Open |
| **GAP-016** | Data gap | **Benchmark data availability:** Execs want to know "Is 40% participation good or bad?" Do we have industry benchmark data or peer data to compare? | Roadmap: benchmark feature; credibility of comparisons | Matt | Research: What wellness program benchmark data exists? Can VOILoop license or partner for this data? | Open |
| **GAP-017** | Constraint gap | **Business outcome correlation:** Hard to prove ROI (claims cost, retention, productivity) because VOILoop only captures engagement metrics. Data exists elsewhere (payroll, claims system). | Roadmap: integration with HR/claims data; ROI dashboard | Matt | Scope: Is integration with external HR systems in-scope for this refactor, or Phase 2? Clarify with product leadership | Open |
| **GAP-018** | Process gap | **Privacy & data governance:** Confirm HIPAA-equivalent handling of biometric data; ADA rules on incentive design; data retention limits. Are there legal constraints we haven't identified? | Participant & Wellness Director feature design (especially data visibility) | Matt | Legal/compliance review: Are there wellness program regulations we need to account for in UX? | Open |
| **GAP-019** | Data gap | **Participant email vs. in-app messaging preference:** Pre-work says participants assume chatboxes are bots; prefer email. Is this confirmed or hypothetical? | Messaging channel strategy; nudge UX design | Heather | Survey or interview pilot participants: "How do you prefer to receive coaching from Wellness Director?" | Open |
| **GAP-020** | Process gap | **Pilot sample size and representativeness:** Pre-work says "small pilot group" with limited participant feedback. How many participants? How representative (office vs. shift, health-motivated vs. auto-enrolled)? | Evidence bar for prioritization; risk of over-fitting to pilot | Matt | Document pilot participant count and segment; acknowledge gaps in confidence levels | Open |

---

## Gap Resolution Approach

**High Priority (blocks next phase):**
- GAP-002 (invite delivery)
- GAP-003 (device sync failure rate)
- GAP-004 (participant usage patterns)
- GAP-006 (multi-site complexity scope)
- GAP-011 (WD report format)

**Medium Priority (affects detailed design):**
- GAP-001 (onboarding definition)
- GAP-005 (trust in wearable data)
- GAP-008 (participant success metric)
- GAP-014 (exec cadence)
- GAP-015 (exec terminology)
- GAP-019 (messaging preference)

**Lower Priority (research/defer):**
- GAP-007 (nudge analytics infrastructure)
- GAP-009 (admin persona)
- GAP-010 (incentive rule ownership)
- GAP-012 (exception handling scope)
- GAP-013 (device access by role)
- GAP-016 (benchmark data)
- GAP-017 (business outcome integration)
- GAP-018 (legal/compliance review)
- GAP-020 (pilot representativeness)

---

## Next Steps
1. **Owner assignments:** Each gap should have a clear owner for resolution
2. **Timeline:** Gaps should be resolved before moving to Phase 2 (root cause & prioritization)
3. **Evidence collection:** Prioritize gaps that unblock prioritization; defer research gaps
4. **Live validation:** If time permits in session, ask clarifying questions for high-priority gaps
