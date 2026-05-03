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
import KanbanBoardClient, { type KanbanKarte } from './KanbanBoardClient'
import PageHeader from '@/components/shared/PageHeader'

function phaseFromAktuellePhase(aktuellePhase: string | null | undefined): number | null {
  if (!aktuellePhase) return null
  const m = aktuellePhase.match(/^(\d{1,2})/)
  return m ? parseInt(m[1], 10) : null
}

function phaseFromStatus(status: string | null | undefined): number {
  // Fallback-Mapping wenn aktuelle_phase nicht gesetzt ist.
  // Reihenfolge wichtig — longestMatch-First.
  if (!status) return 1
  if (['abgeschlossen', 'zahlung-eingegangen'].includes(status)) return 10
  if (['regulierung', 'regulierung-laeuft'].includes(status)) return 9
  if (status === 'nachbesichtigung-laeuft') return 8
  if (['vs-abgelehnt', 'klage'].includes(status)) return 7
  if (['vs-kuerzt', 'anschlussschreiben'].includes(status)) return 6
  if (status === 'kanzlei-uebergeben') return 5
  if (status === 'qc-pruefung' || status === 'filmcheck') return 4
  if (status === 'gutachten-eingegangen') return 3
  if (['begutachtung-laeuft', 'besichtigung', 'sv-termin'].includes(status)) return 2
  return 1
}

export default async function KanzleiKanbanPage() {
  const supabase = await createClient()
  const { data: faelle, error } = await supabase
    .from('faelle')
    .select(
      'id, fall_nummer, status, aktuelle_phase, mandatsnummer, kunde_vorname, kunde_nachname, kennzeichen, updated_at, created_at',
    )
    .eq('service_typ', 'komplett')
    .order('updated_at', { ascending: false })
    .limit(300)

  const karten: KanbanKarte[] = (faelle ?? []).map((f) => ({
    id: f.id as string,
    fall_nummer: (f.fall_nummer as string | null) ?? f.id.slice(0, 8),
    kunde:
      [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—',
    kennzeichen: (f.kennzeichen as string | null) ?? null,
    mandatsnummer: (f.mandatsnummer as string | null) ?? null,
    status: (f.status as string | null) ?? null,
    phase:
      phaseFromAktuellePhase(f.aktuelle_phase as string | null) ??
      phaseFromStatus(f.status as string | null),
    updated_at: (f.updated_at as string | null) ?? (f.created_at as string | null),
  }))

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description="Alle Komplett-Mandate nach den 10 Fall-Phasen. Read-only — Karten verschieben sich automatisch, sobald Claimondo den Fall-Status aktualisiert."
        size="lg"
      />
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          Fehler beim Laden: {error.message}
        </div>
      )}
      <KanbanBoardClient karten={karten} />
    </div>
  )
}
