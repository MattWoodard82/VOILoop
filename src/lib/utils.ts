import { type ClassValue, clsx } from 'clsx'
import type { RecoveryStatus, RiskLevel } from '@/types'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// VOILoop Seahawks brand
export const BRAND = {
  navy: '#002244',
  navyDark: '#001a33',
  navyDeep: '#0d1f35',
  navyBorder: '#0a3560',
  green: '#69BE28',
  greenHover: '#7dd932',
  wolf: '#A5ACAF',
  white: '#ffffff',
  red: '#ff6b6b',
  amber: '#FFA500',
} as const

export const CHART_COLORS = {
  green: BRAND.green,
  red: BRAND.red,
  amber: BRAND.amber,
  wolf: BRAND.wolf,
  navy: BRAND.navy,
  gridColor: 'rgba(10,53,96,0.6)',
  tickColor: BRAND.wolf,
} as const

export function recoveryColor(score: number | null): string {
  if (!score) return BRAND.wolf
  if (score >= 67) return BRAND.green
  if (score >= 34) return BRAND.amber
  return BRAND.red
}

export function sleepColor(perf: number | null): string {
  if (!perf) return BRAND.wolf
  if (perf >= 85) return BRAND.green
  if (perf >= 65) return BRAND.amber
  return BRAND.red
}

export function riskBadgeClass(risk: RiskLevel): string {
  return {
    Low: 'badge-green',
    Medium: 'badge-amber',
    High: 'badge-red',
  }[risk]
}

export function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    Pending: 'badge-red',
    'In Progress': 'badge-amber',
    Monitoring: 'badge-wolf',
    Resolved: 'badge-green',
  }
  return map[status] ?? 'badge-wolf'
}

export function initials(first: string, last: string): string {
  return `${first[0]}${last[0]}`
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
}

export function safeAvg(nums: (number | null | undefined)[]): number {
  const valid = nums.filter((n): n is number => n != null)
  if (!valid.length) return 0
  return Math.round(valid.reduce((a, b) => a + b, 0) / valid.length * 10) / 10
}
