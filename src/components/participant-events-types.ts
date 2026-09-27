export interface Event {
  id: string
  title: string
  description: string
  event_date: string
  event_time: string
  location: string
  event_type: string
  recurring: boolean
  recurrence: string | null
  rsvp_enabled: boolean
}

export interface Nudge {
  id: string
  message: string
  author: string
  week_of: string
}

export interface Acknowledgement {
  acknowledged_at: string
  response_text: string
  response_due_at: string
}

export interface HistoryNudge extends Nudge {
  acknowledgement: Acknowledgement | null
}

export interface ParticipantEventsCardData {
  events?: Event[]
  nudge?: Nudge | null
  acknowledgement?: Acknowledgement | null
  history?: HistoryNudge[]
  rsvpEventIds?: string[]
}
