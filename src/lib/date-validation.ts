// Shared "is this a real calendar date" validator, used by any API route that
// accepts a 'YYYY-MM-DD' string from a client (team-health-score and
// team-health-score-config routes so far).
//
// A plain regex like /^\d{4}-\d{2}-\d{2}$/ matches the *shape* of a date but not
// its validity - JavaScript's Date constructor silently normalizes an impossible
// date like '2026-02-31' into '2026-03-03', so a format-only check lets invalid
// calendar dates slip through as a 400-worthy client error that instead surfaces
// as incorrect window filtering/labels, or (for baseline_start/baseline_end,
// which get persisted) an eventual Postgres `date` column error returned as a
// 500. Round-tripping the parsed date back to the same string catches this.
const DATE_SHAPE_RE = /^\d{4}-\d{2}-\d{2}$/

export function isValidCalendarDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_SHAPE_RE.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(parsed.getTime())) return false
  return parsed.toISOString().slice(0, 10) === value
}
