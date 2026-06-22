// Pure helper — Task 10 (AAR-956): Werkstatt-Ort-Resolver.
// Keine Seiteneffekte; unit-testbar ohne React.

type Ort = { adresse: string; lat: number; lng: number }

/**
 * Bestimmt den Besichtigungsort basierend auf der Werkstatt-Frage.
 *
 * 'ja'   → werkstattGeo  (das Fahrzeug steht noch bei der Werkstatt)
 * 'nein' → eingabe        (der Nutzer gibt einen eigenen Ort an)
 */
export function resolveWerkstattOrt(
  antwort: 'ja' | 'nein',
  werkstattGeo: Ort,
  eingabe: Ort | null,
): Ort | null {
  if (antwort === 'ja') return werkstattGeo
  return eingabe
}
