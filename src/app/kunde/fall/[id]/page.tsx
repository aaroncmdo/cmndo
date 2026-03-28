import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import FallDetailClient from './FallDetailClient'

export default async function KundeFallPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify this fall belongs to the logged-in kunde (via lead email)
  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', id)
    .single()

  if (!fall) notFound()

  // Check ownership: lead email must match user email
  if (fall.lead_id) {
    const { data: lead } = await supabase
      .from('leads')
      .select('email')
      .eq('id', fall.lead_id)
      .single()

    if (lead?.email !== user.email) notFound()
  } else {
    notFound()
  }

  // Fetch all related data in parallel
  const [
    { data: dokumente },
    svResult,
    { data: nachrichten },
  ] = await Promise.all([
    supabase
      .from('dokumente')
      .select('id, typ, datei_url, datei_name, created_at')
      .eq('fall_id', id)
      .order('created_at'),
    fall.sv_id
      ? supabase
          .from('sachverstaendige')
          .select('id, paket, profiles(vorname, nachname, telefon)')
          .eq('id', fall.sv_id)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('timeline')
      .select('id, typ, titel, beschreibung, created_at')
      .eq('fall_id', id)
      .in('typ', ['kunde-nachricht', 'claimondo-antwort'])
      .order('created_at', { ascending: true }),
  ])

  // Normalize SV profile join
  let sv = null
  if (svResult.data) {
    const raw = svResult.data as Record<string, unknown>
    const profileRaw = raw.profiles
    const profile = Array.isArray(profileRaw) ? profileRaw[0] ?? null : profileRaw ?? null
    sv = {
      id: raw.id as string,
      paket: raw.paket as string,
      profile: profile as { vorname: string | null; nachname: string | null; telefon: string | null } | null,
    }
  }

  return (
    <FallDetailClient
      fall={fall}
      dokumente={dokumente ?? []}
      sv={sv}
      nachrichten={nachrichten ?? []}
    />
  )
}
