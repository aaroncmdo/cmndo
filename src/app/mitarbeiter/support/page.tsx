// Support-Meldungen im Mitarbeiter-Portal (Kundenbetreuer).
//
// WARUM diese Route existiert: Die RLS-Policy support_ticket_log_select_public_consol erlaubt
// dem Kundenbetreuer seit jeher, ALLE Meldungen zu lesen — er hatte aber keinen Weg dorthin.
// Die Ansicht lag nur unter /admin/support, und das Admin-Layout laesst nur `admin` durch.
// Ein Recht ohne Tuer, bei 3 Kundenbetreuern und 4 Admins. (Aaron 09.09.: "ja geh die Route an")
//
// ⭐ Gelesen wird per RLS-Client (createClient), NICHT per service_role wie in /admin/support.
// Damit folgt die Sicht der POLICY und nicht dem Layout-Guard: Naehme jemand spaeter eine
// dritte Rolle ins /mitarbeiter-Layout auf (etwa `dispatch`), zeigte eine service_role-Ansicht
// ihr sofort alles — obwohl die Policy es nicht erlaubt. So bleibt die Grenze an einer Stelle
// definiert. Entspricht dem Muster der Nachbarseiten (reklamationen liest ebenfalls per RLS).
//
// Bewusst NUR LESEND — wie im Admin-Portal. Eine Meldung ist ein Protokoll, kein Vorgang.
// Soll-Blatt: memory/abnahmen/2026-09-09-support-meldungen-kundenbetreuer.md
import { createClient } from '@/lib/supabase/server'
import PageHeader from '@/components/shared/PageHeader'
import {
  SupportMeldungenListe,
  SupportMeldungenHinweis,
  SUPPORT_MELDUNG_SPALTEN,
  type SupportMeldung,
  type SupportMelder,
} from '@/components/shared/support/SupportMeldungenListe'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterSupportMeldungen() {
  const supabase = await createClient()

  const { data: rohdaten, error } = await supabase
    .from('support_ticket_log')
    .select(SUPPORT_MELDUNG_SPALTEN)
    .order('created_at', { ascending: false })
    .limit(200)

  const meldungen = (rohdaten ?? []) as unknown as SupportMeldung[]

  // Melder separat laden: support_ticket_log.user_id zeigt auf auth.users, nicht auf profiles —
  // ein PostgREST-Embed waere unaufloesbar. Zwei-Schritt statt FK-Zwang.
  const userIds = [...new Set(meldungen.map((m) => m.user_id).filter((v): v is string => !!v))]
  const { data: profilDaten } = userIds.length
    ? await supabase.from('profiles').select('id, anzeigename, email, rolle').in('id', userIds)
    : { data: [] as SupportMelder[] }
  const melderById = new Map(((profilDaten ?? []) as SupportMelder[]).map((p) => [p.id, p]))

  const mitWortlaut = meldungen.filter((m) => m.meldung_text).length

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Support-Meldungen"
        description={`${meldungen.length} Meldungen aus dem Hilfe-Widget${mitWortlaut > 0 ? ` · ${mitWortlaut} mit Wortlaut` : ''}`}
        size="lg"
      />

      <div className="mt-6">
        {error && (
          <p className="mb-5 rounded-ios-md border border-danger bg-danger-soft p-4 text-body-sm text-danger-strong">
            Die Meldungen konnten nicht geladen werden: {error.message}
          </p>
        )}

        <SupportMeldungenHinweis />
        <SupportMeldungenListe meldungen={meldungen} melderById={melderById} />
      </div>
    </div>
  )
}
