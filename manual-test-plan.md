# Issue #66 manual testing checklist

## Priority 1 — Privacy-Safe Leaderboard (FR-1 to FR-4)
- [x] **1. Self-rank only visible** — Log in as participant -> in browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=recovery` and inspect the response -> returns only your rank ("You're #X of Y"), no other names.
- [x] **2. Metric toggle works** — In browser devtools Network, trigger authenticated requests to `GET /api/participant/ranking?metric=recovery`, `workouts_logged`, `points_earned`, and `consistency_streak` -> each returns 200 with rank context.
- [x] **3. Invalid metric rejected** — In browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=foo` -> 400 Bad Request.
- [x] **4. Non-participant blocked** — Log in as admin -> in browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=recovery` -> 403 Forbidden.
- [x] **5. No peer names exposed** — In browser devtools Network, inspect the ranking API response payload -> zero other participant names or `id` values.

### Detailed manual flow: verify privacy-safe leaderboard
1. **Participant login**
    - Sign out of any admin or wellness director session.
    - Sign in as a participant account such as `test1@user.com`.
    - Confirm you land on `http://localhost:3000/my`.
2. **Optional UI verification**
    - Navigate to `http://localhost:3000/team`.
    - If the page loads, confirm it shows participant-facing rank context only and does not expose coworker names as a leaderboard.
    - If you see the fallback message `Your participant record is being prepared. Check back shortly.`, continue with the API checks below; the privacy-safe API validation is the source of truth for Priority 1.
3. **Open browser devtools**
    - Open devtools and switch to the **Network** tab.
    - Make sure **Preserve log** is enabled if your browser supports it.
4. **Self-rank check**
    - In the browser address bar, open:
    - `http://localhost:3000/api/participant/ranking?metric=recovery`
    - Confirm the response status is **200**.
    - Inspect the JSON response body.
    - Confirm it contains a top-level `context` object.
    - Confirm the payload includes participant-safe fields such as:
    - `metric`
    - `metric_label`
    - `participant_rank`
    - `cohort_size`
    - `cohort_percentile`
    - `comparison_text`
    - `rank_context`
    - Confirm the response describes only **your** rank context (for example, "Ahead of X participants, behind Y.").
5. **Metric toggle checks**
    - Repeat the same request for:
    - `http://localhost:3000/api/participant/ranking?metric=workouts_logged`
    - `http://localhost:3000/api/participant/ranking?metric=points_earned`
    - `http://localhost:3000/api/participant/ranking?metric=consistency_streak`
    - Confirm each request returns **200**.
    - Confirm each response returns a `context` object for the requested metric.
6. **Invalid metric rejection**
    - Open:
    - `http://localhost:3000/api/participant/ranking?metric=foo`
    - Confirm the response status is **400**.
    - Confirm the response body contains `{ "error": "Invalid metric." }`.
7. **No peer identity leakage**
    - In each successful ranking response, confirm the payload does **not** include:
    - other participant names
    - `first_name`
    - `last_name`
    - other participant `id` values
    - Confirm the response does not contain a ranked list of coworkers.
    - Confirm the response only gives anonymous cohort context, not named peer comparison.
8. **Non-participant blocked**
    - Sign out of the participant account.
    - Sign in as an admin account.
    - Open:
    - `http://localhost:3000/api/participant/ranking?metric=recovery`
    - Confirm the response status is **403**.
    - Confirm the response body contains `{ "error": "Forbidden" }`.

## Priority 2 — Tiered, Customizable Nudges (FR-5 to FR-8)
- [x] **6. Nudge tables exist** — Studio -> Table Editor -> verify `weekly_nudges`, `nudge_acknowledgement_targets`, `nudge_acknowledgements` exist with expected columns.
- [x] **7. Nudge reply is encrypted** — Submit acknowledgement -> inspect `nudge_acknowledgements.response_text_encrypted` -> ciphertext/bytea, not plaintext.
- [x] **8. Events nudge card renders** — Log in as participant -> load `http://localhost:3000/my` -> `EventsNudgeCard` visible.

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
- [x] **9. Rules page hidden by default** — Historical check only; rollout gate has been removed, so this step is no longer applicable on the current branch.
- [x] **10. Rules page shows content** — Load `http://localhost:3000/rules` -> Accrual/Caps/Bonuses sections + admin link.
- [x] **11. Rewards API gated** — Historical check only; rollout gate has been removed, so `/api/participant/rewards` should no longer return rollout-based 404s on the current branch.
- [x] **12. Rewards API works** — Load `http://localhost:3000/rules` as participant -> in browser Network, `GET /api/participant/rewards` returns 200 with `visibility_state`, `rewards`, and `rules`.

### Detailed manual flow: verify Rewards + Rules content
1. **Participant login**
    - Sign out of any admin or wellness director account.
    - Sign in as a participant account such as `test1@user.com`.
    - Confirm you land on `http://localhost:3000/my`.
2. **Open the Rules page**
    - In the same authenticated browser session, navigate to `http://localhost:3000/rules`.
    - Wait for the page to finish loading.
3. **Page-level verification**
    - Confirm the page title reads **Rules**.
    - Confirm the page contains a card titled **Rewards rules**.
    - Confirm the helper text `Transparent rollout notes for points, PTO request handoff, and approvals.` is visible.
4. **Rules content verification**
    - Confirm three sections are rendered with the headings:
    - **Accrual**
    - **Caps**
    - **Bonuses**
    - Confirm the **Accrual** section contains the text `Points accrue daily from eligible wellness activities.`
    - Confirm the **Caps** section contains the text `Weekly point caps are enforced by the active rewards policy.`
    - Confirm the **Bonuses** section contains the text `Bonus points are awarded only after the associated activity is confirmed or explicitly approved by an operator.`
5. **Operator link verification**
    - Confirm a second card is visible with the heading **Operator order**.
    - Confirm that card contains the text `Review rules content, then open rewards for participants.`
    - Confirm an **Open admin** link is visible.
    - Click **Open admin** and verify it navigates to `http://localhost:3000/admin`.
    - If the admin page redirects to login or blocks access while signed in as a participant, that is expected; the important check is that the link exists and targets `/admin`.
6. **Network verification**
    - Open browser devtools and switch to the **Network** tab.
    - Reload `http://localhost:3000/rules`.
    - Find the request to `GET /api/participant/rewards`.
    - Confirm the response status is **200**.
7. **API payload verification**
    - Inspect the JSON response body for `GET /api/participant/rewards`.
    - Confirm the payload includes top-level keys:
    - `visibility_state`
    - `rewards`
    - `rules`
    - Confirm `rules` contains:
    - `accrual_text`
    - `cap_text`
    - `bonus_text`
    - `updated_at`
    - If there is an active challenge, confirm `rewards.challenge` is populated.
    - If there is no active challenge, confirm `rewards` is `null` and the response still returns **200**.

## Priority 4 — Personal Baseline Comparisons (FR-11 to FR-12)
- [x] **13. Baseline comparisons render** — Participant loads `http://localhost:3000/my` -> cards show exercise duration, workouts, recovery, HRV, resting HR vs 21-day baseline.
- [x] **14. Streaks display** — Same dashboard (`http://localhost:3000/my`) -> workout days streak + green recovery streak shown.
- [x] **15. Personal bests display** — Same dashboard (`http://localhost:3000/my`) -> longest workout, top recovery, top HRV with dates.
- [x] **16. Trends display** — Same dashboard (`http://localhost:3000/my`) -> trend direction (Improving/Down/Flat) shown per metric.
- [x] **17. No-data state** — Participant with no wellness data loads `http://localhost:3000/my` -> "No recovery data yet / Upload a WHOOP export" and no crashes.

## Wellness Director Risk Scoring (FR-13 to FR-19)
- [x] **18. Risk dashboard loads** — Log in as admin/wellness director -> `/wellness-director` renders KPI cards + participant grid.
- [x] **19. Engagement score shown** — Select participant -> score breakdown card populates.
- [x] **20. Physiological trend flag** — Same participant -> trend badge shows declining/improving/steady.
- [x] **21. Risk tier color** — Same participant -> Green/Yellow/Red badge + reason text shown.
- [x] **22. Cold-start "Building baseline"** — Admin/wellness director loads `http://localhost:3000/wellness-director` and selects a participant enrolled <21 days -> "Building baseline" badge instead of risk color.
- [x] **23. Admin override - snooze** — Load `http://localhost:3000/wellness-director` -> enter note + days -> Snooze -> UI shows Snoozed and, in browser Network, `POST /api/admin/wellness-director-overrides` succeeds.
- [x] **24. Admin override - dismiss** — Load `http://localhost:3000/wellness-director` -> Dismiss flow -> UI shows Dismissed.
- [x] **25. Weight editor saves** — Load `http://localhost:3000/wellness-director` -> adjust to valid 100 total -> "Saving..." then "Saved" and, in browser Network, `/api/admin/wellness-director-config` returns 200.
- [x] **26. Participant blocked from WD dashboard** — Participant loads `http://localhost:3000/wellness-director` -> redirected to `http://localhost:3000/my`.
- [x] **27. Engagement score weights table** — Studio `engagement_score_weights` -> 5 default weight rows present.
- [x] **28. Login tracking fires** — Log in -> Studio `login_activity` has new row with correct `auth_user_id` + timestamp.

### Detailed manual flow: verify cold-start "Building baseline"
1. **Use the seeded cold-start participant**
   - The current seed data is configured so **Caleb Stone (`EMP010`)** has a recent `enrolled_date`.
   - This is the participant who should show the cold-start state for manual step 22.
2. **Optional DB verification in Supabase Studio**
   - Open the `participants` table.
   - Find row `EMP010`.
   - Confirm `first_name = Caleb`, `last_name = Stone`.
   - Confirm `enrolled_date = 2026-08-01`.
   - With the current date, this should put Caleb inside the `< 21 days` baseline-building window.
3. **Admin login**
   - Sign in as an admin or wellness director account.
   - Open `http://localhost:3000/wellness-director`.
4. **Select the participant**
   - In the participant list/grid, locate **Caleb Stone**.
   - Click Caleb to load the participant detail cards.
5. **Risk tier card verification**
   - Find the **Risk tier** card.
   - Confirm it shows the badge **Building baseline** instead of a Green / Yellow / Red risk badge.
   - Confirm the supporting text reads **Baseline still forming** when no other trigger reasons override it.
6. **Baseline / overrides card verification**
   - Find the **Baseline / overrides** card.
   - Confirm it shows **Baseline building (X days remaining)** instead of **Baseline ready**.
   - The exact number of days remaining may vary depending on the current date, but it should be greater than `0`.
7. **Negative check**
   - Select a longer-enrolled participant such as **Colin Stephenson (`EMP005`)** or **Travis Brandenburgh (`EMP001`)**.
   - Confirm they do **not** show **Building baseline**.
   - Confirm they show their normal risk color badge or risk label instead.

## Cross-cutting Privacy Checks
- [x] **29. Admin can't see ranking names** — As admin, in browser devtools Network, trigger an authenticated request to `GET /api/participant/ranking?metric=recovery` -> 403 Forbidden.
- [x] **30. Participant can't see WD data** — As participant, in browser devtools Network, trigger an authenticated request to `GET /api/admin/wellness-director-config` -> 401 or 403.
- [x] **31. RLS on new tables** — As anon, query `engagement_score_weights` -> only allowed rows (or empty), no cross-participant exposure.

## Still requires manual validation (not fully covered by automated tests)
- [x] **6. Nudge tables exist** — Studio table presence/shape check.
- [x] **7. Nudge reply is encrypted** — Verify stored ciphertext/bytea in DB, not just request success.
- [x] **8. Events nudge card renders** — UI presence is partially covered, but end-to-end participant rendering still needs manual confirmation.
- [x] **17. No-data state** — Data-logic fallback is covered, but end-to-end no-data dashboard rendering still needs manual confirmation.
- [x] **22. Cold-start "Building baseline"** — Baseline text is covered, but end-to-end participant selection flow still needs manual confirmation.
- [x] **23. Admin override - snooze** — API path is covered, but interactive UI + network behavior still needs manual confirmation.
- [x] **24. Admin override - dismiss** — API path is covered, but interactive UI dismiss flow still needs manual confirmation.

## Challenge recompute cron validation

- [ ] **Local automated cron auth** — Run `npm test -- --runInBand src/lib/challenges/__tests__/access.test.ts src/app/api/admin/challenges/recompute/route.test.ts` and confirm the cron-secret path is accepted without a session.
- [ ] **Local automated recompute logic** — Run `npm test -- --runInBand src/lib/challenges/__tests__/progress.test.ts` and confirm scheduled recompute still updates progress and audit metadata correctly.
- [ ] **Local route invocation with cron secret** — Start localhost, set `CRON_SECRET`, then `curl -X POST http://localhost:3000/api/admin/challenges/recompute -H "Authorization: Bearer <CRON_SECRET>"` and confirm JSON includes either `active_challenge` info or `{ "active_challenge": null, "updated_participants": 0 }`.
- [ ] **Production cron observability** — In Vercel, confirm the cron schedule targets `/api/admin/challenges/recompute`, uses the same `CRON_SECRET`, and emits periodic `challenge_recompute_triggered` / `challenge_recompute_completed` logs or `challenge_recompute_no_active` when nothing is active.
- [ ] **25. Weight editor saves** — API path and slider rendering are covered, but interactive save UX still needs manual confirmation.
- [ ] **26. Participant blocked from WD dashboard** — Redirect logic is covered by middleware tests, but browser redirect behavior still needs manual confirmation.
- [ ] **27. Engagement score weights table** — Studio table contents check.
- [ ] **28. Login tracking fires** — Login write path is covered, but DB row creation should still be verified manually in Studio.
- [ ] **31. RLS on new tables** — Requires live database policy validation.
