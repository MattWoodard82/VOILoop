// metricDefinitions.js
// Source: Heather's "Metric Glossary (Info Bubbles)" tab, VOILoop_Individual_Nudges_InfoBubbles.xlsx
// Usage: <InfoTooltip metricKey="recoveryScore" /> — see InfoTooltip.jsx
//
// IMPORTANT: Sensitive metrics (isSensitive: true) describe the QUESTION, not a score
// or assessment. Do not edit this copy to add clinical language ("symptom," "low,"
// "concerning") — that's a deliberate choice, not an oversight, per Heather's Legend tab.

export const METRIC_DEFINITIONS = {
  sleepDuration: {
    label: 'Sleep Duration',
    category: 'Sleep & Recovery',
    whatItIs: 'How many hours you slept last night, tracked automatically by your wearable.',
    whyItMatters: 'Sleep is one of the biggest things you control that affects how recovered and energized you feel.',
    isSensitive: false,
  },
  hrv: {
    label: 'HRV Score',
    category: 'Sleep & Recovery',
    whatItIs: "HRV stands for Heart Rate Variability — the tiny changes in time between each heartbeat. It sounds technical, but the short version is: a higher number usually means your body is well-rested and handling things well; a lower number can mean you're tired, stressed, or still bouncing back from a hard day.",
    whyItMatters: "It's one of the best clues your body gives you about how ready you are for the day, before you even feel it.",
    isSensitive: false,
  },
  recoveryScore: {
    label: 'Recovery Score',
    category: 'Sleep & Recovery',
    whatItIs: "Think of it like a daily battery level for your body. It's calculated from your sleep, HRV, and how much you've pushed yourself lately, and shows up as green (recharged), yellow (take it easy), or red (rest up).",
    whyItMatters: "It's a quick daily check on whether today is a good day to go hard or a good day to ease off.",
    isSensitive: false,
  },
  dailySteps: {
    label: 'Daily Steps',
    category: 'Activity & Engagement',
    whatItIs: 'The number of steps you took today, counted automatically by your wearable.',
    whyItMatters: 'A simple, familiar way to see how much you moved through your day.',
    isSensitive: false,
  },
  activeMinutes: {
    label: 'Active Minutes',
    category: 'Activity & Engagement',
    whatItIs: 'The number of minutes today your body was moving enough to count as real activity — walking briskly, exercising, anything that gets your heart rate up.',
    whyItMatters: 'Steps count everything; this focuses on the movement that actually gets your body working.',
    isSensitive: false,
  },
  dailyStrain: {
    label: 'Daily Strain',
    category: 'Activity & Engagement',
    whatItIs: "A score for how much stress you put on your body today — workouts, walking, even a physically demanding day. It's not just about exercise.",
    whyItMatters: 'High strain days call for extra recovery; low strain days might be a good time to push a little harder.',
    isSensitive: false,
  },
  stressScore: {
    label: 'Stress Score',
    category: 'Mental Wellbeing & Stress',
    whatItIs: "A quick weekly check-in question asking how stressed you've been feeling.",
    whyItMatters: "It's a moment to reflect on your own — there's no right answer, and it's just for you.",
    isSensitive: true,
  },
  mentalWellbeing: {
    label: 'Mental Wellbeing',
    category: 'Mental Wellbeing & Stress',
    whatItIs: "A short weekly question about your overall mood and how you've been feeling.",
    whyItMatters: 'A quick, private check-in with yourself — not a test, diagnosis, or assessment of any kind.',
    isSensitive: true,
  },
  selfImageConfidence: {
    label: 'Self-Image & Confidence',
    category: 'Mental Wellbeing & Stress',
    whatItIs: "A question asked a few times during the program about how you're feeling about yourself lately.",
    whyItMatters: "A personal reflection point, not a score to worry about or compare to anyone else's.",
    isSensitive: true,
  },
  physicalActivityParticipation: {
    label: 'Physical Activity Participation',
    category: 'Activity & Engagement',
    whatItIs: 'A quick weekly question asking what kind of activity you did — walking, gym, outdoors, or none this week.',
    whyItMatters: "Helps show what kinds of movement actually fit into your week, so it's easier to plan around.",
    isSensitive: false,
  },
  programParticipationSync: {
    label: 'Program Participation (Data Sync)',
    category: 'Activity & Engagement',
    whatItIs: "Whether your wearable's data has synced to the app this week.",
    whyItMatters: 'Keeping this current is what keeps the rest of your dashboard accurate and up to date.',
    isSensitive: false,
  },
};
