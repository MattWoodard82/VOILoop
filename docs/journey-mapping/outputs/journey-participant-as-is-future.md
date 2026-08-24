# Journey Map — Participant (As-Is & Future-State)

## 1. Persona Snapshot
- **Persona:** Employee in employer-sponsored wellness program
- **Segment:** Mix of health-motivated "joiners" + larger auto-enrolled cohort (lower engagement)
- **Context of use:** Short bursts before/after work or on breaks; primarily mobile phone (not work computer)
- **Primary goals:** Lower insurance premium, earn incentive dollars/PTO, improve personal metric (steps, weight, BP), feel camaraderie with coworkers
- **Key constraint:** Digital literacy and device access vary widely (office staff vs. frontline/shift workers)
- **Confidence:** H (based on employer program structure); M (actual behavior—pilot limited)

---

## 2. Triggers (As-Is)
- HR kickoff announcement
- Reminder email/SMS about challenge deadline
- Incentive program offered by employer
- Failed wellness screening or health scare

---

## 3. Current Journey (As-Is) — With Pain Points

| Stage | User Action | Thought | Emotion | Touchpoint | Pain Point | Severity | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **Discover/Receive Invite** | Receives email with VOILoop link or sees QR code | "What is this?" | Curious but skeptical | Email, QR code, benefits portal | **Invite visibility gap:** Many don't receive or see the link; unclear where to find it | 5/5 | **Evidence-backed:** "They don't receive/see the invite link" — confirmed blockers in pilot |
| **First Login** | Clicks link, expects quick SSO or simple login | "Just let me in, like my other apps" | Impatient | VOILoop web/mobile, SSO | **Login friction:** Current SSO flow is "aging/awkward"; login process unclear | 4/5 | **Hypothesis:** Pre-work flags SSO friction; actual UX not yet verified |
| **Initial Onboarding** | Lands on dashboard, unsure what to do | "Where's my number? What do I do here?" | Confused, skeptical | Dashboard | **Missing onboarding:** No formal onboarding process; unclear next steps | 4/5 | **Hypothesis:** "Perhaps more of a formal onboarding process" — anticipated pain |
| **Connect Wearable** | Needs to sync device (Fitbit, WHOOP, Apple Health, etc.) | "Will my data be safe? Will this even work?" | Anxious about trust | CSV upload modal or integration point | **Trust gap on data:** No visible privacy explainer at point of data entry; unclear how device data becomes platform metrics | 4/5 | **Hypothesis:** Privacy concern mentioned; needs validation |
| **Upload WHOOP CSV** | Uploads exactly 3 CSV files (workouts.csv, sleeps.csv, physiological_cycles.csv) | "Why 3 files? Is this right?" | Frustrated if wrong files | File upload UI | **Confusing file format:** Requires exact 3 files; error messages not friendly | 3/5 | **Evidence-backed:** UI code reviewed; requires workouts, sleeps, cycles |
| **Confirmation** | Gets error or success message | "Did it save or not?" | Uncertain | Modal/toast notification | **Unclear confirmation:** No real-time status shown to user; no clear proof data was recorded | 4/5 | **Evidence-backed:** "No real-time status shown to user" flagged in pre-work |
| **Check Progress** | Wants to see current standing toward incentive or personal metric trend | "Am I winning? How am I doing?" | Motivated or discouraged | Dashboard, leaderboard (if available) | **Unclear incentive rules:** Rules vary by employer group; participant doesn't know which challenges are active or what winning looks like | 4/5 | **Hypothesis:** "Unclear which challenges are currently active" — needs deeper validation |
| **Receive Nudge** | Gets coaching/communication from Wellness Director | "Who's this? Is this a bot or a real person?" | Suspicious or engaged | Email, in-app message | **Nudge channel confusion:** IM/conversational assumed to be bot; prefer email UI for real coaching conversations | 3/5 | **Evidence-backed:** "Build more of an email UI...many people assume chatboxes are bots/AI" |

---

## 4. Failure & Friction Points (As-Is)

| Point | What Fails | Frequency | Impact | Workaround | Root Cause | Confidence |
| --- | --- | --- | --- | --- | --- | --- |
| **Invite delivery** | User never sees link; unclear how to find invite | High | Never enters platform | Email user, text QR code, ask coworker | Invite process not robust; no fallback channel | H |
| **First-time login** | SSO fails or is confusing; password reset unclear | Medium-High | Abandons before entering | Emails support, asks colleague | Aging SSO flow; no clear help content | M |
| **Data sync failure** | Upload CSV with wrong files or wrong format | Medium | Loses trust in platform | Re-exports from wearable app, manually retries | No clear file format instructions in-flow; error messages generic | M |
| **Unclear confirmation** | No visual proof data saved; nothing changes after upload | High | Doesn't trust platform; repeats action | Uploads again, checks wearable app directly | No real-time status feedback in UI | H |
| **Missing nudge follow-through** | Receives coaching but unsure if platform recorded their response | High | Doesn't engage with coaching | Ignores nudge or emails WD directly | Unclear if coaching channel is for feedback or one-way broadcast | M |

---

## 5. Metrics & Signals (As-Is)

**Current success metrics:**
- Completion rate for a nudge or challenge
- % of participants who log in more than once per cycle
- Support-ticket volume tied to sync/login issues
- Incentive redemption rate

**Missing telemetry (critical):**
- Drop-off point within login/onboarding flow
- Time-to-first-successful-log
- Device-sync failure rate (by device type)
- Which parts of dashboard participants actually open
- Nudge engagement (opened, clicked, responded)
- Repeat-login frequency (daily vs. weekly vs. once per cycle)

---

## 6. Desired Future-State Journey (What You Want)

| Stage | Desired Behavior | Why It Matters | UX Implication |
| --- | --- | --- | --- |
| **Discover** | Invitation is reliably received and stands out in inbox | First impression matters; if invite is missed, user never enters | Multichannel invite (email + SMS + benefits portal tile) with clear CTA |
| **First Login** | One-tap SSO or simple email/code flow; immediate success | Reduce friction and build confidence | Smooth, error-forgiving login; show what happens next |
| **Onboarding** | Guided tour: connect device → see first data → understand incentive → receive first nudge | Set expectation and show value quickly | Step-by-step wizard with clear "why" and "what's next" |
| **Regular Check-in** | **Weekly or daily usage** (your desired cadence) | Build habit; track progress toward incentive | Make leaderboard, trend charts, and nudges easily visible; push notifications for milestones |
| **Engagement** | **Read coaching from Wellness Director; respond in platform** | Build relationship; close feedback loop | Email-style UI for coaching; clear reply/acknowledge mechanism |
| **Incentive Clarity** | Participant understands which challenges are live, how to win, what incentive payout looks like | Extrinsic motivation → intrinsic motivation | Leaderboard, progress bars, "points toward $X" messaging, weekly streak tracker |

---

## 7. As-Is vs. Future-State — Biggest Gaps

| As-Is Problem | Future-State Requirement | Effort | Risk |
| --- | --- | --- | --- |
| Invite not received | Multichannel delivery + clear CTA | M | Low |
| Confusing first login | Smooth SSO or passwordless; help content | S-M | Low |
| No onboarding | Guided wizard; show value in first 2 minutes | M | Low |
| Low usage frequency | Push notifications, habit-building UX (streaks, leaderboard prominence) | M | Medium (over-notification risk) |
| Nudge feels impersonal/automated | Email UI + clear "from real person" signal | S-M | Low |
| Incentive rules unclear | Clear challenge rules + visual progress tracking | M | Medium (rule complexity varies by employer) |

---

## 8. Assumptions & Unknowns

| Item | Type | Why It Matters | Owner | Next Step |
| --- | --- | --- | --- | --- |
| Participants trust privacy of health data | Assumption | Blocks engagement if false; fear of "data reach employer" | Matt | A/B test privacy explainer message; survey pilot participants |
| Office staff and shift workers have equal device access during work hours | Assumption | Affects cadence; may need alternative entry points | Matt | Audit pilot usage by shift type; understand access constraints |
| Weekly check-in cadence is realistic | Assumption | May be too optimistic given competing demands | Heather | Interview pilot participants on realistic usage patterns |
| Participants understand wearable-to-platform data flow | Assumption | Critical for trust; unclear if current UX explains this | Heather | Usability test: do new users understand device sync? |
| Participants recognize email coaching as from real person, not bot | Assumption | Affects willingness to respond; direct feedback from pilot | Heather | Survey/interview: "Did you trust the nudge came from Heather?" |

---

## 9. Risk & Accessibility Concerns

- **Readability:** Screening results/health data must be understandable for participants with lower health literacy
- **Mobile accessibility:** Screen-reader compatibility, text sizing, touch targets
- **Language access:** Support non-English-speaking employees
- **Shift work:** Can frontline/shift workers realistically access during work hours?
- **HIPAA/Privacy:** Ensure no participant-level data leakage; clear consent flow

---

## 10. Confidence Summary

| Aspect | Confidence | Why |
| --- | --- | --- |
| Participant segment exists & motivations | H | Employer program structure confirmed |
| Entry friction (invite, login) | H | Explicit blockers mentioned |
| Pain points (sync, confirmation, incentive clarity) | M | Grounded in pre-work; pilot data limited |
| Ideal usage cadence (weekly/daily) | M | Aspirational; not yet proven |
| Trust/privacy concerns | L-M | Anticipated but not validated with participants |
