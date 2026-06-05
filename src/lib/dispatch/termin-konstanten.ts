// AAR-718: Zentrale Konstanten für Termin-Dauer + Kalender-Puffer.
// Vorher waren beide Werte an mehreren Stellen hart-kodiert bzw. implizit.

/**
 * Standard-Dauer eines Claimondo-Besichtigungstermins in Minuten.
 * Der Dispatcher rechnet mit diesem Wert, wenn er prüft ob ein SV einen
 * privaten Konflikt hat — ein Termin ist nicht 2 Stunden lang, das ist
 * realistisch für den Besichtigungs-Vor-Ort-Termin.
 */
export const TERMIN_DAUER_MIN = 40

/**
 * Fixer Mindest-Puffer/Floor vor und nach einem Claimondo-Termin (Parken, zur Tür,
 * Aufräumen) + das Fenster um PRIVATE Kalender-Events (Standort unbekannt → keine ETA).
 * Die ECHTE Fahrtzeit zwischen Claimondo-Terminen macht die Mapbox-ETA-Reachability
 * (reachability.ts) — NICHT dieser pauschale Blanket. Daher 10 statt der alten 60
 * (die doppelte die ETA und über-blockte den Kalender massiv).
 */
export const TERMIN_PUFFER_MIN = 10

/**
 * Sicherheits-/Wrap-Marge ON TOP der echten Fahr-ETA zwischen zwei Claimondo-Terminen.
 * Eine Quelle — vorher je lokal in reachability.ts + findBestSV.ts dupliziert (war 5).
 */
export const ETA_SICHERHEITS_PUFFER_MIN = 10

/**
 * ETA-Annahme wenn der Standort eines Nachbar-Termins NICHT auflösbar ist (keine
 * Coords, kein Lead-Fallback, nicht geocodebar). Konservativ statt fail-open: 50 min
 * Fahrt + 10 Puffer = 60 min Lücke nötig. Mapbox-API-Ausfall bei BEKANNTEM Standort
 * bleibt fail-open (transient, blockt nicht das Geschäft).
 */
export const NO_LOCATION_ETA_MIN = 50

/**
 * Hilfsfunktion: Wunschtermin (ISO) → [window_start, window_end] als ISOs.
 * Fenster = [terminStart - puffer, terminStart + dauer + puffer].
 */
export function berechneBlockadeFenster(
  terminIso: string,
  dauerMin: number = TERMIN_DAUER_MIN,
  pufferMin: number = TERMIN_PUFFER_MIN,
): { start: string; end: string } | null {
  const start = new Date(terminIso)
  if (Number.isNaN(start.getTime())) return null
  const windowStart = new Date(start.getTime() - pufferMin * 60_000)
  const windowEnd = new Date(start.getTime() + (dauerMin + pufferMin) * 60_000)
  return { start: windowStart.toISOString(), end: windowEnd.toISOString() }
}

/**
 * Hilfsfunktion: Nächster Werktag (Mo–Fr) 10:00 lokaler Zeit ab jetzt.
 * Verwendet als impliziter Check-Zeitpunkt wenn der Dispatcher ohne
 * Wunschtermin ein Matching startet — so kann der Kalender-Check trotzdem
 * gegen eine realistische Zeit gemacht werden.
 */
export function naechsterWerktag10Uhr(): string {
  const d = new Date()
  d.setHours(10, 0, 0, 0)
  // Wenn wir heute nach 10:00 Uhr sind, nehme morgen.
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1)
  }
  // Samstag (6) → Montag, Sonntag (0) → Montag.
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1)
  }
  return d.toISOString()
}
