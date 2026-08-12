// Ops-Test 12.08. (I1): Haenger-Detektor — findet Claims, die stehengeblieben sind.
//
// ANLASS: CLM-2026-01011 hing 14 Tage unbemerkt ohne Termin. Die Erhebung dazu ergab,
// dass das kein Einzelfall ist: 14 potenziell echte Claims standen 7-27 Tage ohne jede
// Bewegung. Ein Automatismus, der so etwas meldet, existierte nicht.
//
// WARUM NICHT DER SLA-TRACKER: `checkAndEscalateBreaches` (lib/sla/tracker) ist rein
// REAKTIV — er prueft nur Faelle, fuer die vorher jemand eine `sla_tracking`-Zeile
// angelegt hat. 9 der 14 Haenger hatten gar keine. Der Cron arbeitet korrekt
// (0 ueberfaellige pending), er sieht diese Faelle schlicht nie. Dieser Detektor sucht
// dagegen AKTIV ueber den Claim-Bestand.
//
// DEDUP IST PFLICHT, NICHT KUER: Am selben Tag wurde ein Claim mit 226 identischen
// offenen Tasks gefunden (Smoke-Residue, siehe Migration 20260812145105). Ein Cron, der
// taeglich ungeprueft Tasks anlegt, baut denselben Berg — deshalb legt der Consumer pro
// Claim nur an, wenn kein offener Task desselben task_code existiert.

import { istTestPartner } from '@/lib/finance/money-integrity-checks'

/** Aaron-Entscheid 12.08.: 5 Tage. Bei dieser Schwelle traf die Erhebung 14 echte Faelle. */
export const HAENGER_SCHWELLE_TAGE = 5

/** Task-Code = zugleich der Dedup-Schluessel (pro Claim nur ein offener Task). */
export const HAENGER_TASK_CODE = 'haenger-pruefen'

/**
 * Status, in denen ein Claim NICHT mehr handlungspflichtig ist. `abgelehnt` gehoert
 * bewusst dazu: ein abgelehnter Fall wartet nicht auf uns.
 */
const NICHT_HANDLUNGSPFLICHTIG: ReadonlySet<string> = new Set([
  'abgeschlossen',
  'storniert',
  'archiviert',
  'abgelehnt',
])

export type HaengerPruefung = {
  /**
   * Seit wann steht der Fall im AKTUELLEN Status? Also der letzte `phase_transitions`-
   * Eintrag mit `to_phase = operative_status` — sonst der Anlagezeitpunkt.
   *
   * Bewusst NICHT "letzte Transition irgendwohin": Der Anlassfall CLM-2026-01011 hatte
   * am 08.08. einen Uebergang ersterfassung -> sv-zugewiesen, stand aber danach wieder
   * auf `ersterfassung` (sv_id NULL). Nach der naiven Lesart haette er sich vor 4 Tagen
   * "bewegt" und waere durchgerutscht — tatsaechlich stand er seit 14 Tagen still.
   * Ein Statuswechsel, der zurueckfaellt, ist keine Bewegung.
   *
   * Messung 12.08.: die naive Variante fand 14 Faelle, diese hier 15 — der Unterschied
   * ist genau der Fall, der den Auftrag ausgeloest hat. Keine False Positives.
   */
  imStatusSeit: string | Date
  /** Existiert ein aktiver Termin (reserviert/bestaetigt/verlegt/verlegung_pending)? */
  hatAktivenTermin: boolean
  operativeStatus: string | null
  /** Gesetzt = Fall ist abgeschlossen, egal was operative_status sagt. */
  abgeschlossenAm: string | Date | null
  /** Name des Geschaedigten — fuer die Test-/Smoke-Heuristik. */
  kundeName: string | null
  kundeEmail: string | null
}

/**
 * PURE Entscheidung: Ist dieser Claim ein Haenger?
 *
 * Ein Haenger ist ein Fall, der (a) noch handlungspflichtig ist, (b) keinen aktiven
 * Termin hat und (c) laenger als die Schwelle keine Statusbewegung mehr zeigte.
 *
 * Ein aktiver Termin zaehlt ausdruecklich als Bewegung: ein Fall mit Termin in zwei
 * Wochen haengt nicht, er wartet planmaessig.
 *
 * Test-/Smoke-Accounts werden ausgefiltert — sonst meldet der Detektor taeglich die
 * Fixtures der E2E-Laeufe und wird selbst zum Rauschen (genau der Fehler, der die
 * Task-Liste vorher unbrauchbar gemacht hat).
 */
export function istHaenger(
  p: HaengerPruefung,
  jetzt: Date,
  schwelleTage: number = HAENGER_SCHWELLE_TAGE,
): boolean {
  if (p.abgeschlossenAm) return false
  if (p.operativeStatus && NICHT_HANDLUNGSPFLICHTIG.has(p.operativeStatus)) return false
  if (p.hatAktivenTermin) return false
  if (istTestPartner(p.kundeName, p.kundeEmail)) return false

  const seit = new Date(p.imStatusSeit)
  if (Number.isNaN(seit.getTime())) return false

  const grenze = new Date(jetzt.getTime() - schwelleTage * 24 * 60 * 60_000)
  return seit < grenze
}

/**
 * PURE: Wie lange steht der Fall schon im aktuellen Status? Ganze Tage, fuer den
 * Task-Text. Negative Werte (Zukunfts-Zeitstempel) werden auf 0 geklemmt.
 */
export function tageImStatus(imStatusSeit: string | Date, jetzt: Date): number {
  const seit = new Date(imStatusSeit)
  if (Number.isNaN(seit.getTime())) return 0
  const tage = Math.floor((jetzt.getTime() - seit.getTime()) / (24 * 60 * 60_000))
  return Math.max(0, tage)
}

/**
 * PURE: Seit wann steht der Claim in seinem AKTUELLEN Status?
 *
 * Nimmt den juengsten `phase_transitions`-Eintrag, dessen `to_phase` dem aktuellen
 * `operative_status` entspricht. Gibt es keinen, gilt der Anlagezeitpunkt — der Fall
 * war nie woanders (oder ist dorthin zurueckgefallen, ohne dass es protokolliert wurde).
 *
 * Genau hier liegt der Unterschied, der den Anlassfall rettet: CLM-2026-01011 hatte eine
 * Transition ersterfassung -> sv-zugewiesen, stand aber wieder auf `ersterfassung`. Die
 * juengste Transition ist also 4 Tage alt, der Fall steht aber seit 14 Tagen still.
 */
export function ermittleImStatusSeit(
  transitions: ReadonlyArray<{ to_phase: string | null; created_at: string | null }>,
  operativeStatus: string | null,
  createdAt: string,
): string {
  let neueste: string | null = null
  for (const t of transitions) {
    if (!t.created_at) continue
    // NULL-Status: nur ein Uebergang nach NULL zaehlt — sonst gilt die Anlage.
    if ((t.to_phase ?? null) !== (operativeStatus ?? null)) continue
    if (!neueste || t.created_at > neueste) neueste = t.created_at
  }
  return neueste ?? createdAt
}

/** PURE: Task-Text. Getrennt von der DB, damit der Wortlaut testbar bleibt. */
export function baueHaengerTaskText(input: {
  claimNummer: string | null
  operativeStatus: string | null
  tage: number
}): { titel: string; beschreibung: string } {
  const nr = input.claimNummer ?? 'Fall'
  const status = input.operativeStatus ?? 'ohne Status'
  return {
    titel: `${nr} steht seit ${input.tage} Tagen still`,
    beschreibung:
      `Dieser Fall hat seit ${input.tage} Tagen keine Statusbewegung und keinen aktiven Termin ` +
      `(aktueller Stand: ${status}).\n\n` +
      `Bitte prüfen, woran es hängt, und den nächsten Schritt auslösen — oder den Fall abschließen, ` +
      `falls er erledigt ist.`,
  }
}
