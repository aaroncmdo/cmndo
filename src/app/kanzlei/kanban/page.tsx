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
  // Welle-7 Sub-Phase-Strings (aus map_claim_phase_to_faelle_phase)
  if (['vollzahlung_eingegangen', 'ablehnung_kanzlei_prueft', 'klage_eingereicht', 'kanzlei_fallakte_angelegt', 'fall_akzeptiert_storniert'].includes(aktuellePhase)) return 9
  if (['warten_auf_vs', 'vs_kontakt_laeuft'].includes(aktuellePhase)) return 6
  if (['qc_bestanden'].includes(aktuellePhase)) return 4
  if (['gutachten_erstellt', 'gutachten_wird_erstellt'].includes(aktuellePhase)) return 3
  if (['sv_unterwegs', 'sv_vor_ort', 'begutachtung_abgeschlossen'].includes(aktuellePhase)) return 2
  if (['termin_bestaetigt', 'fallakte_angelegt', 'fallakte_wird_angelegt'].includes(aktuellePhase)) return 1
  // Welle-6 Legacy-Format mit führender Zahl (z.B. "3_gutachten_qc")
  const m = aktuellePhase.match(/^(\d{1,2})/)
  if (m) {
    const n = parseInt(m[1], 10)
    // Phase 7+8+10 wurden in AAR-839 entfernt → abrunden auf 6 bzw. 9
    if (n === 7 || n === 8) return 6
    if (n === 10) return 9
    return n
  }
  return null
}

function phaseFromStatus(status: string | null | undefined): number {
  if (!status) return 1
  // Welle-7 Werte
  if (['reguliert', 'abgelehnt', 'kanzlei'].includes(status)) return 9
  if (status === 'vs_kontakt') return 6
  if (['in_bearbeitung', 'onboarding'].includes(status)) return 1
  // Welle-6 Werte (Backward-Compat)
  if (['abgeschlossen', 'zahlung-eingegangen'].includes(status)) return 9
  if (['regulierung', 'regulierung-laeuft'].includes(status)) return 9
  if (['anschlussschreiben'].includes(status)) return 5
  if (status === 'kanzlei-uebergeben') return 4
  if (status === 'qc-pruefung' || status === 'filmcheck') return 3
  if (status === 'gutachten-eingegangen') return 3
  if (['begutachtung-laeuft', 'besichtigung', 'sv-termin'].includes(status)) return 2
  return 1
}

export default async function KanzleiKanbanPage() {
  const supabase = await createClient()
  // CMM-44 SP-A2 (Cluster 3): aktuelle_phase → claims.phase (SSoT) via Embed.
  const { data: faelle, error } = await supabase
    .from('faelle')
    .select(
      'id, status, mandatsnummer, kunde_vorname, kunde_nachname, kennzeichen, updated_at, created_at, claims:claim_id(phase, claim_nummer)',
    )
    .eq('service_typ', 'komplett')
    .order('updated_at', { ascending: false })
    .limit(300)

  const karten: KanbanKarte[] = (faelle ?? []).map((f) => {
    // CMM-44 SP-A2 (Cluster 3): claims.phase via Embed (Array|Objekt normalisieren).
    const fClaim = Array.isArray(f.claims) ? f.claims[0] : f.claims
    return {
    id: f.id as string,
    claim_nummer: (fClaim?.claim_nummer as string | null) ?? f.id.slice(0, 8),
    kunde:
      [f.kunde_vorname, f.kunde_nachname].filter(Boolean).join(' ') || '—',
    kennzeichen: (f.kennzeichen as string | null) ?? null,
    mandatsnummer: (f.mandatsnummer as string | null) ?? null,
    status: (f.status as string | null) ?? null,
    phase:
      phaseFromAktuellePhase((fClaim?.phase as string | null) ?? null) ??
      phaseFromStatus(f.status as string | null),
    updated_at: (f.updated_at as string | null) ?? (f.created_at as string | null),
    }
  })

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        description="Alle Komplett-Mandate nach den 10 Fall-Phasen. Read-only — Karten verschieben sich automatisch, sobald Claimondo den Fall-Status aktualisiert."
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
