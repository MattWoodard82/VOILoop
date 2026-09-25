export interface CalculationDefinition {
  label: string
  whatItIs: string
  whyItMatters?: string
}

export const CALCULATION_DEFINITIONS = {
  baselineWindow: {
    label: 'Baseline window',
    whatItIs: 'The fixed comparison period used to establish this participant’s baseline averages.',
  },
  comparisonWindow: {
    label: 'Comparison window',
    whatItIs: 'The exact seven-day period included in this calculation. Start and end dates are both included.',
  },
  sleepAverage: {
    label: 'Average sleep duration',
    whatItIs: 'Average hours slept across nights in this window that contain sleep-duration data.',
    whyItMatters: 'The count shows how many nights contributed to this average.',
  },
  hrvAverage: {
    label: 'Average HRV',
    whatItIs: 'Average heart-rate variability in milliseconds across nights with HRV data.',
    whyItMatters: 'This is the raw value before it is converted into the HRV trend score.',
  },
  recoveryAverage: {
    label: 'Average recovery score',
    whatItIs: 'Average WHOOP recovery score across nights with recovery data, on a 0–100 scale.',
  },
  dayStrainAverage: {
    label: 'Average daily strain',
    whatItIs: 'Average whole-day WHOOP strain across nights with daily-strain data.',
    whyItMatters: 'This is shown for comparison and is not an input to the production Strain-Recovery Balance score.',
  },
  workoutStrainAverage: {
    label: 'Average workout strain',
    whatItIs: 'Average strain across individual workouts in the window.',
    whyItMatters: 'This is shown for comparison and is not an input to the production Strain-Recovery Balance score.',
  },
  hrvBaseline: {
    label: 'Baseline average HRV',
    whatItIs: 'The participant’s average HRV during the fixed baseline window.',
    whyItMatters: 'All later HRV changes are measured against this value.',
  },
  hrvChange: {
    label: 'HRV change from baseline',
    whatItIs: 'The percentage difference between this window’s average HRV and the participant’s baseline average HRV.',
  },
  sleepScore: {
    label: 'Sleep score',
    whatItIs: 'A 0–100 score comparing average sleep duration with the 7.5-hour target. Values are capped at 100.',
  },
  hrvScore: {
    label: 'HRV trend score',
    whatItIs: 'A 0–100 score calculated as 50 plus twice the HRV percentage change from baseline. Values are capped between 0 and 100.',
    whyItMatters: 'The baseline score is 50 by definition; this is not raw HRV in milliseconds.',
  },
  zone2Score: {
    label: 'Zone 2+ activity score',
    whatItIs: 'A 0–100 score based on minutes spent in heart-rate Zones 2–5 per calendar day compared with the 20-minute daily target.',
  },
  recoveryScore: {
    label: 'Recovery score',
    whatItIs: 'The average recovery score for the window, limited to the 0–100 score range.',
  },
  strainScore: {
    label: 'Strain-Recovery Balance score',
    whatItIs: 'A recovery-only score: 100 when recovery meets or exceeds baseline; otherwise reduced by twice the percentage decline.',
    whyItMatters: 'Workout strain and daily strain averages are not inputs to this production score.',
  },
  teamHealthScore: {
    label: 'Team Health Score',
    whatItIs: 'The weighted result: Sleep 30%, HRV 25%, Zone 2+ 20%, Recovery 15%, and Strain-Recovery Balance 10%.',
    whyItMatters: 'If a component is unavailable, the available component weights are proportionally rebalanced.',
  },
  wellnessNights: {
    label: 'Nights with wellness data',
    whatItIs: 'The number of saved nightly wellness records assigned to this window.',
    whyItMatters: 'A night can still be missing an individual metric, so metric-specific counts may be lower.',
  },
  usableWorkouts: {
    label: 'Workouts with usable Zone 2+ data',
    whatItIs: 'The number of workouts with both duration and at least one Zone 2–5 percentage, followed by total workouts in the window.',
  },
  onsetDatedNights: {
    label: 'Nights dated from sleep onset',
    whatItIs: 'Records assigned to a reporting night using sleep onset. An onset before 6:00 AM is assigned to the previous night.',
  },
  fallbackDatedNights: {
    label: 'Nights dated without sleep onset',
    whatItIs: 'Records whose saved wellness date was used because sleep onset was unavailable.',
    whyItMatters: 'This can change which HRV and recovery readings fall inside a reporting window.',
  },
  dataSources: {
    label: 'Data sources',
    whatItIs: 'The source CSV file and imported field used for each displayed measurement.',
  },
  formulaSettings: {
    label: 'Formula settings',
    whatItIs: 'The fixed targets and multipliers used by the Team Health formulas.',
  },
  sleepTarget: {
    label: 'Sleep target',
    whatItIs: 'The 7.5-hour nightly target used to convert average sleep duration into the 0–100 Sleep score.',
  },
  zone2Target: {
    label: 'Zone 2+ target',
    whatItIs: 'The 20-minute-per-calendar-day target used to convert Zone 2–5 activity time into the 0–100 Zone 2+ score.',
  },
  hrvMultiplier: {
    label: 'HRV multiplier',
    whatItIs: 'The factor of 2 applied to the HRV percentage change when calculating the normalized HRV trend score.',
  },
  recoveryDeclineMultiplier: {
    label: 'Recovery-decline multiplier',
    whatItIs: 'The factor of 2 applied to a recovery decline when calculating the Strain-Recovery Balance score.',
  },
  strainFormula: {
    label: 'Strain-Recovery Balance formula',
    whatItIs: 'The confirmed production formula uses recovery relative to baseline and does not use workout or daily strain.',
  },
  dateConfidence: {
    label: 'Night-date confidence',
    whatItIs: 'Shows whether all nights were dated from sleep onset or whether any had to use the saved wellness date.',
  },
  timezoneNote: {
    label: 'Timezone note',
    whatItIs: 'WHOOP timestamps are interpreted using the Cycle timezone during import.',
    whyItMatters: 'Older records imported before the timezone correction may need reimport or repair before exact parity can be verified.',
  },
} satisfies Record<string, CalculationDefinition>

export type CalculationDefinitionKey = keyof typeof CALCULATION_DEFINITIONS
