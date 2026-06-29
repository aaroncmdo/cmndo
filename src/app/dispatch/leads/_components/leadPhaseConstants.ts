// AAR-179 Follow-up: Shared Phase-Konstanten, damit page.tsx und
// LeadsViewToggle dieselbe Quelle der Wahrheit nutzen (vorher Duplikation).

// Dashboard-Audit 29.06.: erstkontakt/gegner-daten/abgeschlossen waren Live-Phasen ohne Chip
// (123 Leads nicht filterbar + Roh-Slug-Anzeige in Feed/Liste). Ergaenzt in lifecycle-Reihenfolge.
export const PHASE_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'neu', label: 'Neu' },
  { value: 'erstkontakt', label: 'Erstkontakt' },
  { value: 'rueckruf', label: 'Rückruf' },
  { value: 'in-qualifizierung', label: 'In Qualifizierung' },
  { value: 'gegner-daten', label: 'Gegnerdaten' },
  { value: 'flow-versendet', label: 'Flow gesendet' },
  { value: 'sa-ausstehend', label: 'SA ausstehend' },
  { value: 'nicht-erreicht', label: 'Nicht erreicht' },
  { value: 'kalt', label: 'Kalt' },
  { value: 'disqualifiziert', label: 'Disqualifiziert' },
  { value: 'konvertiert', label: 'Konvertiert' },
  { value: 'abgeschlossen', label: 'Abgeschlossen' },
] as const

export const PHASE_BADGES: Record<string, string> = {
  'neu': 'bg-claimondo-bg text-claimondo-ondo',
  'nicht-erreicht': 'bg-claimondo-bg text-claimondo-ondo',
  'rueckruf': 'bg-warning-soft text-warning-strong',
  'in-qualifizierung': 'bg-claimondo-ondo/[0.10] text-claimondo-navy',
  'flow-versendet': 'bg-success-soft text-success-strong',
  'sa-ausstehend': 'bg-claimondo-light-blue/[0.20] text-claimondo-navy',
  'konvertiert': 'bg-success-soft text-success-strong',
  'disqualifiziert': 'bg-danger-soft text-danger-strong',
  'kalt': 'bg-claimondo-border text-claimondo-ondo',
  // Dashboard-Audit 29.06.: fehlende Live-Phasen
  'erstkontakt': 'bg-claimondo-ondo/[0.10] text-claimondo-navy',
  'gegner-daten': 'bg-claimondo-ondo/[0.10] text-claimondo-navy',
  'abgeschlossen': 'bg-claimondo-light-blue/[0.20] text-claimondo-navy',
}

export const PHASE_LABELS: Record<string, string> = Object.fromEntries(
  PHASE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
)

// AAR-179 Follow-up: Kanban-Reihenfolge MUSS alle Status-Codes abdecken die
// in `leads.qualifizierungs_phase` vorkommen können — sonst fallen Leads in
// 'neu' als Default-Spalte (Bug).
export const KANBAN_PHASEN = [
  'neu',
  'erstkontakt',
  'rueckruf',
  'nicht-erreicht',
  'in-qualifizierung',
  'gegner-daten',
  'flow-versendet',
  'sa-ausstehend',
  'kalt',
  'konvertiert',
  'abgeschlossen',
  'disqualifiziert',
] as const
