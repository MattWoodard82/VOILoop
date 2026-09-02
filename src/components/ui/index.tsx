'use client'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { InfoTooltip } from './InfoTooltip'

// ─── KPI Card ────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string
  value: string | number
  delta?: string
  deltaDir?: 'up' | 'down' | 'neutral'
  color?: string
  tooltipKey?: string
}
export function KpiCard({ label, value, delta, deltaDir = 'neutral', color, tooltipKey }: KpiCardProps) {
  const deltaColor = deltaDir === 'up' ? '#69BE28' : deltaDir === 'down' ? '#ff6b6b' : '#A5ACAF'
  return (
    <div className="kpi-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        {color && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
        <div className="sec-label">{label}</div>
        {tooltipKey && <InfoTooltip metricKey={tooltipKey} />}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, lineHeight: 1, marginBottom: 6, color: color ?? '#fff', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
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
      <span title={label} style={{ width: labelWidth, fontSize: 11, color: '#A5ACAF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
          <span style={{ fontSize: 13, fontWeight: 600, color: '#fff', letterSpacing: '0.01em' }}>{title}</span>
          {badge}
        </div>
      )}
      {children}
    </div>
  )
}

interface SkeletonBlockProps {
  width?: number | string
  height?: number | string
  radius?: number | string
  className?: string
  style?: React.CSSProperties
}

export function SkeletonBlock({
  width = '100%',
  height = 12,
  radius = 8,
  className,
  style,
}: SkeletonBlockProps) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton-block', className)}
      style={{ width, height, borderRadius: radius, ...style }}
    />
  )
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
}: {
  lines?: number
  lastLineWidth?: number | string
}) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 8 }}>
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={index}
          height={10}
          radius={999}
          width={index === lines - 1 ? lastLineWidth : '100%'}
        />
      ))}
    </div>
  )
}

export function SkeletonCircle({ size = 24 }: { size?: number }) {
  return <SkeletonBlock width={size} height={size} radius="50%" />
}

export function CardSkeleton({
  title,
  badgeWidth = 64,
  lines = 3,
  minHeight,
}: {
  title?: string
  badgeWidth?: number
  lines?: number
  minHeight?: number
}) {
  return (
    <Card
      title={title}
      badge={<SkeletonBlock width={badgeWidth} height={18} radius={999} />}
      className="loading-card"
    >
      <div style={{ display: 'grid', gap: 10, minHeight }}>
        <SkeletonText lines={lines} />
      </div>
    </Card>
  )
}

export function TableSkeleton({
  columns,
  rows,
}: {
  columns: number
  rows: number
}) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12 }}>
        {Array.from({ length: columns }).map((_, index) => (
          <SkeletonBlock key={`head-${index}`} height={8} width="70%" radius={999} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={`row-${rowIndex}`} style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12 }}>
          {Array.from({ length: columns }).map((__, colIndex) => (
            <SkeletonBlock key={`cell-${rowIndex}-${colIndex}`} height={12} radius={999} width={colIndex === 0 ? '80%' : '100%'} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 180 }: { height?: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'grid', gap: 12 }}>
      <SkeletonBlock height={height} radius={10} />
      <div style={{ display: 'flex', gap: 8 }}>
        <SkeletonBlock width={72} height={10} radius={999} />
        <SkeletonBlock width={54} height={10} radius={999} />
      </div>
    </div>
  )
}

export function LoadingNotice({
  children = 'Loading…',
  busy = true,
}: {
  children?: ReactNode
  busy?: boolean
}) {
  return (
    <span
      aria-live="polite"
      aria-busy={busy}
      style={{ fontSize: 11, color: '#A5ACAF' }}
    >
      {children}
    </span>
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
