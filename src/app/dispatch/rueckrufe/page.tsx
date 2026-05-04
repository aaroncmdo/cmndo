import { createClient } from '@/lib/supabase/server'
import RueckrufListItem from './RueckrufListItem'
import PageHeader from '@/components/shared/PageHeader'

// AAR-637: Rückrufe aus admin_termine (typ='rueckruf') lesen statt aus
// leads.rueckruf_*. Die Legacy-Spalten wurden gedroppt. Admin-Kalender-
// Rückrufe und Dispatch-Rückrufe sind jetzt dieselbe Liste.

type RueckrufRow = {
  id: string
  start_zeit: string
  notizen: string | null
  lead_id: string | null
  // AAR-724: Noch nicht vom Dispatcher angesehen → roter Punkt.
  gesehen_am: string | null
  lead: {
    id: string
    vorname: string | null
    nachname: string | null
    telefon: string | null
    email: string | null
    qualifizierungs_phase: string | null
    anruf_versuche: number | null
    letzter_anruf_am: string | null
    letzter_anruf_status: string | null
  } | null
}

export default async function DispatchRueckrufe() {
  const supabase = await createClient()

  const { data: raw } = await supabase
    .from('admin_termine')
    .select(
      'id, start_zeit, notizen, lead_id, gesehen_am, lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon, email, qualifizierungs_phase, anruf_versuche, letzter_anruf_am, letzter_anruf_status)',
    )
    .eq('typ', 'rueckruf')
    .eq('status', 'offen')
    .not('lead_id', 'is', null)
    .order('start_zeit', { ascending: true })

  const termine: RueckrufRow[] = ((raw ?? []) as unknown as RueckrufRow[]).map((t) => ({
    ...t,
    lead: Array.isArray(t.lead) ? t.lead[0] ?? null : t.lead,
  }))

  // AAR-724: Sobald der Dispatcher die Rückrufliste öffnet, markieren wir
  // alle ungesehenen Rückrufe als „gesehen". Die Render-Daten kommen aus
  // dem bereits gelesenen `termine`-Snapshot — die roten Punkte bleiben
  // für diesen Aufruf sichtbar und verschwinden beim nächsten Reload.
  const ungesehenIds = termine.filter((t) => !t.gesehen_am).map((t) => t.id)
  if (ungesehenIds.length > 0) {
    try {
      await supabase
        .from('admin_termine')
        .update({ gesehen_am: new Date().toISOString() })
        .in('id', ungesehenIds)
    } catch (err) {
      console.error('[AAR-724] mark-seen rueckrufe failed:', err)
    }
  }

  return (
    <div className="py-6 space-y-4">
      <PageHeader
        title="Rückrufe"
        actions={<span className="text-sm text-claimondo-ondo">{termine.length} offen</span>}
      />

      <div className="bg-white rounded-ios-lg shadow-ios-md divide-y divide-claimondo-border">
        {termine.map((t) => {
          const lead = t.lead
          if (!lead) return null
          return (
            <RueckrufListItem
              key={t.id}
              terminId={t.id}
              startZeit={t.start_zeit}
              notizen={t.notizen}
              isNew={!t.gesehen_am}
              lead={lead}
            />
          )
        })}
        {termine.length === 0 && (
          <p className="px-5 py-12 text-sm text-claimondo-ondo/70 text-center">Keine offenen Rückrufe</p>
        )}
      </div>
    </div>
  )
}
