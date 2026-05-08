import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import RueckrufActions from './RueckrufActions'
import PhoneButton from '@/components/shared/PhoneButton'
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
          const isOverdue = new Date(t.start_zeit) < new Date()
          return (
            <div key={t.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {/* AAR-724: Roter Punkt für noch nicht gesehene Rückrufe. */}
                  {!t.gesehen_am && (
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-red-500 shrink-0"
                      aria-label="Neu, noch nicht angesehen"
                    />
                  )}
                  <Link
                    href={`/dispatch/leads/${lead.id}`}
                    className="text-sm font-medium text-claimondo-navy hover:text-claimondo-ondo"
                  >
                    {lead.vorname} {lead.nachname}
                  </Link>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-claimondo-ondo">
                  {lead.telefon && (
                    <PhoneButton nummer={lead.telefon} variant="inline" label={lead.telefon} />
                  )}
                  <span className={isOverdue ? 'text-red-600 font-medium' : ''}>
                    {new Date(t.start_zeit).toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    {isOverdue && ' (überfällig)'}
                  </span>
                  {t.notizen && (
                    <span className="text-claimondo-ondo/70 truncate max-w-[200px]">{t.notizen}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[10px] text-claimondo-ondo/70">
                  <span>Versuche: {lead.anruf_versuche ?? 0}</span>
                  {lead.letzter_anruf_am && (
                    <span>
                      Letzter: {new Date(lead.letzter_anruf_am).toLocaleDateString('de-DE')} (
                      {lead.letzter_anruf_status ?? '?'})
                    </span>
                  )}
                </div>
              </div>

              <RueckrufActions leadId={lead.id} anrufVersuche={lead.anruf_versuche ?? 0} />
            </div>
          )
        })}
        {termine.length === 0 && (
          <p className="px-5 py-12 text-sm text-claimondo-ondo/70 text-center">Keine offenen Rückrufe</p>
        )}
      </div>
    </div>
  )
}
