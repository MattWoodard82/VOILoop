'use client'

import { useState } from 'react'
import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface SignOutButtonProps {
  label?: string
  style?: CSSProperties
}

const defaultStyle: CSSProperties = {
  background: 'transparent',
  border: '1px solid #0a3560',
  borderRadius: 6,
  padding: '4px 10px',
  fontSize: 11,
  color: '#A5ACAF',
  cursor: 'pointer',
  fontFamily: 'var(--font-inter), sans-serif',
}

export function SignOutButton({
  label = 'Sign out',
  style,
}: SignOutButtonProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const handleSignOut = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={loading}
      style={{
        ...defaultStyle,
        ...(loading
          ? {
              opacity: 0.7,
              cursor: 'not-allowed',
            }
          : null),
        ...style,
      }}
    >
      {loading ? 'Signing out…' : label}
    </button>
  )
}
