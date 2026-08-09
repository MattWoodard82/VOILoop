# Issue #66 manual testing checklist

## Priority 1 — Privacy-Safe Leaderboard (FR-1 to FR-4)
- [ ] **1. Self-rank only visible** — Log in as participant -> `GET /api/participant/ranking?metric=recovery` -> returns only your rank ("You're #X of Y"), no other names.
- [ ] **2. Metric toggle works** — Call ranking API with `recovery`, `workouts_logged`, `points_earned`, `consistency_streak` -> each returns 200 with rank context.
- [ ] **3. Invalid metric rejected** — `GET /api/participant/ranking?metric=foo` -> 400 Bad Request.
- [ ] **4. Non-participant blocked** — Log in as admin -> call `/api/participant/ranking?metric=recovery` -> 403 Forbidden.
- [ ] **5. No peer names exposed** — Inspect ranking API payload -> zero other participant names or `id` values.

## Priority 2 — Tiered, Customizable Nudges (FR-5 to FR-8)
- [ ] **6. Nudge tables exist** — Studio -> Table Editor -> verify `weekly_nudges`, `nudge_acknowledgement_targets`, `nudge_acknowledgements` exist with expected columns.
- [ ] **7. Nudge reply is encrypted** — Submit acknowledgement -> inspect `nudge_acknowledgements.response_text_encrypted` -> ciphertext/bytea, not plaintext.
- [ ] **8. Events nudge card renders** — Log in as participant -> `/my` -> `EventsNudgeCard` visible.

## Priority 3 — Rewards + Rules (FR-9 to FR-10)
- [ ] **9. Rules page hidden by default** — Visit `/rules` with `PILOT_CHALLENGES_BASIC` false/unset -> hidden message shown.
- [ ] **10. Rules page shows content** — Set `PILOT_CHALLENGES_BASIC=true`, restart, visit `/rules` -> Accrual/Caps/Bonuses sections + admin link.
- [ ] **11. Rewards API gated** — `GET /api/participant/rewards` without flag -> 404 Not Found.
- [ ] **12. Rewards API works with flag** — Enable flag and call endpoint as participant -> returns `visibility_state`, `rewards`, and `rules`.

## Priority 4 — Personal Baseline Comparisons (FR-11 to FR-12)
- [ ] **13. Baseline comparisons render** — Participant `/my` -> cards show exercise duration, workouts, recovery, HRV, resting HR vs 21-day baseline.
- [ ] **14. Streaks display** — Same dashboard -> workout days streak + green recovery streak shown.
- [ ] **15. Personal bests display** — Same dashboard -> longest workout, top recovery, top HRV with dates.
- [ ] **16. Trends display** — Same dashboard -> trend direction (Improving/Down/Flat) shown per metric.
- [ ] **17. No-data state** — Participant with no wellness data -> "No recovery data yet / Upload a WHOOP export" and no crashes.

## Wellness Director Risk Scoring (FR-13 to FR-19)
- [x] **18. Risk dashboard loads** — Log in as admin/wellness director -> `/wellness-director` renders KPI cards + participant grid.
- [x] **19. Engagement score shown** — Select participant -> score breakdown card populates.
- [x] **20. Physiological trend flag** — Same participant -> trend badge shows declining/improving/steady.
- [x] **21. Risk tier color** — Same participant -> Green/Yellow/Red badge + reason text shown.
- [ ] **22. Cold-start "Building baseline"** — Participant enrolled <21 days -> "Building baseline" badge instead of risk color.
- [ ] **23. Admin override - snooze** — Enter note + days -> Snooze -> UI shows Snoozed and override API succeeds.
- [ ] **24. Admin override - dismiss** — Dismiss flow -> UI shows Dismissed.
- [ ] **25. Weight editor saves** — Adjust to valid 100 total -> "Saving..." then "Saved" and config API returns 200.
- [ ] **26. Participant blocked from WD dashboard** — Participant visits `/wellness-director` -> redirected to `/my`.
- [ ] **27. Engagement score weights table** — Studio `engagement_score_weights` -> 5 default weight rows present.
- [ ] **28. Login tracking fires** — Log in -> Studio `login_activity` has new row with correct `auth_user_id` + timestamp.

## Cross-cutting Privacy Checks
- [ ] **29. Admin can't see ranking names** — Any admin call to ranking endpoint -> 403 Forbidden.
- [ ] **30. Participant can't see WD data** — Participant calls `/api/admin/wellness-director-config` -> 401 or 403.
- [ ] **31. RLS on new tables** — As anon, query `engagement_score_weights` -> only allowed rows (or empty), no cross-participant exposure.
