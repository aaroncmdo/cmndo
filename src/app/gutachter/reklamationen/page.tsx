// AAR-93: SV-Portal Reklamationen Liste + Dialog
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReklamationenClient from './ReklamationenClient'

export const dynamic = 'force-dynamic'

export default async function GutachterReklamationen() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    // multi-standort-safe: Ordering+limit(1) wie getGutachterForUser.
    .order('ist_parent_account', { ascending: true, nullsFirst: true })
    .order('paket_faelle_gesamt', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  if (!sv) {
    return <div className="p-6 text-sm text-claimondo-ondo">Kein SV-Account gefunden.</div>
  }

  const { data: reklamationenRaw } = await supabase
    .from('reklamationen')
    .select('id, fall_id, grund, begruendung, status, eingereicht_am, bearbeitet_am, admin_begruendung')
    .eq('sv_id', sv.id)
    .order('eingereicht_am', { ascending: false })

  // CMM-49: fall-Daten (kennzeichen + claim_nummer) aus v_claim_full statt faelle-Embed.
  // reklamationen.fall_id->faelle-FK existiert auf der View nicht -> de-embed via Map.
  const rekFallIds = Array.from(
    new Set((reklamationenRaw ?? []).map((r) => r.fall_id).filter(Boolean) as string[]),
  )
  const fallInfoMap = new Map<string, { kennzeichen: string | null; claim_nummer: string | null }>()
  if (rekFallIds.length) {
    const { data: fallInfos } = await supabase
      .from('v_claim_full')
      .select('fall_id, kennzeichen, claim_nummer')
      .in('fall_id', rekFallIds)
    for (const fi of (fallInfos ?? []) as Array<{ fall_id: string | null; kennzeichen: string | null; claim_nummer: string | null }>) {
      if (fi.fall_id) fallInfoMap.set(fi.fall_id, { kennzeichen: fi.kennzeichen, claim_nummer: fi.claim_nummer })
    }
  }
  const reklamationen = (reklamationenRaw ?? []).map((r) => {
    const fi = r.fall_id ? fallInfoMap.get(r.fall_id) ?? null : null
    return { ...r, faelle: fi ? { kennzeichen: fi.kennzeichen, claims: { claim_nummer: fi.claim_nummer } } : null }
  })

  // Eigene Faelle (offen) fuer Auswahl
  // CMM-49: faelle->v_claim_full. created_at (=claims.created_at, SSoT) flach aus der
  // View -> clientseitig nach created_at sortieren + auf 50 slicen, dann auf die
  // Fall-Dropdown-Form ({id, kennzeichen, claims:{claim_nummer}}) mappen.
  const { data: faelleRaw } = await supabase
    .from('v_claim_full')
    .select('id:fall_id, kennzeichen, claim_nummer, created_at')
    .eq('sv_id', sv.id)
    .not('fall_id', 'is', null)
  const faelleRows = (faelleRaw ?? []) as Array<{ id: string | null; kennzeichen: string | null; claim_nummer: string | null; created_at: string | null }>
  const faelle = faelleRows
    .slice()
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, 50)
    .map((f) => ({ id: f.id, kennzeichen: f.kennzeichen, claims: { claim_nummer: f.claim_nummer } }))

  return (
    <ReklamationenClient
      reklamationen={(reklamationen ?? []) as Parameters<typeof ReklamationenClient>[0]['reklamationen']}
      faelle={(faelle ?? []) as Parameters<typeof ReklamationenClient>[0]['faelle']}
    />
  )
}
