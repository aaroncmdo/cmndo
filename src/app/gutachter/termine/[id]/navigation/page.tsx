import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { redirect } from 'next/navigation'
import NavigationClient from './NavigationClient'

// KFZ-200: Navigation-Modus für SV.

export const dynamic = 'force-dynamic'

export default async function NavigationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  const db = (await import('@/lib/supabase/admin')).createAdminClient()

  const { data: termin, error: tErr } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, start_zeit, sv_angekommen_am, sv_eta_minuten, navigation_started_at')
    .eq('id', id)
    .eq('typ', 'sv_begutachtung')
    .eq('sv_id', sv.id)
    .single()

  if (tErr || !termin) redirect(`/gutachter/termine/${id}`)

  // If already arrived, redirect to vor-ort
  if (termin.sv_angekommen_am) redirect(`/gutachter/termine/${id}/vor-ort`)

  // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
  const { data: fall } = await db
    .from('faelle')
    .select('id, lead_id, besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng, claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort)')
    .eq('id', termin.fall_id)
    .single()
  const fallClaim = Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims

  let leadName = '—'
  if (fall?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, nachname').eq('id', fall.lead_id).single()
    if (lead) leadName = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
  }

  const adresse = fall?.besichtigungsort_adresse
    ?? [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort].filter(Boolean).join(', ')
    ?? ''

  return (
    <NavigationClient
      terminId={id}
      fallId={termin.fall_id}
      adresse={adresse}
      leadName={leadName}
      startZeit={termin.start_zeit}
      initialEta={termin.sv_eta_minuten ?? null}
      targetLat={fall?.besichtigungsort_lat ? Number(fall.besichtigungsort_lat) : null}
      targetLng={fall?.besichtigungsort_lng ? Number(fall.besichtigungsort_lng) : null}
    />
  )
}
