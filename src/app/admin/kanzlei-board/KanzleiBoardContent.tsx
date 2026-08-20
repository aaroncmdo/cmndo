// AAR-64 (refokussiert): Admin-internes Kanzlei-Kommunikationsboard.
// Zeigt: Zugewiesene Kanzleien pro Fall, LexDrive-Webhook-History, eingehende LexDrive-Tasks.
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ScaleIcon, MailIcon, AlertCircleIcon, ClockIcon } from 'lucide-react'
import { StatCard } from '@/components/shared/StatCard'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'

// AAR-64 → F0: header-loser Kanzlei-Board-Content. Geteilt von /admin/kanzlei-board
// (Standalone) + /admin/faelle/kanzlei (Hub-Tab). Header liefert die Route bzw. der Hub-Header.
export default async function KanzleiBoardContent() {
  const db = await createClient()

  // 1. Zugewiesene Kanzleien — FIX (Dashboard-Audit 29.06.): vorher parteien.rolle='kanzlei'
  // (Enum partei_rolle kennt kein 'kanzlei' -> 22P02 Runtime-Error) + faelle(...)-Embed (Tabelle
  // faelle gedroppt -> PGRST200). Korrekte Quelle = kanzlei_faelle (claim_id/kanzlei_id/status).
  // Claim-/Kanzlei-Infos via separate Lookups (keine unverifizierten PostgREST-Embeds).
  const { data: kanzleiFaelle } = await db
    .from('kanzlei_faelle')
    .select('id, claim_id, fall_id, status, mandatsnummer, erstellt_am, kanzlei_id')
    .order('erstellt_am', { ascending: false })
    .limit(50)

  const kfClaimIds = Array.from(new Set((kanzleiFaelle ?? []).map(k => k.claim_id).filter((x): x is string => !!x)))
  const kfKanzleiIds = Array.from(new Set((kanzleiFaelle ?? []).map(k => k.kanzlei_id).filter((x): x is string => !!x)))
  const claimMap = new Map<string, { claim_nummer: string | null; kennzeichen: string | null }>()
  const kanzleiMap = new Map<string, { name: string | null; email: string | null; ansprechpartner: string | null }>()
  // Claims, die als Testfall deaktiviert wurden (ist_aktiv=false). v_claim_full filtert das NICHT
  // selbst — gemessen 20.08.: 1 der 7 Kanzlei-Faelle auf prod haengt an einem Testfall und zaehlte
  // sowohl in der Liste als auch in der StatCard-Zahl mit.
  const deaktivierteClaimIds = new Set<string>()
  if (kfClaimIds.length > 0) {
    // v_claim_full ist claims-anchored: id = Claim-ID (es gibt KEINE claim_id-Spalte). Join-Test
    // (admin-JWT) bestaetigt: vcf.id = kanzlei_faelle.claim_id matcht alle 14 Kanzlei-Faelle.
    const { data } = await db.from('v_claim_full').select('id, claim_nummer, kennzeichen, ist_aktiv').in('id', kfClaimIds)
    for (const c of data ?? []) {
      if (c.ist_aktiv === false) { deaktivierteClaimIds.add(c.id as string); continue }
      claimMap.set(c.id as string, { claim_nummer: c.claim_nummer as string | null, kennzeichen: c.kennzeichen as string | null })
    }
  }
  // Bewusst nur NACHWEISLICH deaktivierte aussortieren — nicht "alles, was nicht in claimMap steht".
  // Sonst wuerde ein per RLS unsichtbarer Claim seine Kanzlei-Zeile mitreissen (Verhaltensaenderung).
  const sichtbareKanzleiFaelle = (kanzleiFaelle ?? []).filter(
    k => !k.claim_id || !deaktivierteClaimIds.has(k.claim_id as string),
  )
  if (kfKanzleiIds.length > 0) {
    const { data } = await db.from('kanzleien').select('id, name, email, ansprechpartner').in('id', kfKanzleiIds)
    for (const k of data ?? []) kanzleiMap.set(k.id as string, { name: k.name as string | null, email: k.email as string | null, ansprechpartner: k.ansprechpartner as string | null })
  }

  // 2. LexDrive Webhook-History (source = lexdrive)
  const { data: webhookEvents } = await db
    .from('webhook_events')
    .select('id, event_id, event_type, fall_id, fall_nr, status, error_message, created_at, processed_at')
    .eq('source', 'lexdrive')
    .order('created_at', { ascending: false })
    .limit(30)

  // 3. Eingehende LexDrive-Tasks
  const { data: lexdriveTasks } = await db
    .from('tasks')
    .select('id, titel, fall_id, status, prioritaet, created_at')
    .like('typ', 'lexdrive%')
    .neq('status', 'erledigt')
    .order('created_at', { ascending: false })
    .limit(20)

  return (
    <>
      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard size="sm" icon={ScaleIcon} tone="ondo" label="Kanzlei-Fälle" value={sichtbareKanzleiFaelle.length} />
        <StatCard size="sm" icon={MailIcon} tone="ondo" label="LexDrive-Events" value={webhookEvents?.length ?? 0} />
        <StatCard size="sm" icon={AlertCircleIcon} tone="warning" label="Offene LexDrive-Tasks" value={lexdriveTasks?.length ?? 0} />
      </div>

      {/* Kanzlei-Parteien */}
      <section className="bg-white rounded-ios-lg shadow-ios-md">
        <div className="px-4 py-3 border-b border-claimondo-border">
          <h2 className="text-sm font-semibold text-claimondo-navy">Zugewiesene Kanzleien</h2>
        </div>
        <DataTableContainer variant="plain">
          <Table>
            <Thead>
              <Tr>
                <Th className="text-left font-bold !py-2">Fall</Th>
                <Th className="text-left font-bold !py-2">Kanzlei</Th>
                <Th className="text-left font-bold !py-2">Kontakt</Th>
                <Th className="text-left font-bold !py-2">Status</Th>
                <Th className="text-left font-bold !py-2">Zugewiesen</Th>
              </Tr>
            </Thead>
            <Tbody>
              {sichtbareKanzleiFaelle.map(kf => {
                const claim = kf.claim_id ? claimMap.get(kf.claim_id as string) : undefined
                const kanzlei = kf.kanzlei_id ? kanzleiMap.get(kf.kanzlei_id as string) : undefined
                const linkId = (kf.fall_id ?? kf.claim_id) as string | null
                return (
                  <Tr key={kf.id}>
                    <Td>
                      {linkId ? (
                        <Link href={`/faelle/${linkId}`} className="text-claimondo-ondo hover:underline font-medium">
                          {claim?.claim_nummer ?? linkId.slice(0, 8)}
                        </Link>
                      ) : (
                        <span className="font-medium text-claimondo-navy">{claim?.claim_nummer ?? '—'}</span>
                      )}
                      {claim?.kennzeichen && <p className="text-xs text-claimondo-ondo/70">{claim.kennzeichen}</p>}
                    </Td>
                    <Td>{kanzlei?.name ?? '—'}</Td>
                    <Td className="!text-claimondo-ondo text-xs">
                      {kanzlei?.ansprechpartner ?? '—'}<br />
                      {kanzlei?.email ?? ''}
                    </Td>
                    <Td>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-claimondo-bg text-claimondo-navy">{kf.status ?? '—'}</span>
                    </Td>
                    <Td className="text-xs !text-claimondo-ondo/70">
                      {kf.erstellt_am ? new Date(kf.erstellt_am as string).toLocaleDateString('de-DE') : '—'}
                    </Td>
                  </Tr>
                )
              })}
              {sichtbareKanzleiFaelle.length === 0 && (
                <Tr><Td colSpan={5} className="py-8 text-center !text-claimondo-ondo/70 text-sm">Keine Kanzlei-Fälle</Td></Tr>
              )}
            </Tbody>
          </Table>
        </DataTableContainer>
      </section>

      {/* LexDrive-Webhook-History */}
      <section className="bg-white rounded-ios-lg shadow-ios-md">
        <div className="px-4 py-3 border-b border-claimondo-border flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-claimondo-ondo/70" />
          <h2 className="text-sm font-semibold text-claimondo-navy">LexDrive Status-History</h2>
        </div>
        <div className="divide-y divide-claimondo-border max-h-[400px] overflow-y-auto">
          {(webhookEvents ?? []).map(e => (
            <div key={e.id} className="px-4 py-3 flex items-center justify-between text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-claimondo-navy truncate">{e.event_type}</p>
                <p className="text-xs text-claimondo-ondo">
                  Fall {e.fall_nr ?? (e.fall_id as string | null)?.slice(0, 8) ?? '—'}
                  {e.error_message && <span className="text-danger ml-2">{e.error_message}</span>}
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  e.status === 'processed' ? 'bg-success-soft text-success-strong' :
                  e.status === 'error' ? 'bg-danger-soft text-danger-strong' :
                  'bg-claimondo-bg text-claimondo-ondo'
                }`}>{e.status}</span>
                <span className="text-xs text-claimondo-ondo/70">
                  {new Date(e.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>
          ))}
          {(!webhookEvents || webhookEvents.length === 0) && (
            <p className="px-4 py-8 text-center text-claimondo-ondo/70 text-sm">Keine LexDrive-Events</p>
          )}
        </div>
      </section>

      {/* LexDrive-Tasks */}
      <section className="bg-white rounded-ios-lg shadow-ios-md">
        <div className="px-4 py-3 border-b border-claimondo-border">
          <h2 className="text-sm font-semibold text-claimondo-navy">Offene LexDrive-Tasks</h2>
        </div>
        <div className="divide-y divide-claimondo-border">
          {(lexdriveTasks ?? []).map(t => (
            <Link key={t.id} href={`/faelle/${t.fall_id}`} className="block px-4 py-3 hover:bg-claimondo-bg transition-colors text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-claimondo-navy">{t.titel}</p>
                  <p className="text-xs text-claimondo-ondo">Status: {t.status}</p>
                </div>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  t.prioritaet === 'kritisch' ? 'bg-danger-soft text-danger-strong' :
                  t.prioritaet === 'dringend' ? 'bg-warning-soft text-warning-strong' :
                  'bg-claimondo-bg text-claimondo-ondo'
                }`}>{t.prioritaet}</span>
              </div>
            </Link>
          ))}
          {(!lexdriveTasks || lexdriveTasks.length === 0) && (
            <p className="px-4 py-8 text-center text-claimondo-ondo/70 text-sm">Keine offenen LexDrive-Tasks</p>
          )}
        </div>
      </section>
    </>
  )
}

