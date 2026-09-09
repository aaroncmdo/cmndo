// Support-Ansicht des Admin-Portals.
//
// ZWEI QUELLEN, eine Seite — und nur eine davon lebt:
//
//  1. `support_ticket_log` — das "Hilfe und Support"-Widget. LEBENDIG. Bis zum 08.09.2026 legte
//     es Linear-Tickets an; der LINEAR_API_KEY fehlt seit Mai (auch auf prod, am Verhalten
//     belegt), und die Tabelle speicherte nur Metadaten. Jede Meldung ging verloren, waehrend
//     der Melder eine freundliche Bestaetigung bekam. Seit #5941 liegt der Wortlaut in
//     `meldung_text` und eine E-Mail geht raus. Diese Seite ist das Gedaechtnis dazu: die Mail
//     traegt die Aufmerksamkeit, kann aber geloescht oder uebersehen werden.
//
//  2. `technische_probleme` — der ALTE Kanal. Gemessen 09.09.2026: 0 Zeilen, und im ganzen
//     Repo kein einziger Schreiber (die einzige weitere Fundstelle ist eine Loeschliste beim
//     Fall-Loeschen). Der Composer wurde aufs Widget umgestellt, die Ansicht blieb als leere
//     Huelle zurueck. Sie wird deshalb nur noch gezeigt, WENN sie Zeilen hat — die Tabelle
//     selbst zu droppen waere ein eigener Auftrag mit eigener Migration.
//
// Bewusst NUR LESEND: kein Status, kein Bearbeiten, kein Loeschen. Eine Meldung ist ein
// Protokoll, kein Vorgang. Soll-Blatt: memory/abnahmen/2026-09-09-support-meldungen-ansicht.md
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { StatusBadge } from '@/components/shared/StatusBadge'
import PageHeader from '@/components/shared/PageHeader'
import { DataTableContainer, Table, Thead, Tbody, Tr, Th, Td } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

const STATUS_COLOR: Record<string, string> = {
  neu: 'bg-claimondo-ondo/5 text-claimondo-ondo',
  'in-bearbeitung': 'bg-warning-soft text-warning-strong',
  geloest: 'bg-success-soft text-success-strong',
  geschlossen: 'bg-claimondo-bg text-claimondo-ondo',
}

const KAT_LABEL: Record<string, string> = {
  'seite-laedt-nicht': 'Seite lädt nicht',
  'upload-fehler': 'Upload-Fehler',
  'anzeige-fehler': 'Anzeige-Fehler',
  'login-problem': 'Login-Problem',
  sonstiges: 'Sonstiges',
}

const ART_LABEL: Record<string, string> = {
  new: 'Ticket angelegt',
  comment: 'an bestehendes Ticket',
  no_action: 'nur Gespräch',
}

/** Die Textspalte kam mit Migration 20260908170753 — alles davor hat keinen Wortlaut. */
const TEXTSPALTE_SEIT = new Date('2026-09-08T17:07:53Z')

type Meldung = {
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

export default async function SupportPage() {
  const supabase = await createClient()
  const db = createAdminClient()

  const [{ data: meldungsDaten }, { data: probleme }] = await Promise.all([
    db
      .from('support_ticket_log')
      .select(
        'id, user_id, created_at, action_type, ticket_typ, linear_issue_id, page_url, meldung_text, turn_count, has_screenshot, has_voice',
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('technische_probleme')
      .select('id, user_id, kategorie, beschreibung, browser, aktuelle_url, status, antwort, erstellt_am, profiles(vorname, nachname, email)')
      .order('erstellt_am', { ascending: false }),
  ])

  const meldungen = (meldungsDaten ?? []) as Meldung[]

  // Melder separat laden: support_ticket_log.user_id zeigt auf auth.users, nicht auf profiles —
  // ein PostgREST-Embed waere unaufloesbar. Zwei-Schritt statt FK-Zwang (Muster: admin/kommentare).
  const userIds = [...new Set(meldungen.map((m) => m.user_id).filter((v): v is string => !!v))]
  const { data: profilDaten } = userIds.length
    ? await db.from('profiles').select('id, anzeigename, email, rolle').in('id', userIds)
    : { data: [] as Array<{ id: string; anzeigename: string | null; email: string | null; rolle: string | null }> }
  const melderById = new Map(
    (
      (profilDaten ?? []) as Array<{ id: string; anzeigename: string | null; email: string | null; rolle: string | null }>
    ).map((p) => [p.id, p]),
  )

  const mitWortlaut = meldungen.filter((m) => m.meldung_text).length
  const alteProbleme = probleme ?? []

  return (
    <div className="py-6 overflow-y-auto" style={{ height: '100%' }}>
      <div>
        <div className="mb-6">
          <PageHeader
            title="Support-Meldungen"
            description={`${meldungen.length} Meldungen aus dem Hilfe-Widget${mitWortlaut > 0 ? ` · ${mitWortlaut} mit Wortlaut` : ''}`}
            size="lg"
          />
        </div>

        <p className="mb-5 rounded-ios-md border border-claimondo-border bg-claimondo-bg p-4 text-body-sm text-claimondo-ondo">
          Der Wortlaut wird seit dem <strong>8. September 2026</strong> gespeichert — ältere
          Einträge haben nur Metadaten, das ist kein Fehler. Ein fehlendes Ticket ebenso wenig:
          Der externe Ticket-Dienst hat seit Mai keinen Zugangsschlüssel. Die Meldung liegt
          trotzdem vollständig hier und ging zusätzlich per E-Mail raus.
        </p>

        {meldungen.length === 0 ? (
          <div className="bg-white rounded-ios-lg shadow-ios-md p-8 text-center">
            <p className="text-claimondo-ondo/70 text-body-sm">
              Noch keine Meldungen. Sobald jemand das Hilfe-Widget benutzt, erscheint sie hier.
            </p>
          </div>
        ) : (
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
        )}

        {/* Alter Kanal: nur zeigen, wenn er wider Erwarten doch Zeilen hat (gemessen 09.09.: 0,
            kein Schreiber im Repo). Sonst wäre es ein dauerhaft leerer Block, der aussieht wie
            ein Defekt. */}
        {alteProbleme.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-2 text-body-sm font-semibold text-claimondo-navy">
              Technische Probleme (alter Meldeweg, seit dem Umstieg aufs Hilfe-Widget ohne Zulauf)
            </h2>
            <DataTableContainer variant="plain" className="bg-white rounded-ios-lg shadow-ios-md overflow-hidden">
              <Table>
                <Thead className="normal-case! tracking-normal! border-b border-claimondo-border">
                  <Tr>
                    <Th className="text-left py-2!">Datum</Th>
                    <Th className="text-left py-2!">Kunde</Th>
                    <Th className="text-left py-2!">Kategorie</Th>
                    <Th className="text-left py-2!">Beschreibung</Th>
                    <Th className="text-left py-2!">Status</Th>
                    <Th className="text-left py-2!">Browser</Th>
                  </Tr>
                </Thead>
                <Tbody className="divide-y-0!">
                  {alteProbleme.map(p => {
                    const profileRaw = p.profiles as unknown
                    const profile = (Array.isArray(profileRaw) ? profileRaw[0] : profileRaw) as { vorname: string | null; nachname: string | null; email: string | null } | null
                    const name = profile ? [profile.vorname, profile.nachname].filter(Boolean).join(' ') || profile.email : '—'
                    return (
                      <Tr key={p.id} className="border-b border-claimondo-border hover:bg-claimondo-bg">
                        <Td className="text-claimondo-ondo! text-body-xs whitespace-nowrap">
                          {new Date(p.erstellt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </Td>
                        <Td className="text-body-xs">{name}</Td>
                        <Td>
                          <span className="text-caption bg-claimondo-bg text-claimondo-ondo px-1.5 py-0.5 rounded">{KAT_LABEL[p.kategorie] ?? p.kategorie}</span>
                        </Td>
                        <Td className="text-body-xs max-w-xs truncate">{p.beschreibung}</Td>
                        <Td>
                          <StatusBadge colorCls={STATUS_COLOR[p.status] ?? 'bg-claimondo-bg text-claimondo-ondo'}>{p.status}</StatusBadge>
                        </Td>
                        <Td className="text-claimondo-ondo/70! text-caption max-w-32 truncate">{p.browser?.split(' ').pop() ?? '—'}</Td>
                      </Tr>
                    )
                  })}
                </Tbody>
              </Table>
            </DataTableContainer>
          </section>
        )}
      </div>
    </div>
  )
}
