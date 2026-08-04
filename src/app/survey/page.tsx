'use client'
import { useState } from 'react'

// ── Question definitions ─────────────────────────────────────────────────────
type QuestionType = 'boolean' | 'scale5' | 'multiselect' | 'choice' | 'text'

interface BaseQuestion {
  key: string
  label: string
  question: string
  type: QuestionType
}
interface BooleanQuestion extends BaseQuestion { type: 'boolean' }
interface Scale5Question extends BaseQuestion { type: 'scale5'; low: string; high: string }
interface MultiSelectQuestion extends BaseQuestion { type: 'multiselect'; options: { value: string; label: string }[] }
interface ChoiceQuestion extends BaseQuestion { type: 'choice'; options: { value: string; label: string }[] }
interface TextQuestion extends BaseQuestion { type: 'text'; placeholder: string }

type Question = BooleanQuestion | Scale5Question | MultiSelectQuestion | ChoiceQuestion | TextQuestion

const QUESTIONS: Question[] = [
  {
    key: 'confident_health',
    label: 'Health confidence',
    question: 'I felt confident about my health/progress this week.',
    type: 'boolean',
  },
  {
    key: 'body_trending_good',
    label: 'Body trends',
    question: 'I felt good about how my body/results are trending this week.',
    type: 'boolean',
  },
  {
    key: 'energy_level',
    label: 'Energy levels',
    question: 'How would you rate your overall energy levels this week?',
    type: 'scale5',
    low: 'Low',
    high: 'High',
  },
  {
    key: 'rest_quality',
    label: 'Rest quality',
    question: 'How well-rested did you feel when waking up most mornings this week?',
    type: 'scale5',
    low: 'Poor',
    high: 'Well-rested',
  },
  {
    key: 'stress_level',
    label: 'Stress levels',
    question: 'How would you rate your stress levels this week?',
    type: 'scale5',
    low: 'Low',
    high: 'High',
  },
  {
    key: 'physical_activity',
    label: 'Physical activity',
    question: 'How did you engage in physical activity this week? (Select all that apply)',
    type: 'multiselect',
    options: [
      { value: 'fitness_center', label: 'Fitness Center Onsite' },
      { value: 'outside', label: 'Outside (walking, running, cycling)' },
      { value: 'local_gym', label: 'Local Gym/Fitness Studio' },
      { value: 'home_gym', label: 'Home Gym' },
      { value: 'none', label: 'Did not participate' },
    ],
  },
  {
    key: 'mental_wellbeing',
    label: 'Mental wellbeing',
    question: 'How would you rate your mental wellbeing this week?',
    type: 'scale5',
    low: 'Low',
    high: 'High',
  },
  {
    key: 'program_supported',
    label: 'Program support',
    question: 'Did you feel the program supported your wellbeing this week?',
    type: 'choice',
    options: [
      { value: 'yes', label: 'Yes' },
      { value: 'neutral', label: 'Neutral' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'whoop_reviewed',
    label: 'WHOOP engagement',
    question: 'Did you review your WHOOP data or app at least once this week?',
    type: 'choice',
    options: [
      { value: 'yes_regularly', label: 'Yes — regularly' },
      { value: 'yes_once', label: 'Yes — once' },
      { value: 'no', label: 'No' },
    ],
  },
  {
    key: 'health_flag',
    label: 'Health flag',
    question: 'Is there anything affecting your health or energy this week you\'d like to flag?',
    type: 'text',
    placeholder: 'Optional — share anything on your mind…',
  },
]

type AnswerValue = boolean | number | string[] | string | null

function isAnswered(val: AnswerValue | undefined): boolean {
  if (val === undefined || val === null) return false
  if (typeof val === 'boolean') return true
  if (typeof val === 'number') return val > 0
  if (Array.isArray(val)) return val.length > 0
  if (typeof val === 'string') return true // text is always optional — treated as answered
  return false
}

function scale5Color(val: number, isStress?: boolean) {
  const v = isStress ? 6 - val : val
  if (v >= 4) return '#69BE28'
  if (v >= 3) return '#FFA500'
  return '#ff6b6b'
}

export default function SurveyPage() {
  const [step, setStep] = useState<'intro' | 'survey' | 'done'>('intro')
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({})
  const [currentQ, setCurrentQ] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const q = QUESTIONS[currentQ]
  const currentAnswer = answers[q?.key]
  const progress = ((currentQ + 1) / QUESTIONS.length) * 100

  const setAnswer = (val: AnswerValue) => {
    setAnswers(prev => ({ ...prev, [q.key]: val }))
  }

  const toggleMultiSelect = (option: string) => {
    const current = (answers[q.key] as string[] | undefined) ?? []
    // "Did not participate" is mutually exclusive
    if (option === 'none') {
      setAnswer(current.includes('none') ? [] : ['none'])
      return
    }
    const withoutNone = current.filter(v => v !== 'none')
    if (withoutNone.includes(option)) {
      setAnswer(withoutNone.filter(v => v !== option))
    } else {
      setAnswer([...withoutNone, option])
    }
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
      const body: Record<string, AnswerValue> = {}
      for (const question of QUESTIONS) {
        const val = answers[question.key]
        if (val !== undefined && val !== null) {
          // Skip empty text fields
          if (typeof val === 'string' && val.trim() === '') continue
          body[question.key] = val
        }
      }

      const response = await fetch('/api/pulse/submit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const b = await response.json().catch(() => null)
        const message = typeof b?.error === 'string' && b.error.length > 0
          ? b.error
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

  // ── STYLES ────────────────────────────────────────────────────────────────
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

  const btnBase: React.CSSProperties = {
    fontFamily: 'Inter, sans-serif',
    cursor: 'pointer',
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    transition: 'all .1s',
  }

  // ── INTRO ─────────────────────────────────────────────────────────────────
  if (step === 'intro') {
    return (
      <div style={pageStyle}>
        <div style={cardStyle}>
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
            <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Weekly pulse survey</div>
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              10 questions · takes under 3 minutes · completely confidential.<br/>
              Your responses are visible only to your Wellness Director.
            </div>
          </div>
          <div style={{ padding: '24px' }}>
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6, marginBottom: 10 }}>
              This survey is tied to your authenticated account and can only be submitted for your own profile.
            </div>
            <button
              onClick={() => setStep('survey')}
              style={{ ...btnBase, width: '100%', marginTop: 8, background: '#69BE28', color: '#002244', border: 'none', padding: '13px', fontSize: 14 }}
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

  // ── DONE ──────────────────────────────────────────────────────────────────
  if (step === 'done') {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, maxWidth: 560 }}>
          <div style={{ background: '#001a33', padding: '20px 24px', borderBottom: '1px solid #0a3560', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Thank you!</div>
            <div style={{ fontSize: 12, color: '#A5ACAF', lineHeight: 1.6 }}>
              Your responses have been saved for this week.
            </div>
          </div>
          <div style={{ padding: '20px 24px' }}>
            <div style={{ padding: '12px 14px', background: '#001a33', borderRadius: 8, fontSize: 11, color: '#A5ACAF', lineHeight: 1.6 }}>
              🔒 These responses are private — only your Wellness Director can see your individual answers. Leadership sees group averages only.
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── SURVEY ────────────────────────────────────────────────────────────────
  const canAdvance = q.type === 'text' || isAnswered(currentAnswer)

  const renderInput = () => {
    if (q.type === 'boolean') {
      return (
        <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
          {([true, false] as const).map((val) => {
            const selected = currentAnswer === val
            return (
              <button
                key={String(val)}
                onClick={() => setAnswer(val)}
                style={{
                  ...btnBase,
                  flex: 1,
                  padding: '16px',
                  border: `1.5px solid ${selected ? '#69BE28' : '#0a3560'}`,
                  background: selected ? '#69BE2822' : '#001a33',
                  color: selected ? '#69BE28' : '#A5ACAF',
                  fontSize: 15,
                }}
              >
                {val ? 'True' : 'False'}
              </button>
            )
          })}
        </div>
      )
    }

    if (q.type === 'scale5') {
      const sq = q as Scale5Question
      return (
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            {[1,2,3,4,5].map(n => {
              const selected = currentAnswer === n
              const col = scale5Color(n, q.key === 'stress_level')
              return (
                <button
                  key={n}
                  onClick={() => setAnswer(n)}
                  style={{
                    ...btnBase,
                    width: 52,
                    height: 52,
                    border: `1.5px solid ${selected ? col : '#0a3560'}`,
                    background: selected ? `${col}22` : '#001a33',
                    color: selected ? col : '#A5ACAF',
                    fontSize: 16,
                    fontWeight: selected ? 700 : 400,
                  }}
                >
                  {n}
                </button>
              )
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontSize: 10, color: '#A5ACAF' }}>
            <span>1 — {sq.low}</span>
            <span>{sq.high} — 5</span>
          </div>
        </div>
      )
    }

    if (q.type === 'multiselect') {
      const mq = q as MultiSelectQuestion
      const selected = (currentAnswer as string[] | undefined) ?? []
      return (
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {mq.options.map(opt => {
            const isSelected = selected.includes(opt.value)
            return (
              <button
                key={opt.value}
                onClick={() => toggleMultiSelect(opt.value)}
                style={{
                  ...btnBase,
                  padding: '12px 16px',
                  textAlign: 'left',
                  border: `1.5px solid ${isSelected ? '#69BE28' : '#0a3560'}`,
                  background: isSelected ? '#69BE2822' : '#001a33',
                  color: isSelected ? '#69BE28' : '#A5ACAF',
                  fontSize: 13,
                }}
              >
                {isSelected ? '✓ ' : ''}{opt.label}
              </button>
            )
          })}
        </div>
      )
    }

    if (q.type === 'choice') {
      const cq = q as ChoiceQuestion
      return (
        <div style={{ marginBottom: 28, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cq.options.map(opt => {
            const isSelected = currentAnswer === opt.value
            return (
              <button
                key={opt.value}
                onClick={() => setAnswer(opt.value)}
                style={{
                  ...btnBase,
                  padding: '13px 16px',
                  textAlign: 'left',
                  border: `1.5px solid ${isSelected ? '#69BE28' : '#0a3560'}`,
                  background: isSelected ? '#69BE2822' : '#001a33',
                  color: isSelected ? '#69BE28' : '#A5ACAF',
                  fontSize: 13,
                }}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )
    }

    if (q.type === 'text') {
      const tq = q as TextQuestion
      return (
        <div style={{ marginBottom: 28 }}>
          <textarea
            value={(currentAnswer as string | undefined) ?? ''}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder={tq.placeholder}
            rows={4}
            style={{
              width: '100%',
              background: '#001a33',
              border: '1.5px solid #0a3560',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
              fontFamily: 'Inter, sans-serif',
              padding: '12px',
              resize: 'vertical',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: '#A5ACAF', marginTop: 4 }}>Optional — you can skip this question.</div>
        </div>
      )
    }
  }

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
            <span style={{ fontSize: 11, color: '#A5ACAF' }}>Weekly pulse survey</span>
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
          <div style={{ fontSize: 17, fontWeight: 600, color: '#fff', lineHeight: 1.4, marginBottom: 20 }}>
            {q.question}
          </div>

          {renderInput()}

          {/* Submit error */}
          {submitError ? (
            <div style={{ marginBottom: 10, padding: '10px 12px', background: 'rgba(255,107,107,0.08)', border: '1px solid rgba(255,107,107,0.35)', borderRadius: 8, color: '#ffb4b4', fontSize: 12 }}>
              {submitError}
            </div>
          ) : null}

          {/* Navigation */}
          <div style={{ display: 'flex', gap: 10 }}>
            {currentQ > 0 && (
              <button
                onClick={goPrev}
                style={{ ...btnBase, flex: 1, background: 'transparent', border: '1px solid #0a3560', padding: '12px', fontSize: 13, color: '#A5ACAF', fontWeight: 400 }}
              >
                ← Back
              </button>
            )}
            <button
              onClick={goNext}
              disabled={!canAdvance || submitting}
              style={{
                ...btnBase,
                flex: 2,
                background: canAdvance ? '#69BE28' : '#0a3560',
                color: canAdvance ? '#002244' : '#A5ACAF',
                border: 'none',
                padding: '12px',
                fontSize: 13,
                cursor: canAdvance ? 'pointer' : 'not-allowed',
              }}
            >
              {submitting ? 'Saving...' : currentQ < QUESTIONS.length - 1 ? 'Next →' : 'Submit survey ✓'}
            </button>
          </div>

          {/* Skip (non-text questions only) */}
          {q.type !== 'text' && (
            <button
              onClick={() => currentQ < QUESTIONS.length - 1 ? setCurrentQ(currentQ + 1) : handleSubmit()}
              style={{ width: '100%', marginTop: 10, background: 'transparent', border: 'none', fontSize: 11, color: '#A5ACAF', cursor: 'pointer', fontFamily: 'Inter, sans-serif', textDecoration: 'underline' }}
            >
              Skip this question
            </button>
          )}

        </div>
      </div>
    </div>
  )
}
