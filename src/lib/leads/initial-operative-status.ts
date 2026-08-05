// src/lib/leads/initial-operative-status.ts
// T2 (Spec 2026-08-05 §4.2): 3-stufiger Initial-Cursor beim Convert. 'sv-gesucht'
// (Bindestrich, claims-Cursor — NICHT der Termin-Status 'sv_gesucht') sagt ehrlich:
// Termin gewuenscht, echter SV steht noch aus. Direkt-INSERT bleibt der sanktionierte
// Initial-Pfad (Operative-Status-Write-Gate gatet nur .update).
export function initialOperativeStatus(i: {
  gutachtenBereitsErstellt: boolean
  svIdFromTermin: string | null
  hatOffenenTermin: boolean
}): 'gutachten-eingegangen' | 'sv-termin' | 'sv-gesucht' | 'ersterfassung' {
  if (i.gutachtenBereitsErstellt) return 'gutachten-eingegangen'
  if (i.svIdFromTermin) return 'sv-termin'
  if (i.hatOffenenTermin) return 'sv-gesucht'
  return 'ersterfassung'
}
