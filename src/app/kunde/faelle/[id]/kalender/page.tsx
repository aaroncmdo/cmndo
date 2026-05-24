import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import KalenderClient from './KalenderClient'
// CMM-63 SP-C: Ownership zentral über claim_parties (SSoT) statt inline faelle.kunde_id.
import { assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'

export default async function KundeKalenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Fall laden + Ownership pruefen (CMM-63 SP-C: zentraler Helper, claim_parties-SSoT)
  const ownership = await assertKundeOwnsFall(admin, user.id, user.email ?? null, id)
  if (!ownership.ok) notFound()
  const svId = ownership.svId
  // claim_nummer nur zur Anzeige (aus claims-SSoT via claimId)
  let claimNummer: string | null = null
  if (ownership.claimId) {
    const { data: c } = await admin.from('claims').select('claim_nummer').eq('id', ownership.claimId).maybeSingle()
    claimNummer = (c?.claim_nummer as string | null) ?? null
  }

  if (!svId) {
    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl mx-auto">
        <Link href={`/kunde/faelle/${id}`} className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-4 inline-block">&larr; Zurück zum Fall</Link>
        <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-8 text-center">
          <p className="text-sm text-claimondo-ondo">Noch kein Sachverständiger zugewiesen.</p>
        </div>
      </div>
    )
  }

  // SV-Termine der naechsten 14 Tage laden (NUR Belegtheiten, keine Details!)
  const now = new Date()
  const in14Tagen = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const { data: svTermine } = await admin
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_id', svId)
    .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag'])
    .gte('start_zeit', now.toISOString())
    .lte('start_zeit', in14Tagen.toISOString())
    .order('start_zeit')

  // SV-Arbeitszeiten (Standard: Mo-Fr 08:00-18:00)
  // In Zukunft aus sachverstaendige.arbeitszeiten laden
  const arbeitszeiten = { start: 8, end: 18, tage: [1, 2, 3, 4, 5] } // Mo=1 ... Fr=5

  // SV-Name laden
  const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', svId).single()
  let svName = 'Sachverständiger'
  if (sv?.profile_id) {
    const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
    if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Sachverständiger'
  }

  return (
    <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl mx-auto">
      <Link href={`/kunde/faelle/${id}`} className="text-xs text-claimondo-ondo/70 hover:text-claimondo-ondo mb-4 inline-block">&larr; Zurück zum Fall</Link>
      <h1 className="text-lg font-bold text-claimondo-navy mb-1">Kalender von {svName}</h1>
      <p className="text-sm text-claimondo-ondo mb-5">Wählen Sie einen freien Termin für Ihren Fall {claimNummer ?? ''}.</p>

      <KalenderClient
        fallId={id}
        belegteSlots={(svTermine ?? []).map(t => ({ start: t.start_zeit, end: t.end_zeit }))}
        arbeitszeiten={arbeitszeiten}
      />
    </div>
  )
}
