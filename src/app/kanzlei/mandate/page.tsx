// AAR-kanzlei-portal Dashboard — Mandat-Liste aller komplett-Fälle.
//
// RLS filtert serverseitig (Migration 20260421151144): Kanzlei-User sieht
// nur Fälle mit service_typ='komplett'. Read-only — keine Edit-Actions
// in diesem Portal.
//
// Spalten (laut Feedback Aaron 21.04.2026):
//   Fall-Nr · Kunde · Aktuelle Phase · Letzte Änderung · Mandatsnummer · Status
//
// Read-only Liste — keine Detail-Navigation. Das /kanzlei/fall/[id]-Portal wurde
// bewusst NICHT gebaut (In-House-Modell, keine Kanzlei-Login-Detailseite — siehe
// Kanzlei-Strecke-Investigation 28.06.). Zeilen sind daher nicht klickbar; sonst
// liefen alle Klicks ins 404.

import { createClient } from '@/lib/supabase/server'
import { FolderOpenIcon } from 'lucide-react'
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
  // CMM-49 (faelle-Drop-Runway): Anker von .from('faelle') auf claims-zentrisch (Bridge+vcf).
  // 1) RLS-Scope: welche Claims sieht diese Kanzlei? faelle_claim_bridge-RLS (Definer-Gate
  //    claim_sichtbar_fuer_aktuellen_user, #3445) grantet kanzlei bereits NUR komplett-Claims.
  //    Der komplett-Filter darf NICHT via claims-Inner-Join laufen: claims ist fuer kanzlei
  //    nicht SELECT-bar -> !inner wuerde ALLE Zeilen wegfiltern -> Empty-State trotz #3445.
  //    Filter lebt daher in Schritt 2 auf v_claim_full (kanzlei-lesbar via Gate).
  const { data: scopeRows, error: scopeErr } = await supabase
    .from('faelle_claim_bridge')
    .select('claim_id')
  const scopedClaimIds = (scopeRows ?? []).map((r) => r.claim_id as string)
  // 2) Display via v_claim_full (DEFINER loest kunde_vorname/kennzeichen/mandatsnummer flach;
  //    NUR fuer die bridge-RLS-autorisierten claim_ids -> leak-safe; div=0 vs faelle).
  type KanzleiVcfRow = {
    id: string; fall_id: string | null; claim_nummer: string | null
    kunde_vorname: string | null; kunde_nachname: string | null; kennzeichen: string | null
    operative_status: string | null; created_at: string | null; mandatsnummer: string | null
  }
  const { data: vcfRaw, error: vcfErr } = scopedClaimIds.length
    ? await supabase
        .from('v_claim_full')
        .select('id, fall_id, claim_nummer, kunde_vorname, kunde_nachname, kennzeichen, operative_status, created_at, mandatsnummer')
        .in('id', scopedClaimIds)
        .eq('service_typ', 'komplett')
    : { data: [], error: null }
  const error = scopeErr ?? vcfErr
  const faelle = ((vcfRaw ?? []) as unknown as KanzleiVcfRow[])
    .slice()
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))

  // CMM-44 MP-8c: Phasen via getClaimPhaseMap — claim_id-keyed (= vcf.id).
  const mandatClaimIds = faelle
    .map((f) => f.id)
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
        <div className="rounded-ios-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-strong">
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
                </Tr>
              </Thead>
              <Tbody className="!divide-y-0">
                {faelle.map((f) => {
                  const kunde = [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—'
                  // CMM-49: vcf flach — phaseMap claim_id-keyed (= vcf.id); Link/Key via fall_id (== faelle.id).
                  const ph = phaseMap.get(f.id)
                  const mainPhase = ph?.mainPhase ?? toClaimMainPhase(null)
                  const subPhase = ph?.subPhase ?? toClaimSubPhase(null)
                  const fallId = f.fall_id ?? f.id
                  return (
                    <Tr
                      key={fallId}
                      className="border-t border-claimondo-border hover:bg-claimondo-bg transition-colors"
                    >
                      <Td className="font-mono text-[12px]">
                        {f.claim_nummer ?? fallId.slice(0, 8)}
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
                        <FallStatusBadge status={f.operative_status} size="md" />
                      </Td>
                      <Td className="font-mono text-[12px]">
                        {f.mandatsnummer ?? '—'}
                      </Td>
                      <Td className="!text-claimondo-ondo text-xs">
                        {formatDate(f.created_at)}
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
