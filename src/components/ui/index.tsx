import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  deltaDir?: 'up' | 'down' | 'neutral'
  color?: string
}
export function KpiCard({ label, value, delta, deltaDir = 'neutral', color }: KpiCardProps) {
  const deltaColor = deltaDir === 'up' ? '#69BE28' : deltaDir === 'down' ? '#ff6b6b' : '#A5ACAF'
  return (
    <div className="kpi-card">
      <div className="sec-label">{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700, lineHeight: 1, marginBottom: 4, color: color ?? '#fff' }}>
        {value}
      </div>
      {delta && (
        <div style={{ fontSize: 10, color: deltaColor, display: 'flex', alignItems: 'center', gap: 3 }}>
          {deltaDir === 'up' && '↑'}{deltaDir === 'down' && '↓'} {delta}
        </div>
      )}
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
type BadgeVariant = 'green' | 'amber' | 'red' | 'wolf' | 'coo'
interface BadgeProps { children: ReactNode; variant?: BadgeVariant }
export function Badge({ children, variant = 'wolf' }: BadgeProps) {
  return <span className={`badge badge-${variant}`}>{children}</span>
}

// ─── Alert ───────────────────────────────────────────────────────────────────
type AlertVariant = 'warn' | 'good' | 'info'
interface AlertProps { children: ReactNode; variant?: AlertVariant; icon?: ReactNode }
export function Alert({ children, variant = 'info', icon }: AlertProps) {
  return (
    <div className={`alert alert-${variant}`}>
      {icon && <span style={{ flexShrink: 0, marginTop: 1 }}>{icon}</span>}
      <span>{children}</span>
    </div>
  )
}

// ─── Horizontal bar ──────────────────────────────────────────────────────────
interface BarRowProps {
  label: string
  value: number
  max?: number
  color?: string
  suffix?: string
  labelWidth?: number
}
export function BarRow({ label, value, max = 100, color = '#69BE28', suffix = '', labelWidth = 90 }: BarRowProps) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <span style={{ width: labelWidth, fontSize: 11, color: '#A5ACAF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <div style={{ flex: 1, height: 5, background: '#0a3560', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ width: 36, textAlign: 'right', fontSize: 10, color: '#A5ACAF' }}>
        {value}{suffix}
      </span>
    </div>
  )
}

// ─── Card ─────────────────────────────────────────────────────────────────────
interface CardProps {
  title?: string
  badge?: ReactNode
  children: ReactNode
  className?: string
}
export function Card({ title, badge, children, className }: CardProps) {
  return (
    <div className={cn('card', className)}>
      {title && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{title}</span>
          {badge}
        </div>
      )}
      {children}
    </div>
  )
}

// ─── Score pill ───────────────────────────────────────────────────────────────
export function ScorePill({ value, type = 'recovery' }: { value: number; type?: 'recovery' | 'sleep' }) {
  let cls = 'pill-green'
  if (type === 'recovery') {
    cls = value >= 67 ? 'pill-green' : value >= 34 ? 'pill-amber' : 'pill-red'
  } else {
    cls = value >= 85 ? 'pill-green' : value >= 65 ? 'pill-amber' : 'pill-red'
  }
  return <span className={`score-pill ${cls}`}>{value}</span>
}

// ─── Divider ──────────────────────────────────────────────────────────────────
export function Divider() {
  return <hr className="divider" />
}

// ─── Timeline item ────────────────────────────────────────────────────────────
interface TimelineItemProps {
  color: string
  title: string
  body: string
  meta: string
  isLast?: boolean
}
export function TimelineItem({ color, title, body, meta, isLast }: TimelineItemProps) {
  return (
    <div style={{ display: 'flex', gap: 12, paddingBottom: 14, position: 'relative' }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, marginTop: 3 }} />
        {!isLast && <div style={{ position: 'absolute', left: 3.5, top: 11, bottom: 0, width: 1, background: '#0a3560' }} />}
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#fff', lineHeight: 1.5 }}>
          <strong>{title}</strong> {body}
        </div>
        <div style={{ fontSize: 10, color: '#A5ACAF', marginTop: 2 }}>{meta}</div>
      </div>
    </div>
  )
}
