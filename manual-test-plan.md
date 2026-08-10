# Issue #66 manual testing checklist

## Priority 1 — Privacy-Safe Leaderboard (FR-1 to FR-4)
- [ ] **1. Self-rank only visible** — Log in as participant -> in browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=recovery` and inspect the response -> returns only your rank ("You're #X of Y"), no other names.
- [ ] **2. Metric toggle works** — In browser devtools Network, trigger authenticated requests to `GET /api/participant/ranking?metric=recovery`, `workouts_logged`, `points_earned`, and `consistency_streak` -> each returns 200 with rank context.
- [ ] **3. Invalid metric rejected** — In browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=foo` -> 400 Bad Request.
- [ ] **4. Non-participant blocked** — Log in as admin -> in browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=recovery` -> 403 Forbidden.
- [ ] **5. No peer names exposed** — In browser devtools Network, inspect the ranking API response payload -> zero other participant names or `id` values.

## Priority 2 — Tiered, Customizable Nudges (FR-5 to FR-8)
- [ ] **6. Nudge tables exist** — Studio -> Table Editor -> verify `weekly_nudges`, `nudge_acknowledgement_targets`, `nudge_acknowledgements` exist with expected columns.
- [ ] **7. Nudge reply is encrypted** — Submit acknowledgement -> inspect `nudge_acknowledgements.response_text_encrypted` -> ciphertext/bytea, not plaintext.
- [ ] **8. Events nudge card renders** — Log in as participant -> load `http://localhost:3000/my` -> `EventsNudgeCard` visible.

### Detailed manual flow: publish a nudge for `test1@user.com`
1. **Prep in Supabase Studio**
   - Open the `participants` table.
   - Find the participant record linked to `test1@user.com`.
   - Copy that row's `id` value. The admin UI targets nudges by `participant_id`, not by email.
2. **Admin login**
   - Sign in with the configured admin account.
   - Confirm you land on `http://localhost:3000/wellness-director`.
   - If `http://localhost:3000/admin/events` redirects to `http://localhost:3000/login`, your admin session cookie is missing or expired. Sign in again as admin before continuing.
3. **Admin publish flow**
   - Open `http://localhost:3000/admin/events`.
   - Click the **Weekly nudge** tab.
   - Enter the desired message in **Message**.
   - Set **From** as desired.
   - In **Target**, choose **Individual participant**.
   - In **Label / participant id**, paste the participant `id` copied from Supabase.
   - Click **Publish nudge**.
   - Wait for the `✓ Published` confirmation.
4. **Admin verification**
   - In Supabase Studio, confirm a row exists in `weekly_nudges` for the current week.
   - Confirm a linked row exists in `nudge_acknowledgement_targets` with the same `nudge_id` and the target participant `id`.
5. **Participant login**
   - Sign out of the admin account.
   - Sign in as `test1@user.com`.
   - Open `http://localhost:3000/my`.
6. **Participant verification**
   - Confirm the nudge card appears near the top of the dashboard.
   - Confirm the message text is visible.
   - Confirm the card shows an **Acknowledge** button and the helper text `Open-text response required within 48 hours.`
7. **Participant acknowledgement**
   - Click **Acknowledge**.
   - Enter a short response in the browser prompt.
   - Submit the prompt.
   - Confirm the card updates to `Acknowledged: <your response>` and the button disappears.
8. **Encrypted storage verification**
   - Return to Supabase Studio.
   - Open `nudge_acknowledgements`.
   - Find the row for the participant and current nudge.
   - Confirm `acknowledged_at` is set and `response_text_encrypted` is populated.

## Priority 3 — Rewards + Rules (FR-9 to FR-10)
- [ ] **9. Rules page hidden by default** — Load `http://localhost:3000/rules` with `PILOT_CHALLENGES_BASIC` false/unset -> hidden message shown.
- [ ] **10. Rules page shows content** — Set `PILOT_CHALLENGES_BASIC=true`, restart, load `http://localhost:3000/rules` -> Accrual/Caps/Bonuses sections + admin link.
- [ ] **11. Rewards API gated** — With `PILOT_CHALLENGES_BASIC` false/unset, load `http://localhost:3000/rules` as participant -> in browser Network, `GET /api/participant/rewards` returns 404 Not Found.
- [ ] **12. Rewards API works with flag** — Enable flag, restart, load `http://localhost:3000/rules` as participant -> in browser Network, `GET /api/participant/rewards` returns 200 with `visibility_state`, `rewards`, and `rules`.

## Priority 4 — Personal Baseline Comparisons (FR-11 to FR-12)
- [ ] **13. Baseline comparisons render** — Participant loads `http://localhost:3000/my` -> cards show exercise duration, workouts, recovery, HRV, resting HR vs 21-day baseline.
- [ ] **14. Streaks display** — Same dashboard (`http://localhost:3000/my`) -> workout days streak + green recovery streak shown.
- [ ] **15. Personal bests display** — Same dashboard (`http://localhost:3000/my`) -> longest workout, top recovery, top HRV with dates.
- [ ] **16. Trends display** — Same dashboard (`http://localhost:3000/my`) -> trend direction (Improving/Down/Flat) shown per metric.
- [ ] **17. No-data state** — Participant with no wellness data loads `http://localhost:3000/my` -> "No recovery data yet / Upload a WHOOP export" and no crashes.

## Wellness Director Risk Scoring (FR-13 to FR-19)
- [x] **18. Risk dashboard loads** — Log in as admin/wellness director -> `/wellness-director` renders KPI cards + participant grid.
- [x] **19. Engagement score shown** — Select participant -> score breakdown card populates.
- [x] **20. Physiological trend flag** — Same participant -> trend badge shows declining/improving/steady.
- [x] **21. Risk tier color** — Same participant -> Green/Yellow/Red badge + reason text shown.
- [ ] **22. Cold-start "Building baseline"** — Admin/wellness director loads `http://localhost:3000/wellness-director` and selects a participant enrolled <21 days -> "Building baseline" badge instead of risk color.
- [ ] **23. Admin override - snooze** — Load `http://localhost:3000/wellness-director` -> enter note + days -> Snooze -> UI shows Snoozed and, in browser Network, `POST /api/admin/wellness-director-overrides` succeeds.
- [ ] **24. Admin override - dismiss** — Load `http://localhost:3000/wellness-director` -> Dismiss flow -> UI shows Dismissed.
- [ ] **25. Weight editor saves** — Load `http://localhost:3000/wellness-director` -> adjust to valid 100 total -> "Saving..." then "Saved" and, in browser Network, `/api/admin/wellness-director-config` returns 200.
- [ ] **26. Participant blocked from WD dashboard** — Participant loads `http://localhost:3000/wellness-director` -> redirected to `http://localhost:3000/my`.
- [ ] **27. Engagement score weights table** — Studio `engagement_score_weights` -> 5 default weight rows present.
- [ ] **28. Login tracking fires** — Log in -> Studio `login_activity` has new row with correct `auth_user_id` + timestamp.

## Cross-cutting Privacy Checks
- [ ] **29. Admin can't see ranking names** — As admin, in browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=recovery` -> 403 Forbidden.
- [ ] **30. Participant can't see WD data** — As participant, in browser devtools Network, trigger an authenticated request to `GET /api/admin/wellness-director-config` -> 401 or 403.
- [ ] **31. RLS on new tables** — As anon, query `engagement_score_weights` -> only allowed rows (or empty), no cross-participant exposure.

## Still requires manual validation (not fully covered by automated tests)
- [ ] **6. Nudge tables exist** — Studio table presence/shape check.
- [ ] **7. Nudge reply is encrypted** — Verify stored ciphertext/bytea in DB, not just request success.
- [ ] **8. Events nudge card renders** — UI presence is partially covered, but end-to-end participant rendering still needs manual confirmation.
- [ ] **17. No-data state** — Data-logic fallback is covered, but end-to-end no-data dashboard rendering still needs manual confirmation.
- [ ] **22. Cold-start "Building baseline"** — Baseline text is covered, but end-to-end participant selection flow still needs manual confirmation.
- [ ] **23. Admin override - snooze** — API path is covered, but interactive UI + network behavior still needs manual confirmation.
- [ ] **24. Admin override - dismiss** — API path is covered, but interactive UI dismiss flow still needs manual confirmation.
- [ ] **25. Weight editor saves** — API path and slider rendering are covered, but interactive save UX still needs manual confirmation.
- [ ] **26. Participant blocked from WD dashboard** — Redirect logic is covered by middleware tests, but browser redirect behavior still needs manual confirmation.
- [ ] **27. Engagement score weights table** — Studio table contents check.
- [ ] **28. Login tracking fires** — Login write path is covered, but DB row creation should still be verified manually in Studio.
- [ ] **31. RLS on new tables** — Requires live database policy validation.
