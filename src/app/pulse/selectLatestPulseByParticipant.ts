import type { PulseSurvey } from '@/types'

// `date` is unique per participant (DB constraint on pulse_surveys), so date
// ties should never occur in practice; `id` is used only as a deterministic,
// order-independent fallback so this comparison never depends on the order
// rows happen to arrive from the database.
function isNewerPulseSubmission(candidate: PulseSurvey, current: PulseSurvey): boolean {
  if (candidate.date !== current.date) return candidate.date > current.date
  return candidate.id > current.id
}

// Reduces a week's pulse rows (which can include multiple submissions per
// participant, one per day) down to each participant's single newest
// submission, for display in the per-participant summary. This must not be
// order-dependent (unlike a naive Object.fromEntries over the array), because
// a participant with multiple submissions in the week would otherwise have
// their newest response silently overwritten by an older one.
export function selectLatestPulseByParticipant(pulse: PulseSurvey[]): Record<string, PulseSurvey> {
  return pulse.reduce<Record<string, PulseSurvey>>((map, entry) => {
    const existing = map[entry.participant_id]
    if (!existing || isNewerPulseSubmission(entry, existing)) {
      map[entry.participant_id] = entry
    }
    return map
  }, {})
}
