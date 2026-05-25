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
    .maybeSingle()

  if (!sv) {
    return <div className="p-6 text-sm text-claimondo-ondo">Kein SV-Account gefunden.</div>
  }

  const { data: reklamationen } = await supabase
    .from('reklamationen')
    .select('id, fall_id, grund, begruendung, status, eingereicht_am, bearbeitet_am, admin_begruendung, faelle(kennzeichen, claims:claim_id(claim_nummer))')
    .eq('sv_id', sv.id)
    .order('eingereicht_am', { ascending: false })

  // Eigene Faelle (offen) fuer Auswahl
  // CMM-65: created_at lebt auf claims (SSoT). supabase-js kann den Parent nicht nach
  // einer eingebetteten to-one-Spalte ordnen, und ein DB-.limit ohne diese Order liefert
  // beliebige Zeilen -> claims.created_at clientseitig sortieren + auf 50 slicen.
  const { data: faelleRaw } = await supabase
    .from('faelle')
    .select('id, kennzeichen, claims:claim_id!inner(claim_nummer, created_at)')
    .eq('sv_id', sv.id)
  const claimCreatedAt = (f: { claims: unknown }): string => {
    const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return (c as { created_at?: string | null } | null)?.created_at ?? ''
  }
  const faelle = (faelleRaw ?? [])
    .slice()
    .sort((a, b) => claimCreatedAt(b).localeCompare(claimCreatedAt(a)))
    .slice(0, 50)

  return (
    <ReklamationenClient
      reklamationen={(reklamationen ?? []) as Parameters<typeof ReklamationenClient>[0]['reklamationen']}
      faelle={(faelle ?? []) as Parameters<typeof ReklamationenClient>[0]['faelle']}
    />
  )
}
