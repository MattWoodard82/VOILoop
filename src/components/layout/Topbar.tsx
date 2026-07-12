'use client'
import { Download } from 'lucide-react'
import { SignOutButton } from '@/components/auth/SignOutButton'

interface TopbarProps {
  title: string
  period?: string | null
  showPeriodFilter?: boolean
  showExport?: boolean
  showSignOut?: boolean
}

export function Topbar({
  title,
  period = null,
  showPeriodFilter = true,
  showExport = true,
  showSignOut = true,
}: TopbarProps) {
  const hasActions = showPeriodFilter || showExport || showSignOut

  return (
    <header className="flex items-center justify-between px-6 h-[52px]"
      style={{ background: '#002244', borderBottom: '1px solid #0a3560' }}>
      <h1 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{title}</h1>
      {hasActions ? (
        <div className="flex items-center gap-2">
          {showPeriodFilter && period ? (
            <span className="badge badge-wolf">{period}</span>
          ) : null}
          {showExport ? (
            <button className="btn-primary flex items-center gap-1" type="button" disabled title="Export not available in this pilot">
              <Download size={11} />
              Export (coming soon)
            </button>
          ) : null}
          {showSignOut ? <SignOutButton /> : null}
        </div>
      ) : null}
    </header>
  )
}
