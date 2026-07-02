// AAR-kanzlei-portal PR 3 / CMM-44 MP-4d: Kanban nach den 4 Hauptphasen
// (Erfassung · Begutachtung · Regulierung · Abschluss).
//
// Datenquelle: faelle (RLS auf service_typ='komplett' + rolle='kanzlei').
// Jede Karte zeigt: Fallnr, Kunde, Kennzeichen, Mandat-Nr, letzte Änderung
// und ein 3-Punkte-Menü mit Quick-Actions (Kanzlei-Paket herunterladen +
// Dokumente öffnen). Read-only — kein Drag-and-Drop.
//
// Phasen-Zuordnung: main_phase/sub_phase kommen aus v_claim_phase (claims-
// zentrische View, MP-8b-Invariante: claims.id != faelle.id; Lookup ueber
// claim_id aus dem claims-Embed). Kein status→Phase-Fallback mehr — der Helper
// getClaimPhaseMap castet View-Werte zu ClaimMainPhase/ClaimSubPhase enums.

import { createClient } from '@/lib/supabase/server'
import KanbanBoardClient, { type KanbanKarte } from './KanbanBoardClient'
import PageHeader from '@/components/shared/PageHeader'
import { getClaimPhaseMap } from '@/lib/claims/claim-phase-map'
// CMM-44 MP-4d: 4-Phasen-Modell (v_claim_phase) statt der 10-Phasen-Ziffer.
import { toClaimMainPhase, toClaimSubPhase } from '@/lib/claims/lifecycle'

export default async function KanzleiKanbanPage() {
  const supabase = await createClient()
  // CMM-44 MP-4d: Hauptphase kommt aus v_claim_phase (s.u.), nicht mehr aus
  // claims.phase — daher kein phase-Feld mehr im claims-Embed (DROP in MP-6c).
  // CMM-44 SP-B PR2a: service_typ lebt auf claims (SSoT) — Filter via
  // claims!inner-Join statt faelle-seitigem .eq().
  // CMM-65: faelle.updated_at stirbt mit dem Phase-6-Drop; claims.updated_at ist durch
  // CMM-44-SP-Backfills geclobbert (0 Ordering-Signal). Aaron-Entscheidung: nach
  // claims.created_at sortieren + anzeigen (immer vorhanden). supabase-js kann nicht nach
  // eingebetteter to-one-Spalte ordnen -> flachziehen + clientseitig created_at-desc.
  // CMM-49 (faelle-Drop-Runway): Anker von .from('faelle') auf claims-zentrisch (Bridge+vcf).
  // 1) RLS-Scope: faelle_claim_bridge-RLS (Definer-Gate claim_sichtbar_fuer_aktuellen_user, #3445)
  //    grantet kanzlei bereits NUR komplett-Claims. KEIN claims-Inner-Join fuer den komplett-Filter:
  //    claims ist fuer kanzlei nicht SELECT-bar -> !inner wuerde alles wegfiltern -> Empty-State.
  //    Filter lebt in Schritt 2 auf v_claim_full (kanzlei-lesbar via Gate).
  const { data: scopeRows, error: scopeErr } = await supabase
    .from('faelle_claim_bridge')
    .select('claim_id')
  const scopedClaimIds = (scopeRows ?? []).map((r) => r.claim_id as string)
  // 2) Display via v_claim_full (DEFINER; nur fuer die autorisierten claim_ids -> leak-safe; div=0).
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
  const kartenClaimIds = faelle
    .map((f) => f.id)
    .filter((x): x is string => !!x)
  const phaseMap = await getClaimPhaseMap(kartenClaimIds)

  const karten: KanbanKarte[] = (faelle ?? []).map((f) => {
    // CMM-49: vcf flach — id/Link via fall_id (== faelle.id); phaseMap claim_id-keyed (= vcf.id).
    const fallId = f.fall_id ?? f.id
    return {
    id: fallId,
    claim_nummer: f.claim_nummer ?? fallId.slice(0, 8),
    kunde:
      [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—',
    kennzeichen: f.kennzeichen ?? null,
    mandatsnummer: f.mandatsnummer ?? null,
    status: f.operative_status ?? null,
    // CMM-49: phaseMap ist claim_id-keyed (= vcf.id).
    mainPhase: phaseMap.get(f.id)?.mainPhase ?? toClaimMainPhase(null),
    subPhase: phaseMap.get(f.id)?.subPhase ?? toClaimSubPhase(null),
    created_at: f.created_at ?? null,
    }
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description="Alle Komplett-Mandate nach den 4 Hauptphasen (Erfassung · Begutachtung · Regulierung · Abschluss). Read-only — die Phase ergibt sich automatisch aus dem Fall-Fortschritt."
        size="lg"
      />
      {error && (
        <div className="rounded-ios-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger-strong">
          Fehler beim Laden: {error.message}
        </div>
      )}
      <KanbanBoardClient karten={karten} />
    </div>
  )
}
