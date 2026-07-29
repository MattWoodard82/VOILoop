'use client'
import { useState } from 'react'

// ── Pulse Survey Questions ────────────────────────────────────────────────
const QUESTIONS = [
  {
    key: 'wellbeing_score',
    label: 'Overall wellbeing',
    question: 'How would you rate your mental wellbeing this week?',
    help: '1 = Struggling significantly · 10 = Feeling my best',
    low: 'Struggling',
    high: 'Feeling great',
  },
  {
    key: 'burnout_score',
    label: 'Burnout level',
    question: 'How much stress are you experiencing this week?',
    help: '1 = No stress at all · 10 = Extremely stressed',
    low: 'No stress',
    high: 'Very stressed',
    invert: true,
  },
  {
    key: 'energy_score',
    label: 'Energy at end of shift',
    question: 'How much energy have you had this week overall?',
    help: '1 = Completely drained · 10 = Full of energy',
    low: 'Drained',
    high: 'Energized',
  },
  {
    key: 'manager_support',
    label: 'Manager support',
    question: 'How supported do you feel by your direct manager?',
    help: '1 = Not supported at all · 10 = Fully supported',
    low: 'Not supported',
    high: 'Fully supported',
  },
  {
    key: 'work_life_balance',
    label: 'Work-life balance',
    question: 'How well are you maintaining a balance between work and personal life?',
    help: '1 = Very poor balance · 10 = Great balance',
    low: 'Poor balance',
    high: 'Great balance',
  },
  {
    key: 'psych_safety',
    label: 'Psychological safety',
    question: 'How comfortable do you feel speaking up or asking for help at work?',
    help: '1 = Not comfortable at all · 10 = Very comfortable',
    low: 'Not comfortable',
    high: 'Very comfortable',
  },
  {
    key: 'workload_score',
    label: 'Workload manageability',
    question: 'How manageable does your workload feel right now?',
    help: '1 = Completely overwhelming · 10 = Very manageable',
    low: 'Overwhelming',
    high: 'Manageable',
  },
  {
    key: 'recommend_score',
    label: 'Workplace recommendation',
    question: 'How likely are you to recommend this workplace to a peer?',
    help: '1 = Not likely at all · 10 = Extremely likely',
    low: 'Not likely',
    high: 'Very likely',
  },
]

function scoreColor(val: number, invert?: boolean) {
  const v = invert ? 11 - val : val
  if (v >= 8) return '#69BE28'
  if (v >= 5) return '#FFA500'
  return '#ff6b6b'
}

export default function SurveyPage() {
  const [step, setStep] = useState<'intro' | 'survey' | 'done'>('intro')
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [currentQ, setCurrentQ] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const setAnswer = (val: number) => {
    const key = QUESTIONS[currentQ].key
    setAnswers(prev => ({ ...prev, [key]: val }))
  }

  const goNext = () => {
    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1)
    } else {
      handleSubmit()
    }
  }

  const goPrev = () => {
    if (currentQ > 0) setCurrentQ(currentQ - 1)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setSubmitError('')
    try {
      const response = await fetch('/api/pulse/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          wellbeing_score: answers.wellbeing_score ?? null,
          burnout_score: answers.burnout_score ?? null,
          manager_support: answers.manager_support ?? null,
          energy_score: answers.energy_score ?? null,
          psych_safety: answers.psych_safety ?? null,
          workload_score: answers.workload_score ?? null,
          work_life_balance: answers.work_life_balance ?? null,
          recommend_score: answers.recommend_score ?? null,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        const message = typeof body?.error === 'string' && body.error.length > 0
          ? body.error
          : 'Unable to submit your survey right now.'
        setSubmitError(message)
        return
      }

      setStep('done')
    } catch {
      setSubmitError('Unable to submit your survey right now.')
    } finally {
      setSubmitting(false)
    }
  }

  const q = QUESTIONS[currentQ]
  const currentAnswer = answers[q?.key]
  const progress = ((currentQ + 1) / QUESTIONS.length) * 100

  // ── STYLES ──────────────────────────────────────────────────────────────
  const pageStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#0d1f35',
    fontFamily: 'Inter, sans-serif',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px 16px',
  }

  const cardStyle: React.CSSProperties = {
    width: '100%',
    maxWidth: 520,
    background: '#002244',
    border: '1px solid #0a3560',
    borderRadius: 14,
    overflow: 'hidden',
  }

  // ── INTRO STEP ─────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
          {/* Header */}
          <div style={{ background: '#001a33', padding: '20px 24px', borderBottom: '1px solid #0a3560' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="14" stroke="#0a3560" strokeWidth="2.5"/>
                <path d="M18,4 A14,14 0 0,1 31,21" stroke="#69BE28" strokeWidth="2.5" strokeLinecap="round"/>
                <path d="M31,21 A14,14 0 0,1 18,32" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.65"/>
                <path d="M18,32 A14,14 0 0,1 5,21" stroke="#69BE28" strokeWidth="1.8" strokeLinecap="round" opacity="0.4"/>
                <circle cx="18" cy="18" r="5" fill="#001a33"/>
              </svg>
              <div>
                <span style={{ fontWeight: 700, fontSize: 16, color: '#69BE28' }}>VOI</span>
                <span style={{ fontWeight: 300, fontSize: 16, color: '#fff' }}>Loop</span>
              </div>
            </div>
            <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Monthly pulse survey</div>
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              8 questions · takes under 2 minutes · completely confidential.<br/>
              Your responses are visible only to your Wellness Director.
            </div>
          </div>

          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6, marginBottom: 10 }}>
              This survey is tied to your authenticated account and can only be submitted for your own profile.
            </div>
            <button
              onClick={() => setStep('survey')}
              style={{
                width: '100%',
                marginTop: 8,
                background: '#69BE28',
                color: '#002244',
                border: 'none',
                borderRadius: 8,
                padding: '13px',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              Start survey →
            </button>

            <div style={{ marginTop: 16, padding: '10px 12px', background: '#001a33', borderRadius: 8, fontSize: 11, color: '#A5ACAF', lineHeight: 1.5 }}>
              🔒 Your answers are private. They are never shared with your manager or HR leadership. Leadership only sees group averages.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── DONE STEP ────────────────────────────────────────────────────────────
  if (step === 'done') {
    const scores = QUESTIONS.map(q => ({ ...q, val: answers[q.key] })).filter(q => q.val)

    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, maxWidth: 560 }}>
          <div style={{ background: '#001a33', padding: '20px 24px', borderBottom: '1px solid #0a3560', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Thank you!</div>
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              Your responses have been saved.
            </div>
          </div>

          <div style={{ padding: '20px 24px' }}>
            {/* Score summary */}
            <div style={{ fontSize: 10, color: '#A5ACAF', textTransform: 'uppercase', letterSpacing: '.07em', fontWeight: 600, marginBottom: 8 }}>
              Your responses this month
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
              {scores.map(s => (
                <div key={s.key} style={{ background: '#001a33', borderRadius: 7, padding: '9px 11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#A5ACAF' }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor(s.val, s.invert) }}>{s.val}<span style={{ fontSize: 9, color: '#A5ACAF' }}>/10</span></div>
                </div>
              ))}
            </div>

            <div style={{ padding: '12px 14px', background: '#001a33', borderRadius: 8, fontSize: 11, color: '#A5ACAF', lineHeight: 1.6 }}>
              🔒 These responses are private — only your Wellness Director can see your individual answers. Leadership sees group averages only.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SURVEY STEP ─────────────────────────────────────────────────────────
  return (
    <div style={pageStyle}>
      <div style={{ ...cardStyle, maxWidth: 520 }}>

        {/* Progress bar */}
        <div style={{ height: 4, background: '#001a33' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: '#69BE28', transition: 'width .3s', borderRadius: '0 2px 2px 0' }} />
        </div>

        {/* Header */}
        <div style={{ background: '#001a33', padding: '14px 20px', borderBottom: '1px solid #0a3560', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 13, color: '#69BE28' }}>VOI</span>
            <span style={{ fontWeight: 300, fontSize: 13, color: '#fff' }}>Loop</span>
            <span style={{ fontSize: 11, color: '#0a3560', margin: '0 4px' }}>|</span>
            <span style={{ fontSize: 11, color: '#A5ACAF' }}>Monthly pulse survey</span>
          </div>
          <div style={{ fontSize: 11, color: '#A5ACAF' }}>
            {currentQ + 1} of {QUESTIONS.length}
          </div>
        </div>

        <div style={{ padding: '28px 24px' }}>

          {/* Category label */}
          <div style={{ fontSize: 10, color: '#69BE28', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 600, marginBottom: 10 }}>
            {q.label}
          </div>

          {/* Question */}
          <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', lineHeight: 1.4, marginBottom: 8 }}>
            {q.question}
          </div>
          <div style={{ fontSize: 12, color: '#A5ACAF', marginBottom: 28 }}>
            {q.help}
          </div>

          {/* Number scale */}
          <div style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => {
                const selected = currentAnswer === n
                const col = scoreColor(n, q.invert)
                return (
                  <button
                    key={n}
                    onClick={() => setAnswer(n)}
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 8,
                      border: `1.5px solid ${selected ? col : '#0a3560'}`,
                      background: selected ? `${col}22` : '#001a33',
                      color: selected ? col : '#A5ACAF',
                      fontSize: 15,
                      fontWeight: selected ? 700 : 400,
                      cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif',
                      transition: 'all .1s',
                    }}
                  >
                    {n}
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: '#A5ACAF' }}>
              <span>1 — {q.low}</span>
              <span>{q.high} — 10</span>
            </div>
          </div>

          {/* Navigation */}
          {submitError ? (
            <div style={{ marginBottom: 10, padding: '10px 12px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.35)', borderRadius: 8, color: '#ffb4b4', fontSize: 12 }}>
              {submitError}
            </div>
          ) : null}
          <div style={{ display: 'flex', gap: 10 }}>
            {currentQ > 0 && (
              <button
                onClick={goPrev}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: '1px solid #0a3560',
                  borderRadius: 8,
                  padding: '12px',
                  fontSize: 13,
                  color: '#A5ACAF',
                  cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif',
                }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={goNext}
              disabled={!currentAnswer}
              style={{
                flex: 2,
                background: currentAnswer ? '#69BE28' : '#0a3560',
                color: currentAnswer ? '#002244' : '#A5ACAF',
                border: 'none',
                borderRadius: 8,
                padding: '12px',
                fontSize: 13,
                fontWeight: 700,
                cursor: currentAnswer ? 'pointer' : 'not-allowed',
                fontFamily: 'Inter, sans-serif',
              }}
            >
              {submitting ? 'Saving...' : currentQ < QUESTIONS.length - 1 ? 'Next →' : 'Submit survey ✓'}
            </button>
          </div>

          {/* Skip */}
          <button
            onClick={() => currentQ < QUESTIONS.length - 1 ? setCurrentQ(currentQ + 1) : handleSubmit()}
            style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', fontSize: 11, color: '#A5ACAF', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textDecoration: 'underline' }}
          >
            Skip this question
          </button>

        </div>
      </div>
    </div>
  )
}
