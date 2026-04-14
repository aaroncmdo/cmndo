// AAR-98: Redirect zur konsolidierten Route /dispatch/leads/[id]
import { redirect } from 'next/navigation'

export default async function OldLeadDetailRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/dispatch/leads/${id}`)
}
