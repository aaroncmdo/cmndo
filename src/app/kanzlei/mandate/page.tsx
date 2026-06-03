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
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'
// CMM-44 MP-4d: 4-Phasen-Modell (v_claim_phase) statt claims.phase-11-Code-Label.
import { toClaimMainPhase, toClaimSubPhase, MAIN_PHASE_LABEL, SUBPHASE_LABEL } from '@/lib/claims/lifecycle'

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

  // CMM-44 MP-6a: Hauptphase kommt aus v_claim_phase (s.u.), nicht mehr aus
  // claims.phase — daher kein phase-Feld mehr im claims-Embed (DROP in MP-6c).
  // CMM-44 SP-B PR2a: service_typ lebt auf claims (SSoT) — Filter via
  // claims!inner-Join statt faelle-seitigem .eq().
  // CMM-65: nach claims.created_at sortieren + anzeigen (Aaron-Entscheidung;
  // faelle.updated_at stirbt mit Phase-6-Drop, claims.updated_at backfill-geclobbert).
  // supabase-js kann nicht nach eingebetteter to-one-Spalte ordnen -> flachziehen + client-sort.
  const { data: faelleRaw, error } = await supabase
    .from('faelle')
    .select(
      // CMM-44 MP-8c: claim_id (faelle->claims-FK) explizit selektieren — wird fuer
      // den claim_id-keyed v_claim_phase-Lookup unten gebraucht (claims.id != faelle.id).
      'id, claim_id, status, kunde_vorname, kunde_nachname, kennzeichen, kanzlei_faelle(mandatsnummer), claims:claim_id!inner(claim_nummer, service_typ, created_at)',
    )
    .eq('claims.service_typ', 'komplett')
  const faelle = (faelleRaw ?? [])
    .map((f) => {
      const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
      return { ...f, created_at: (c?.created_at as string | null) ?? null }
    })
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))

  // CMM-44 MP-8c: Phasen via shared getClaimPhaseMap — Helper liest v_claim_phase
  // claim_id-keyed (claims-zentrisch, MP-8b-Invariante: claims.id != faelle.id).
  // Frueher: inline-Read mit mandatIds=faelle.id → matchte 73/74 nicht.
  const mandatClaimIds = faelle
    .map((f) => f.claim_id)
    .filter((x): x is string => !!x)
  const phaseMap = await getClaimPhaseMap(mandatClaimIds)

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
                  // CMM-44 SP-I2: claim_nummer aus dem claims-Embed (Array|Objekt normalisieren).
                  const fClaim = Array.isArray(f.claims) ? f.claims[0] : f.claims
                  // CMM-44 SP-I2: mandatsnummer aus kanzlei_faelle (1:1 via fall_id).
                  const fKf = Array.isArray(f.kanzlei_faelle) ? f.kanzlei_faelle[0] : f.kanzlei_faelle
                  // CMM-44 MP-8c: phaseMap ist claim_id-keyed (claims.id != faelle.id).
                  const ph = f.claim_id ? phaseMap.get(f.claim_id) : undefined
                  const mainPhase = ph?.mainPhase ?? toClaimMainPhase(null)
                  const subPhase = ph?.subPhase ?? toClaimSubPhase(null)
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
                      <Td>
                        <span className="font-medium text-claimondo-navy">{MAIN_PHASE_LABEL[mainPhase]}</span>
                        <span className="block text-[11px] text-claimondo-ondo">{SUBPHASE_LABEL[subPhase]}</span>
                      </Td>
                      <Td>
                        <FallStatusBadge status={f.status as string | null} size="md" />
                      </Td>
                      <Td className="font-mono text-[12px]">
                        {(fKf?.mandatsnummer as string | null) ?? '—'}
                      </Td>
                      <Td className="!text-claimondo-ondo text-xs">
                        {formatDate((f.created_at as string | null) ?? null)}
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
