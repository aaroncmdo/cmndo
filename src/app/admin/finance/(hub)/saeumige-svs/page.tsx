// AAR-928: Saeumige SVs — alle SV-Abrechnungen die seit > 14 Tagen ueberfaellig
// und nicht bezahlt/storniert sind. Triggert manuell die Reminder-Logik
// (cron/sv-mahnung-saeumnis ueber CRON_SECRET-curl, hier nur Liste).

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import EmptyState from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

function eur(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

function formatDate(iso: string | null): string {
  if (!iso) return '–'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
}

export default async function SaeumigeSvsPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/')

  const heute = new Date()
  const grenzDatum = new Date(heute.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: faellige } = await supabase
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_id, empfaenger_name, empfaenger_email, summe_brutto, faellig_am, status')
    .eq('empfaenger_typ', 'sv')
    .is('bezahlt_am', null)
    .is('storniert_am', null)
    .not('faellig_am', 'is', null)
    .lte('faellig_am', grenzDatum)
    .order('faellig_am', { ascending: true })

  const rows = (faellige ?? []).map((a) => {
    const tageUeberfaellig = a.faellig_am
      ? Math.floor((heute.getTime() - new Date(a.faellig_am as string).getTime()) / (24 * 60 * 60 * 1000))
      : 0
    return { ...a, tage_ueberfaellig: tageUeberfaellig }
  })

  const totalOpen = rows.reduce((s, r) => s + Number(r.summe_brutto ?? 0), 0)

  return (
    <div className="p-4 md:p-6">
      <PageHeader
        title="Säumige SVs"
        description={`${rows.length} offene Abrechnung(en) — ${eur(totalOpen)} ausstehend`}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Keine säumigen SVs"
          description="Alle SV-Abrechnungen sind innerhalb der 14-Tage-Toleranz bezahlt oder storniert."
        />
      ) : (
        <DataTableContainer className="mt-4">
          <Table>
            <Thead>
              <Tr>
                <Th className="text-left px-4">Rechnungs-Nr</Th>
                <Th className="text-left px-4">SV</Th>
                <Th className="text-right px-4">Betrag (brutto)</Th>
                <Th className="text-center px-4">Fällig am</Th>
                <Th className="text-center px-4">Tage überfällig</Th>
                <Th className="text-left px-4">Status</Th>
                <Th className="text-right px-4">Aktion</Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((r) => {
                const stufe = r.tage_ueberfaellig >= 28 ? 'red-400' : r.tage_ueberfaellig >= 21 ? 'amber-400' : 'amber-300'
                return (
                  <Tr key={r.id} className="border-b border-claimondo-border/50 hover:bg-claimondo-bg/40">
                    <Td className="px-4 font-mono text-xs">{r.abrechnungs_nr}</Td>
                    <Td className="px-4">
                      <div className="text-claimondo-navy">{r.empfaenger_name ?? '–'}</div>
                      <div className="text-xs text-claimondo-ondo">{r.empfaenger_email ?? '–'}</div>
                    </Td>
                    <Td className="px-4 text-right tabular-nums">{eur(Number(r.summe_brutto ?? 0))}</Td>
                    <Td className="px-4 text-center">{formatDate(r.faellig_am as string | null)}</Td>
                    <Td className={`px-4 text-center font-semibold text-${stufe}`}>{r.tage_ueberfaellig}d</Td>
                    <Td className="px-4">{r.status}</Td>
                    <Td className="px-4 text-right">
                      <Link
                        href={`/admin/finance/abrechnungen?nr=${encodeURIComponent(r.abrechnungs_nr as string)}`}
                        className="text-claimondo-ondo hover:text-claimondo-navy underline text-sm"
                      >
                        Öffnen
                      </Link>
                    </Td>
                  </Tr>
                )
              })}
            </Tbody>
          </Table>
        </DataTableContainer>
      )}

      <p className="mt-4 text-xs text-claimondo-ondo">
        Mahnungs-Trigger läuft via Cron <code>cron/sv-mahnung-saeumnis</code> (AAR-927) — manueller curl-Aufruf möglich, kein VPS-Crontab-Eintrag.
      </p>
    </div>
  )
}
