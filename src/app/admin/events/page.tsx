import { redirect } from 'next/navigation'

export const metadata = { title: 'Admin Events — VOILoop' }

export default async function AdminEventsPage() {
  redirect('/wellness-director/events')
}
