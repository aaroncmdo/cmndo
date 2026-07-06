// AAR (06.07. Cron-Hunt): Reminder-Stufe nach Fall-Alter — mit NACHHOL-Fenstern.
//
// Frueher nutzten sa-reminder/vollmacht-reminder feste halb-offene Fenster
// (isDay1 = ageDays >= 1 && < 2; isDay3 = >= 3 && < 4). Faellt ein taeglicher
// Cron-Lauf aus oder laeuft er verspaetet, springt `ageDays` ueber ein Fenster
// -> die Stufe wird DAUERHAFT uebersprungen (der Idempotenz-Marker verhindert nur
// Doppel-Sends, holt aber nichts nach). Ergebnis: Kunde erhaelt die 2. Erinnerung nie.
//
// Fix: offene, kontiguierliche Untergrenzen — Stufe 1 ab Tag 1 (bis Stufe-2-Faelligkeit),
// Stufe 2 ab `stufe2AbTag` (bis Stufe-3), Stufe 3 ab `stufe3AbTag` (offen). Der bestehende
// Timeline-Idempotenz-Check im Cron verhindert weiterhin Doppel-Sends; ein verpasstes
// Fenster wird beim naechsten Lauf mit der jeweils AKTUELLEN Stufe nachgeholt.
export type ReminderStufe = 'stufe1' | 'stufe2' | 'stufe3' | null

export function reminderStufeNachAlter(
  ageDays: number,
  stufe2AbTag: number,
  stufe3AbTag: number,
): ReminderStufe {
  if (ageDays >= stufe3AbTag) return 'stufe3'
  if (ageDays >= stufe2AbTag) return 'stufe2'
  if (ageDays >= 1) return 'stufe1'
  return null
}
