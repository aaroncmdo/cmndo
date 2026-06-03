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
  // claim_id-keyed (MP-8b: claims.id != faelle.id). Frueher: ids=faelle.id-Bug.
  const kartenClaimIds = faelle
    .map((f) => f.claim_id)
    .filter((x): x is string => !!x)
  const phaseMap = await getClaimPhaseMap(kartenClaimIds)

  const karten: KanbanKarte[] = (faelle ?? []).map((f) => {
    // CMM-44 SP-I2: claim_nummer aus dem claims-Embed (Array|Objekt normalisieren).
    const fClaim = Array.isArray(f.claims) ? f.claims[0] : f.claims
    // CMM-44 SP-I2: mandatsnummer aus kanzlei_faelle (1:1 via fall_id), Array|Objekt normalisieren.
    const fKf = Array.isArray(f.kanzlei_faelle) ? f.kanzlei_faelle[0] : f.kanzlei_faelle
    return {
    id: f.id as string,
    claim_nummer: (fClaim?.claim_nummer as string | null) ?? f.id.slice(0, 8),
    kunde:
      [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—',
    kennzeichen: (f.kennzeichen as string | null) ?? null,
    mandatsnummer: (fKf?.mandatsnummer as string | null) ?? null,
    status: (f.status as string | null) ?? null,
    // CMM-44 MP-8c: phaseMap ist claim_id-keyed (claims.id != faelle.id).
    mainPhase: (f.claim_id ? phaseMap.get(f.claim_id)?.mainPhase : undefined) ?? toClaimMainPhase(null),
    subPhase: (f.claim_id ? phaseMap.get(f.claim_id)?.subPhase : undefined) ?? toClaimSubPhase(null),
    created_at: (f.created_at as string | null) ?? null,
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
        <div className="rounded-ios-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fehler beim Laden: {error.message}
        </div>
      )}
      <KanbanBoardClient karten={karten} />
    </div>
  )
}
