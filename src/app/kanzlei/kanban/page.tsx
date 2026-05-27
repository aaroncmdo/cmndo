// AAR-kanzlei-portal PR 3: Kanban nach den 10 großen Fall-Phasen
// (PHASE_META aus src/lib/fall/subphase-visibility.ts).
//
// Datenquelle: faelle (RLS auf service_typ='komplett' + rolle='kanzlei').
// Jede Karte zeigt: Fallnr, Kunde, Kennzeichen, Mandat-Nr, letzte Änderung
// und ein 3-Punkte-Menü mit Quick-Actions (Kanzlei-Paket herunterladen +
// Dokumente öffnen). Read-only — kein Drag-and-Drop.
//
// Phasen-Zuordnung: aktuelle_phase ist snake_case ("3_gutachten_qc").
// Wir extrahieren die erste Ziffer als Gruppierungs-Key. Wenn aktuelle_phase
// fehlt (alter Lead), fallen wir auf status → Phase-Mapping zurück.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import KanbanBoardClient, { type KanbanKarte } from './KanbanBoardClient'
import PageHeader from '@/components/shared/PageHeader'
// CMM-44 MP-4d: 4-Phasen-Modell (v_claim_phase) statt der 10-Phasen-Ziffer.
import { toClaimMainPhase, toClaimSubPhase } from '@/lib/claims/lifecycle'

export default async function KanzleiKanbanPage() {
  const supabase = await createClient()
  // CMM-44 SP-A2 (Cluster 3): aktuelle_phase → claims.phase (SSoT) via Embed.
  // CMM-44 SP-B PR2a: service_typ lebt auf claims (SSoT) — Filter via
  // claims!inner-Join statt faelle-seitigem .eq().
  // CMM-65: faelle.updated_at stirbt mit dem Phase-6-Drop; claims.updated_at ist durch
  // CMM-44-SP-Backfills geclobbert (0 Ordering-Signal). Aaron-Entscheidung: nach
  // claims.created_at sortieren + anzeigen (immer vorhanden). supabase-js kann nicht nach
  // eingebetteter to-one-Spalte ordnen -> flachziehen + clientseitig created_at-desc.
  const { data: faelleRaw, error } = await supabase
    .from('faelle')
    .select(
      'id, status, kunde_vorname, kunde_nachname, kennzeichen, kanzlei_faelle(mandatsnummer), claims:claim_id!inner(phase, claim_nummer, service_typ, created_at)',
    )
    .eq('claims.service_typ', 'komplett')
  const faelle = (faelleRaw ?? [])
    .map((f) => {
      const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
      return { ...f, created_at: (c?.created_at as string | null) ?? null }
    })
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))

  // CMM-44 MP-4d: v_claim_phase (main_phase/sub_phase) via Service-Client für die
  // bereits RLS-gefilterten Mandat-IDs. v_claim_phase ist security_invoker; die
  // Kanzlei-RLS auf auftraege/leads wäre lückenhaft → Service-Read der EIGENEN
  // (ohnehin sichtbaren) komplett-Mandate, kein Leak.
  const admin = createAdminClient()
  const ids = faelle.map((f) => f.id as string)
  type PhaseRow = { claim_id: string; main_phase: string | null; sub_phase: string | null }
  const { data: phaseRows } = ids.length
    ? await admin.from('v_claim_phase').select('claim_id, main_phase, sub_phase').in('claim_id', ids)
    : { data: [] as PhaseRow[] }
  const phaseMap = new Map(((phaseRows ?? []) as PhaseRow[]).map((p) => [p.claim_id, p]))

  const karten: KanbanKarte[] = (faelle ?? []).map((f) => {
    // CMM-44 SP-A2 (Cluster 3): claims.phase via Embed (Array|Objekt normalisieren).
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
    // CMM-44 MP-4d: abgeleitete 4-Phase + Substate (Guards casten View-String sicher).
    mainPhase: toClaimMainPhase(phaseMap.get(f.id as string)?.main_phase),
    subPhase: toClaimSubPhase(phaseMap.get(f.id as string)?.sub_phase),
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
