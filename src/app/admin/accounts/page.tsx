import { redirect } from 'next/navigation'
import { requireAdmin } from '@/lib/supabase/server'

export const metadata = { title: 'Admin — VOILoop' }

export default async function AdminAccountsPage() {
  const { redirect: redirectTo } = await requireAdmin()
  if (redirectTo) redirect(redirectTo)
  redirect('/admin')
}
