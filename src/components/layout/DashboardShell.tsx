import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'

interface DashboardShellProps {
  title: string
  period?: string | null
  showPeriodFilter?: boolean
  showExport?: boolean
  showSignOut?: boolean
  children: React.ReactNode
}

export function DashboardShell({
  title,
  period,
  showPeriodFilter,
  showExport,
  showSignOut,
  children,
}: DashboardShellProps) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Topbar
          title={title}
          period={period}
          showPeriodFilter={showPeriodFilter}
          showExport={showExport}
          showSignOut={showSignOut}
        />
        <main style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {children}
        </main>
      </div>
    </div>
  )
}
