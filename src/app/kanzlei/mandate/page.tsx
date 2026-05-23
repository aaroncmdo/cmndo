// AAR-kanzlei-portal Dashboard — Mandat-Liste aller komplett-Fälle.
//
// RLS filtert serverseitig (Migration 20260421151144): Kanzlei-User sieht
// nur Fälle mit service_typ='komplett'. Read-only — keine Edit-Actions
// in diesem Portal.
//
// Spalten (laut Feedback Aaron 21.04.2026):
//   Fall-Nr · Kunde · Aktuelle Phase · Letzte Änderung · Mandatsnummer · Status
//
// Click auf Row → /kanzlei/fall/[id] (Read-only-Fallakte, kommt in PR 2b).

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { FolderOpenIcon, ArrowRightIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'
import FallStatusBadge from '@/components/shared/FallStatusBadge'
import { Table, Thead, Tbody, Tr, Th, Td, DataTableContainer } from '@/components/shared/DataTable'
import { AKTUELLE_PHASE_LABELS } from '@/lib/statusLabels'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export default async function KanzleiDashboardPage() {
  const supabase = await createClient()

  // CMM-44 SP-A2 (Cluster 3): aktuelle_phase → claims.phase (SSoT) via Embed.
  // CMM-44 SP-B PR2a: service_typ lebt auf claims (SSoT) — Filter via
  // claims!inner-Join statt faelle-seitigem .eq().
  const { data: faelle, error } = await supabase
    .from('faelle')
    .select(
      'id, status, kunde_vorname, kunde_nachname, kennzeichen, updated_at, created_at, kanzlei_faelle(mandatsnummer), claims:claim_id!inner(phase, claim_nummer, service_typ)',
    )
    .eq('claims.service_typ', 'komplett')
    .order('updated_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-4">
      <PageHeader
        title="Mandate"
        description="Alle Komplett-Pakete, bei denen Claimondo das Mandat an euch übergeben hat."
        size="lg"
        actions={
          <span className="text-xs text-claimondo-ondo">
            {faelle?.length ?? 0} Mandat{(faelle?.length ?? 0) === 1 ? '' : 'e'}
          </span>
        }
      />

      {error && (
        <div className="rounded-ios-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fehler beim Laden: {error.message}
        </div>
      )}

      {!error && faelle && faelle.length === 0 && (
        <div className="rounded-ios-xl border border-claimondo-border bg-white p-8 text-center">
          <FolderOpenIcon className="w-10 h-10 mx-auto text-claimondo-shield mb-2" />
          <p className="text-sm font-medium text-claimondo-navy">
            Aktuell liegt kein Komplett-Mandat vor.
          </p>
          <p className="text-xs text-claimondo-ondo mt-1">
            Sobald Claimondo ein Mandat an euch übergibt, erscheint es hier.
          </p>
        </div>
      )}

      {!error && faelle && faelle.length > 0 && (
        <DataTableContainer variant="plain" className="rounded-ios-xl border border-claimondo-border bg-white overflow-hidden">
            <Table>
              <Thead className="!text-[10px]">
                <Tr>
                  <Th className="!font-semibold">Fall-Nr</Th>
                  <Th className="!font-semibold">Kunde</Th>
                  <Th className="!font-semibold">Kennzeichen</Th>
                  <Th className="!font-semibold">Phase</Th>
                  <Th className="!font-semibold">Status</Th>
                  <Th className="!font-semibold">Mandat-Nr</Th>
                  <Th className="!font-semibold">Letzte Änderung</Th>
                  <Th className="w-10" />
                </Tr>
              </Thead>
              <Tbody className="!divide-y-0">
                {faelle.map((f) => {
                  const kunde = [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—'
                  // CMM-44 SP-A2 (Cluster 3): claims.phase via Embed (Array|Objekt normalisieren).
                  const fClaim = Array.isArray(f.claims) ? f.claims[0] : f.claims
                  // CMM-44 SP-I2: mandatsnummer aus kanzlei_faelle (1:1 via fall_id).
                  const fKf = Array.isArray(f.kanzlei_faelle) ? f.kanzlei_faelle[0] : f.kanzlei_faelle
                  const phaseKey = String(fClaim?.phase ?? '')
                  const phaseLabel = AKTUELLE_PHASE_LABELS[phaseKey] ?? phaseKey ?? '—'
                  return (
                    <Tr
                      key={f.id}
                      className="border-t border-claimondo-border hover:bg-claimondo-bg transition-colors"
                    >
                      <Td className="font-mono text-[12px]">
                        <Link
                          href={`/kanzlei/fall/${f.id}`}
                          className="hover:underline"
                        >
                          {(fClaim?.claim_nummer as string | null) ?? f.id.slice(0, 8)}
                        </Link>
                      </Td>
                      <Td>{kunde}</Td>
                      <Td className="font-mono text-[12px]">
                        {f.kennzeichen ?? '—'}
                      </Td>
                      <Td>{phaseLabel}</Td>
                      <Td>
                        <FallStatusBadge status={f.status as string | null} size="md" />
                      </Td>
                      <Td className="font-mono text-[12px]">
                        {(fKf?.mandatsnummer as string | null) ?? '—'}
                      </Td>
                      <Td className="!text-claimondo-ondo text-xs">
                        {formatDate((f.updated_at as string | null) ?? (f.created_at as string | null))}
                      </Td>
                      <Td className="!text-claimondo-ondo/70">
                        <Link href={`/kanzlei/fall/${f.id}`} aria-label="Öffnen">
                          <ArrowRightIcon className="w-4 h-4" />
                        </Link>
                      </Td>
                    </Tr>
                  )
                })}
              </Tbody>
            </Table>
        </DataTableContainer>
      )}
    </div>
  )
}
