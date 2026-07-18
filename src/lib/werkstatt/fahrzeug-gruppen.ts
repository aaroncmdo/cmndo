// Kanonische Fahrzeug-Gruppen für die Werkstatt-Datenpflege (werkstaetten.fahrzeug_gruppen) —
// eine Ranking-Achse (Fahrzeug-Gruppe) neben Marke + Gewerke. Geteilt zwischen der Admin-Action
// (Validierung) und dem Editor-UI (Chips), damit es EINE Wahrheit gibt. Reiner Const, kein Server-Code.

export const FAHRZEUG_GRUPPEN = [
  { value: 'pkw', label: 'PKW' },
  { value: 'transporter', label: 'Transporter' },
  { value: 'lkw', label: 'LKW' },
  { value: 'wohnmobil', label: 'Wohnmobil' },
  { value: 'motorrad', label: 'Motorrad' },
] as const

export const FAHRZEUG_GRUPPEN_VALUES = FAHRZEUG_GRUPPEN.map((g) => g.value)
