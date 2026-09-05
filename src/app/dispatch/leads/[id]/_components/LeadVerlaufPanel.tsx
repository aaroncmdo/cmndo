// Zeigt die Aktivitaetsspur eines Leads (`timeline.lead_id`).
//
// WARUM: `timeline.lead_id` hat sechs Schreiber (SA-Unterschrift via FlowLink,
// Dokumenteingang, FlowLink-Versand, Reminder-Crons, Terminabsagen, manuelle
// Notizen) — und bis zu dieser Lane KEINEN Leser. 53 Eintraege lagen in der DB,
// darunter Aarons handgeschriebene Entscheidungen zu einzelnen Leads, und auf
// der Seite, die den Lead bearbeitet, war davon nichts zu sehen. Diese
// Komponente ist der erste Leser. Dasselbe Muster wie LeadNachrichtenPanel
// (erster Leser von `nachrichten.lead_id`, 23.08.2026).
//
// WARUM NICHT DIE SHARED TimelineView: die rendert `ClaimTimelineEvent` und
// leitet den sichtbaren Text ueber ein Mapping aus `event_typ` ab; ihre Karte
// zeigt nur ein Label, keine Beschreibung. Die Lead-Eintraege tragen ihre
// Aussage aber in `titel` + `beschreibung` (alle 53 mit `typ='system'`) —
// Aarons Notizen sind 200+ Zeichen. Ueber die Claim-Karte wuerden sie zu
// einer Ueberschrift schrumpfen. Deshalb ein eigenes, kleines Panel im Idiom
// dieser Seite; der Plan sah die TimelineView vor, die Abweichung ist bewusst.
//
// WARUM ADMIN-CLIENT: die SELECT-Policy auf `timeline` ist ueber `fall_id`
// gescopt (SV, Geschaedigter, Kanzlei-Mandat, can_view_claim) oder
// `is_admin()`. Eine Lead-Zeile OHNE Fall passiert nur den Admin-Zweig — ein
// Dispatcher saehe ueber den RLS-Client eine LEERE Liste und hielte sie fuer
// "keine Ereignisse". Genau die Klasse "KB sah 0, Admin 3" (30.08.2026).
// Die Seite selbst ist bereits rollen-gated (Lead-Read ueber RLS + notFound).

import { createAdminClient } from '@/lib/supabase/admin'
import { SectionCard } from '@/components/shared/SectionCard'
import EmptyState from '@/components/shared/EmptyState'

type Eintrag = {
  id: string
  typ: string | null
  titel: string | null
  beschreibung: string | null
  created_at: string
}

function formatiereZeit(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const QUELLE_LABEL: Record<string, string> = {
  unfallguide: 'Unfallguide-Landeseite',
  mini_wizard: 'Mini-Wizard',
  self_service: 'Self-Service',
  werkstatt_finder: 'Werkstatt-Finder',
  'claimondo-check': 'Anspruchsprüfung',
  'schaden-karte': 'Schadenkarte',
  kunde_portal: 'Kundenportal',
  mcp: 'KI-Assistent',
}

export default async function LeadVerlaufPanel({
  leadId,
  leadErstelltAm,
  sourceChannel,
}: {
  leadId: string
  /** `leads.created_at` — der Beginn der Spur, den keine Timeline-Zeile traegt. */
  leadErstelltAm: string | null
  sourceChannel: string | null
}) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('timeline')
    .select('id, typ, titel, beschreibung, created_at')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    // Sichtbar scheitern statt still leer bleiben — eine leere Liste saehe aus
    // wie "nichts passiert", und genau so blieben die 53 Eintraege unsichtbar.
    return (
      <SectionCard title="Verlauf">
        <p className="text-sm text-danger-strong">
          Verlauf konnte nicht geladen werden: {error.message}
        </p>
      </SectionCard>
    )
  }

  const eintraege = (data ?? []) as Eintrag[]

  // Der Anfang der Spur steht in `leads.created_at`, nicht in `timeline`.
  // Synthetisch anhaengen, damit jeder Lead mindestens ein Ereignis hat — und
  // sichtbar wird, ueber welchen Weg er hereinkam.
  const quelle = sourceChannel ? (QUELLE_LABEL[sourceChannel] ?? sourceChannel) : null

  return (
    <SectionCard
      title="Verlauf"
      subtitle="Was mit diesem Interessenten bisher passiert ist — vom Eingang bis heute"
    >
      <ol className="divide-y divide-claimondo-border">
        {eintraege.map((e) => (
          <li key={e.id} className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-claimondo-navy">
                {e.titel ?? 'Eintrag'}
              </span>
              <time dateTime={e.created_at} className="text-xs text-claimondo-light-blue">
                {formatiereZeit(e.created_at)}
              </time>
            </div>
            {e.beschreibung && (
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-claimondo-shield">
                {e.beschreibung}
              </p>
            )}
          </li>
        ))}
        {leadErstelltAm && (
          <li className="py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-medium text-claimondo-navy">Lead aufgenommen</span>
              <time dateTime={leadErstelltAm} className="text-xs text-claimondo-light-blue">
                {formatiereZeit(leadErstelltAm)}
              </time>
            </div>
            {quelle && (
              <p className="mt-1 text-sm text-claimondo-shield">Eingang über {quelle}</p>
            )}
          </li>
        )}
        {eintraege.length === 0 && !leadErstelltAm && (
          <li className="py-3">
            <EmptyState
              title="Noch kein Verlauf"
              description="Sobald etwas passiert — FlowLink versendet, Dokument eingegangen, Notiz — erscheint es hier."
            />
          </li>
        )}
      </ol>
    </SectionCard>
  )
}
