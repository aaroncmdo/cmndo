// Darstellung der Support-Meldungen aus dem "Hilfe und Support"-Widget.
//
// Geteilt zwischen /admin/support und /mitarbeiter/support: die RLS-Policy
// (support_ticket_log_select_public_consol) gibt admin UND kundenbetreuer dieselbe Sicht auf
// alle Meldungen — zwei Portale, ein Inhalt. Waere die Tabelle zweimal geschrieben, liefen die
// Erklaertexte auseinander, und genau die tragen hier die Bedeutung (s. u.).
//
// Bewusst NUR DARSTELLUNG, kein Laden: welcher Supabase-Client die Zeilen holt, entscheidet die
// jeweilige Seite. /admin/support liest per service_role (Bestand), /mitarbeiter/support per
// RLS-Client — dort folgt die Sicht der Policy statt dem Layout-Guard.
// Soll-Blatt: memory/abnahmen/2026-09-09-support-meldungen-kundenbetreuer.md
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

/** Die Textspalte kam mit Migration 20260908170753 — alles davor hat keinen Wortlaut. */
const TEXTSPALTE_SEIT = new Date('2026-09-08T17:07:53Z')

const ART_LABEL: Record<string, string> = {
  new: 'Ticket angelegt',
  comment: 'an bestehendes Ticket',
  no_action: 'nur Gespräch',
}

export type SupportMeldung = {
  id: string
  user_id: string | null
  created_at: string
  action_type: string | null
  ticket_typ: string | null
  linear_issue_id: string | null
  page_url: string | null
  meldung_text: string | null
  turn_count: number | null
  has_screenshot: boolean | null
  has_voice: boolean | null
}

export type SupportMelder = {
  id: string
  anzeigename: string | null
  email: string | null
  rolle: string | null
}

function zeitpunkt(iso: string): string {
  return new Date(iso).toLocaleString('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Nur der Pfad — die volle URL sprengt die Spalte und sagt nicht mehr. */
function seitenPfad(url: string | null): string {
  if (!url) return '—'
  try {
    return new URL(url).pathname || '/'
  } catch {
    return url
  }
}

/**
 * Der Erklaersatz ueber der Tabelle. Er ist NICHT Dekoration: ohne ihn sehen eine Zeile ohne
 * Wortlaut und eine ohne Ticket wie Defekte aus. Beides hat einen Grund, und beide Gruende
 * altern — deshalb stehen sie an einer Stelle und nicht zweimal.
 */
export function SupportMeldungenHinweis() {
  return (
    <p className="mb-5 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4 text-body-sm text-claimondo-ondo">
      Der Wortlaut wird seit dem <strong>8. September 2026</strong> gespeichert — ältere Einträge
      haben nur Metadaten, das ist kein Fehler. Ein fehlendes Ticket ebenso wenig: Der externe
      Ticket-Dienst hat seit Mai keinen Zugangsschlüssel. Die Meldung liegt trotzdem vollständig
      hier und ging zusätzlich per E-Mail raus.
    </p>
  )
}

export function SupportMeldungenListe({
  meldungen,
  melderById,
}: {
  meldungen: SupportMeldung[]
  melderById: Map<string, SupportMelder>
}) {
  if (meldungen.length === 0) {
    return (
      <div className="bg-white rounded-ios-lg shadow-ios-md p-8 text-center">
        <p className="text-claimondo-ondo/70 text-body-sm">
          Noch keine Meldungen. Sobald jemand das Hilfe-Widget benutzt, erscheint sie hier.
        </p>
      </div>
    )
  }

  return (
    <DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
      <Table>
        <Thead className="normal-case! tracking-normal! border-b border-claimondo-border">
          <Tr>
            <Th className="text-left py-2!">Wann</Th>
            <Th className="text-left py-2!">Melder</Th>
            <Th className="text-left py-2!">Seite</Th>
            <Th className="text-left py-2!">Meldung</Th>
            <Th className="text-left py-2!">Ablage</Th>
          </Tr>
        </Thead>
        <Tbody className="divide-y-0!">
          {meldungen.map((m) => {
            const melder = m.user_id ? melderById.get(m.user_id) : null
            const vorTextspalte = new Date(m.created_at) < TEXTSPALTE_SEIT
            return (
              <Tr key={m.id} className="border-b border-claimondo-border hover:bg-claimondo-bg">
                <Td className="text-claimondo-ondo! text-body-xs whitespace-nowrap align-top tabular-nums">
                  {zeitpunkt(m.created_at)}
                </Td>
                <Td className="align-top">
                  <span className="block text-body-xs font-medium">
                    {melder?.anzeigename ?? melder?.email ?? 'unbekannt'}
                  </span>
                  <span className="block text-caption text-claimondo-ondo/70">{melder?.rolle ?? '—'}</span>
                </Td>
                <Td className="align-top">
                  <span
                    className="block max-w-64 truncate font-mono text-caption text-claimondo-ondo/70"
                    title={m.page_url ?? ''}
                  >
                    {seitenPfad(m.page_url)}
                  </span>
                </Td>
                <Td className="align-top">
                  {m.meldung_text ? (
                    <span className="block max-w-2xl whitespace-pre-wrap break-words text-body-xs">
                      {m.meldung_text}
                    </span>
                  ) : (
                    <span className="text-caption italic text-claimondo-ondo/70">
                      {vorTextspalte
                        ? 'vor dem 08.09. protokolliert — kein Wortlaut gespeichert'
                        : 'kein Wortlaut übermittelt'}
                    </span>
                  )}
                  <span className="mt-1 block text-caption text-claimondo-ondo/70">
                    {ART_LABEL[m.action_type ?? ''] ?? m.action_type ?? '—'}
                    {m.ticket_typ && m.ticket_typ !== m.action_type ? ` · ${m.ticket_typ}` : ''}
                    {m.turn_count ? ` · ${m.turn_count} Runden` : ''}
                    {m.has_screenshot ? ' · Screenshot' : ''}
                    {m.has_voice ? ' · Sprachnachricht' : ''}
                  </span>
                </Td>
                <Td className="align-top whitespace-nowrap text-caption text-claimondo-ondo/70">
                  {m.linear_issue_id ? 'Linear' : 'nur hier'}
                </Td>
              </Tr>
            )
          })}
        </Tbody>
      </Table>
    </DataTableContainer>
  )
}

/** Die Spaltenliste — damit beide Seiten dieselben Felder holen und nichts fehlt. */
export const SUPPORT_MELDUNG_SPALTEN =
  'id, user_id, created_at, action_type, ticket_typ, linear_issue_id, page_url, meldung_text, turn_count, has_screenshot, has_voice'
