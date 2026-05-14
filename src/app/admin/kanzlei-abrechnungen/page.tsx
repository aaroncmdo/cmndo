import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

export const dynamic = 'force-dynamic'

/**
 * KFZ-188: Admin-Listing aller Kanzlei-Monatsabrechnungen.
 * Nur fuer Admin-Rolle zugaenglich.
 */

type AbrechnungRow = {
  id: string
  rechnungsnummer: string
  abrechnungsmonat: number
  abrechnungsjahr: number
  kanzlei_name: string
  anzahl_vollmachten: number
  endbetrag_brutto: number
  status: string
  faelligkeitsdatum: string | null
  bezahlt_am: string | null
  versendet_am: string | null
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    offen: { label: 'Offen', cls: 'bg-yellow-100 text-yellow-800' },
    versendet: { label: 'Versendet', cls: 'bg-claimondo-bg text-claimondo-navy' },
    bezahlt: { label: 'Bezahlt', cls: 'bg-green-100 text-green-800' },
    ueberfaellig: { label: 'Ueberfaellig', cls: 'bg-red-100 text-red-800' },
    storniert: { label: 'Storniert', cls: 'bg-claimondo-bg text-claimondo-ondo' },
  }
  const { label, cls } = map[status] ?? { label: status, cls: 'bg-claimondo-bg text-claimondo-ondo' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {label}
    </span>
  )
}

export default async function KanzleiAbrechnungenPage() {
  // Auth pruefen
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // Daten laden mit Kanzlei-Join
  const db = createAdminClient()
  const { data, error } = await db
    .from('kanzlei_abrechnungen')
    .select(`
      id,
      rechnungsnummer,
      abrechnungsmonat,
      abrechnungsjahr,
      anzahl_vollmachten,
      endbetrag_brutto,
      status,
      faelligkeitsdatum,
      bezahlt_am,
      versendet_am,
      kanzleien ( name )
    `)
    .order('abrechnungsjahr', { ascending: false })
    .order('abrechnungsmonat', { ascending: false })
    .limit(300)

  if (error) {
    console.error('[KFZ-188 admin] Query-Fehler:', error.message)
  }

  const heute = new Date()
  const rows: AbrechnungRow[] = (data ?? []).map((r) => {
    const faellig = r.faelligkeitsdatum ? new Date(r.faelligkeitsdatum as string) : null
    let status = (r.status as string) ?? 'offen'
    // Dynamisch ueberfaellig markieren
    if (status === 'versendet' && faellig && heute > faellig) {
      status = 'ueberfaellig'
    }
    const kanzleiRaw = r.kanzleien as unknown
    const kanzleiName =
      kanzleiRaw && typeof kanzleiRaw === 'object' && 'name' in (kanzleiRaw as Record<string, unknown>)
        ? String((kanzleiRaw as Record<string, unknown>).name)
        : '—'
    return {
      id: r.id as string,
      rechnungsnummer: (r.rechnungsnummer as string) ?? '—',
      abrechnungsmonat: Number(r.abrechnungsmonat),
      abrechnungsjahr: Number(r.abrechnungsjahr),
      kanzlei_name: kanzleiName,
      anzahl_vollmachten: Number(r.anzahl_vollmachten ?? 0),
      endbetrag_brutto: Number(r.endbetrag_brutto ?? 0),
      status,
      faelligkeitsdatum: (r.faelligkeitsdatum as string) ?? null,
      bezahlt_am: (r.bezahlt_am as string) ?? null,
      versendet_am: (r.versendet_am as string) ?? null,
    }
  })

  // KPI
  const offen = rows.filter((r) => r.status === 'offen' || r.status === 'versendet').length
  const bezahlt = rows.filter((r) => r.status === 'bezahlt').length
  const ueberfaellig = rows.filter((r) => r.status === 'ueberfaellig').length
  const gesamtOffen = rows
    .filter((r) => r.status !== 'bezahlt' && r.status !== 'storniert')
    .reduce((acc, r) => acc + r.endbetrag_brutto, 0)

  return (
    <div className="py-6 space-y-6">
      <PageHeader title="Kanzlei-Abrechnungen" description="Monatsabrechnungen für alle aktiven Kanzleien" size="lg" />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Offen</p>
          <p className="text-2xl font-bold text-yellow-600 mt-1">{offen}</p>
        </div>
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Bezahlt</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{bezahlt}</p>
        </div>
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Ueberfaellig</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{ueberfaellig}</p>
        </div>
        <div className="bg-white rounded-ios-xl shadow-sm p-4 border">
          <p className="text-xs text-claimondo-ondo uppercase tracking-wider">Offen gesamt</p>
          <p className="text-2xl font-bold text-claimondo-navy mt-1">{gesamtOffen.toFixed(2).replace('.', ',')} €</p>
        </div>
      </div>

      {/* Tabelle */}
      <DataTableContainer variant="plain" className="bg-white rounded-ios-xl shadow-sm overflow-hidden border">
        <Table>
          <Thead className="text-sm normal-case !tracking-normal border-b">
            <Tr>
              <Th className="text-left font-semibold text-claimondo-ondo">Rechnungsnummer</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Monat</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Kanzlei</Th>
              <Th className="text-right font-semibold text-claimondo-ondo">Vollmachten</Th>
              <Th className="text-right font-semibold text-claimondo-ondo">Betrag (brutto)</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Status</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Faelligkeit</Th>
              <Th className="text-left font-semibold text-claimondo-ondo">Bezahlt am</Th>
            </Tr>
          </Thead>
          <Tbody>
            {rows.length === 0 && (
              <Tr>
                <Td colSpan={8} className="py-8 text-center !text-claimondo-ondo/70">
                  Keine Abrechnungen vorhanden
                </Td>
              </Tr>
            )}
            {rows.map((row) => {
              const monatName = new Intl.DateTimeFormat('de-DE', { month: 'short' }).format(
                new Date(row.abrechnungsjahr, row.abrechnungsmonat - 1, 1),
              )
              return (
                <Tr key={row.id} className="hover:bg-claimondo-bg transition-colors">
                  <Td className="font-mono text-xs">{row.rechnungsnummer}</Td>
                  <Td>{monatName} {row.abrechnungsjahr}</Td>
                  <Td className="font-medium">{row.kanzlei_name}</Td>
                  <Td className="text-right">{row.anzahl_vollmachten}</Td>
                  <Td className="text-right font-semibold">
                    {row.endbetrag_brutto.toFixed(2).replace('.', ',')} €
                  </Td>
                  <Td><StatusBadge status={row.status} /></Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {row.faelligkeitsdatum
                      ? new Date(row.faelligkeitsdatum).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
                      : '—'}
                  </Td>
                  <Td className="!text-claimondo-ondo text-xs">
                    {row.bezahlt_am
                      ? new Date(row.bezahlt_am).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })
                      : '—'}
                  </Td>
                </Tr>
              )
            })}
          </Tbody>
        </Table>
      </DataTableContainer>
    </div>
  )
}
