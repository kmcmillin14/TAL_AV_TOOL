// The old address of Simulation (step 04 since 2026-11-18) — kept so bookmarks still land.
import { redirect } from 'next/navigation'

export default async function SimulateRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/projects/${id}/step4`)
}
