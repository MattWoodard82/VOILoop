'use client'
import { Download } from 'lucide-react'

interface TopbarProps {
  title: string
  period?: string
}

export function Topbar({ title, period = 'June 9 2026' }: TopbarProps) {
  return (
    <header className="flex items-center justify-between px-6 h-[52px]"
      style={{ background: '#002244', borderBottom: '1px solid #0a3560' }}>
      <h1 style={{ fontSize: 14, fontWeight: 600, color: '#fff' }}>{title}</h1>
      <div className="flex items-center gap-2">
        <select className="form-select" defaultValue={period}>
          <option>June 9 2026</option>
          <option>May 2026</option>
          <option>Q2 2026</option>
        </select>
        <button className="btn-primary flex items-center gap-1">
          <Download size={11} />
          Export
        </button>
      </div>
    </header>
  )
}
