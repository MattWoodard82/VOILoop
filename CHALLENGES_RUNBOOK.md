# Challenges Feature — Pilot Smoke-Test Runbook

## Overview

This runbook covers local setup, admin/participant smoke testing, and rollback for the
`PILOT_CHALLENGES_BASIC` feature (Issue #16).

---

## Prerequisites

1. Supabase CLI running locally (`supabase start`)
2. `supabase/migrations` applied (all files in order)
3. App running locally (`npm run dev`)
4. At least one admin user and one participant user in the database

---

## Environment setup

Add to your `.env.local`:

```env
PILOT_CHALLENGES_BASIC=true
CRON_SECRET=local-dev-cron-secret   # optional for local dev
```

Restart the dev server after changing `.env.local`.

---

## Admin smoke-test flow

### 1. Create a draft challenge

```
POST /api/admin/challenges
{
  "name": "Pilot Actions Challenge",
  "metric_type": "actions_count",
  "threshold_value": 3,
  "window_start_at": "<today>T00:00:00.000Z",
  "window_end_at": "<today+14d>T23:59:59.000Z",
  "eligibility_mode": "all_participants"
}
```

Expected: `201` with `status: "draft"`.

### 2. Verify draft appears in list

```
GET /api/admin/challenges
```

Expected: challenge appears with `status: "draft"`.

### 3. Attempt to edit immutable fields while draft (should succeed)

```
PATCH /api/admin/challenges/{id}
{ "version": 1, "threshold_value": 5 }
```

Expected: `200`, threshold updated.

### 4. Activate the challenge

Via admin UI → click **Activate** → confirm modal → click **Confirm activate**.

Or via API:
```
POST /api/admin/challenges/{id}/activate
{ "version": <current_version> }
```

Expected: `200`, `status: "active"`. Participant rows seeded in `challenge_participants`.

### 5. Try to activate a second challenge (should fail)

Create another draft. Try to activate it.

Expected: `409` with `code: "CHALLENGE_ACTIVE_EXISTS"`.
UI: error message "Another challenge is already active…"

### 6. Try to edit immutable fields while active (should fail)

```
PATCH /api/admin/challenges/{id}
{ "version": <current_version>, "threshold_value": 10 }
```

Expected: `400` with message `Field "threshold_value" cannot be edited while active`.

### 7. Edit allowed fields while active

```
PATCH /api/admin/challenges/{id}
{ "version": <current_version>, "name": "Updated Name", "description": "New desc" }
```

Expected: `200`, name/description updated.

### 8. Run manual recompute

```
POST /api/admin/challenges/recompute
```

Expected: `200` with `updated_participants` count. Check admin detail panel for updated progress.

### 9. View participant progress

```
GET /api/admin/challenges/{id}/participants
GET /api/admin/challenges/{id}/participants?status=completed
```

Expected: participant rows with `progress_value`, `completed`.

### 10. Cancel the active challenge

Via admin UI → click **Cancel** → enter reason → **Confirm cancel**.

Expected: `200`, `status: "cancelled"`. Participant dashboard shows cancelled state.

### 11. Complete a challenge (manual force-close)

Activate a new challenge. Click **Complete** in admin UI.

Expected: `200`, `status: "completed"`.

---

## Participant smoke-test flow

### 1. Log in as a participant

Navigate to `/my` dashboard.

### 2. Verify challenge card appears

With an active challenge: challenge card should show name, threshold, progress bar, last updated.

### 3. Verify progress updates after recompute

Upload a WHOOP export (or trigger recompute via admin UI). Refresh `/my`.

Expected: progress bar advances.

### 4. Verify completion badge

Once `progress_value >= threshold_value` after a recompute:
- Progress bar fills to 100%
- Badge shows "completed"
- Timestamp displayed

### 5. Verify ineligible state

If the participant is not in `challenge_participants.is_eligible = true`:
- Card shows "You are not eligible for the current challenge."

### 6. Verify API endpoint directly

```
GET /api/participant/challenge
```
(Must be authenticated as a participant user)

Expected payload example:
```json
{
  "visibility_state": "eligible",
  "id": "...",
  "name": "Pilot Actions Challenge",
  "status": "active",
  "threshold_value": 3,
  "window_start_at": "...",
  "window_end_at": "...",
  "progress_value": 2,
  "completed": false,
  "completed_at": null,
  "last_computed_at": "..."
}
```

---

## Scheduled recompute (cron) verification

### Local test

```
GET /api/cron/challenge-recompute
Authorization: Bearer local-dev-cron-secret
```

Expected: `200` with `active_challenge` and `updated_participants`.

### Production / Vercel

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/challenge-recompute",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

Set `CRON_SECRET` in Vercel environment variables. Vercel passes it as `Authorization: Bearer` automatically.

---

## Observability check

Review structured logs for these events:
- `challenge_created`
- `challenge_activated`
- `challenge_recompute_completed`
- `challenge_cron_recompute_completed`
- `challenge_recompute_lag_high` (warning; fires if lag > 30 min)
- `challenge_cancelled`
- `challenge_completed`

---

## Rollback

1. Set `PILOT_CHALLENGES_BASIC=false` in environment and redeploy.
   - All challenge API routes return `404`.
   - Challenge card is hidden from participant dashboard.
   - Admin sidebar entry is hidden.

2. Data is preserved read-only in `challenges`, `challenge_participants`, `challenge_audit_log`.

3. Stop the cron schedule if using Vercel Cron (remove from `vercel.json` or disable in dashboard).

---

## Acceptance checklist

- [ ] Admin can create a draft challenge with validated required fields
- [ ] Admin cannot activate if any required field is invalid
- [ ] Admin cannot activate if another challenge is already active
- [ ] Exactly one active challenge exists at any time
- [ ] Eligible participant sees active challenge with accurate threshold and progress values
- [ ] Completion flips exactly once per participant when `progress >= threshold` within window
- [ ] Duplicate events / retries do not create duplicate completion side effects
- [ ] Active challenge immutable fields cannot be edited; API returns clear validation error
- [ ] Completed/cancelled challenges reject rule mutations
- [ ] Event-driven updates + scheduled recompute converge within 15-minute consistency target
- [ ] Recompute and event failures are observable via logs
- [ ] Authorization boundaries are enforced for all admin and participant endpoints
- [ ] Audit log records all admin lifecycle actions with actor and timestamp
- [ ] `GET /api/participant/challenge` returns correct payload shape
- [ ] Cron endpoint rejects requests without correct `CRON_SECRET`
