import { redirect } from 'next/navigation'
import { getRoleAndSession } from '@/lib/supabase/server'

export default async function HomePage() {
  const { session, role } = await getRoleAndSession()

  if (!session) {
    redirect('/login')
  }

  redirect(!role || role === 'participant' ? '/my' : '/wellness-director')
}
