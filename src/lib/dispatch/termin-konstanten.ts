// AAR-718: Zentrale Konstanten für Termin-Dauer + Kalender-Puffer.
// Vorher waren beide Werte an mehreren Stellen hart-kodiert bzw. implizit.

/**
 * Standard-Dauer eines Claimondo-Besichtigungstermins in Minuten.
 * Der Dispatcher rechnet mit diesem Wert, wenn er prüft ob ein SV einen
 * privaten Konflikt hat — ein Termin ist nicht 2 Stunden lang, das ist
 * realistisch für den Besichtigungs-Vor-Ort-Termin.
 */
export const TERMIN_DAUER_MIN = 45

/**
 * Pflicht-Puffer vor und nach einem Claimondo-Termin. Der SV braucht Zeit
 * zum Hinfahren und eventuell Wegfahren — und der Standort des privaten
 * Termins ist uns unbekannt. Deshalb ±60 min strikt.
 *
 * Das gesperrte Fenster um einen Claimondo-Termin mit Start 10:00 ist
 * also: 09:00 – 11:45 (60 min davor + 45 min Termin + 60 min danach).
 */
export const TERMIN_PUFFER_MIN = 60

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
