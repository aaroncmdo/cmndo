import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import KalenderClient from './KalenderClient'

export default async function KundeKalenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Fall laden + Ownership pruefen
  const { data: fall } = await supabase.from('faelle').select('id, sv_id, kunde_id, lead_id, fall_nummer').eq('id', id).single()
  if (!fall) notFound()
  if (fall.kunde_id !== user.id) {
    if (fall.lead_id) {
      const { data: lead } = await admin.from('leads').select('email').eq('id', fall.lead_id).single()
      if (lead?.email !== user.email) notFound()
    } else {
      notFound()
    }
  }

  if (!fall.sv_id) {
    return (
      <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl mx-auto">
        <Link href={`/kunde/faelle/${id}`} className="text-xs text-claimondo-ondo/70 hover:text-[#4573A2] mb-4 inline-block">&larr; Zurück zum Fall</Link>
        <div className="bg-white rounded-xl border border-claimondo-border shadow-sm p-8 text-center">
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
    .eq('sv_id', fall.sv_id)
    .in('status', ['reserviert', 'bestaetigt', 'gegenvorschlag'])
    .gte('start_zeit', now.toISOString())
    .lte('start_zeit', in14Tagen.toISOString())
    .order('start_zeit')

  // SV-Arbeitszeiten (Standard: Mo-Fr 08:00-18:00)
  // In Zukunft aus sachverstaendige.arbeitszeiten laden
  const arbeitszeiten = { start: 8, end: 18, tage: [1, 2, 3, 4, 5] } // Mo=1 ... Fr=5

  // SV-Name laden
  const { data: sv } = await admin.from('sachverstaendige').select('profile_id').eq('id', fall.sv_id).single()
  let svName = 'Sachverständiger'
  if (sv?.profile_id) {
    const { data: p } = await admin.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
    if (p) svName = [p.vorname, p.nachname].filter(Boolean).join(' ') || 'Sachverständiger'
  }

  return (
    <div className="w-full px-4 md:px-8 pt-5 pb-8 max-w-xl mx-auto">
      <Link href={`/kunde/faelle/${id}`} className="text-xs text-claimondo-ondo/70 hover:text-[#4573A2] mb-4 inline-block">&larr; Zurück zum Fall</Link>
      <h1 className="text-lg font-bold text-[#0D1B3E] mb-1">Kalender von {svName}</h1>
      <p className="text-sm text-claimondo-ondo mb-5">Wählen Sie einen freien Termin für Ihren Fall {fall.fall_nummer ?? ''}.</p>

      <KalenderClient
        fallId={id}
        belegteSlots={(svTermine ?? []).map(t => ({ start: t.start_zeit, end: t.end_zeit }))}
        arbeitszeiten={arbeitszeiten}
      />
    </div>
  )
}
