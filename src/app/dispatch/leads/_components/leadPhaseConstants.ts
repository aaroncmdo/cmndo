// AAR-179 Follow-up: Shared Phase-Konstanten, damit page.tsx und
// LeadsViewToggle dieselbe Quelle der Wahrheit nutzen (vorher Duplikation).

export const PHASE_OPTIONS = [
  { value: '', label: 'Alle' },
  { value: 'neu', label: 'Neu' },
  { value: 'rueckruf', label: 'Rückruf' },
  { value: 'in-qualifizierung', label: 'In Qualifizierung' },
  { value: 'flow-versendet', label: 'Flow gesendet' },
  { value: 'sa-ausstehend', label: 'SA ausstehend' },
  { value: 'nicht-erreicht', label: 'Nicht erreicht' },
  { value: 'kalt', label: 'Kalt' },
  { value: 'disqualifiziert', label: 'Disqualifiziert' },
  { value: 'konvertiert', label: 'Konvertiert' },
] as const

export const PHASE_BADGES: Record<string, string> = {
  'neu': 'bg-claimondo-bg text-claimondo-ondo',
  'nicht-erreicht': 'bg-claimondo-bg text-claimondo-ondo',
  'rueckruf': 'bg-amber-100 text-amber-700',
  'in-qualifizierung': 'bg-violet-100 text-violet-700',
  'flow-versendet': 'bg-emerald-100 text-emerald-700',
  'sa-ausstehend': 'bg-cyan-100 text-cyan-700',
  'konvertiert': 'bg-green-100 text-green-800',
  'disqualifiziert': 'bg-red-100 text-red-700',
  'kalt': 'bg-claimondo-border text-claimondo-ondo',
}

export const PHASE_LABELS: Record<string, string> = Object.fromEntries(
  PHASE_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
)

// AAR-179 Follow-up: Kanban-Reihenfolge MUSS alle Status-Codes abdecken die
// in `leads.qualifizierungs_phase` vorkommen können — sonst fallen Leads in
// 'neu' als Default-Spalte (Bug).
export const KANBAN_PHASEN = [
  'neu',
  'rueckruf',
  'nicht-erreicht',
  'in-qualifizierung',
  'flow-versendet',
  'sa-ausstehend',
  'kalt',
  'konvertiert',
  'disqualifiziert',
] as const
