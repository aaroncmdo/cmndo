// Werkstatt-Onboarding-Drip — reine Step-Advance-Logik (DB-frei, testbar).
// Anker der Sequenz ist die Enroll-Zeit (enrollment.erstellt_am); Offsets sind ABSOLUT
// dagegen (driftfrei: "Tag 6" bleibt Tag 6, auch wenn ein frueherer Step verspaetet ging).

export type StepLite = { position: number; offset_tage: number; aktiv: boolean }

const TAG_MS = 24 * 60 * 60 * 1000

/** Naechster AKTIVER Step nach `aktuellerStep` (ueberspringt aktiv=false, z.B. Bonus). */
export function naechsterAktiverStep<T extends StepLite>(steps: T[], aktuellerStep: number): T | null {
  return steps.filter((s) => s.aktiv && s.position > aktuellerStep).sort((a, b) => a.position - b.position)[0] ?? null
}

/** next_send_at = Anker (Enroll-Zeit) + offset_tage. */
export function berechneNextSendAt(ankerAm: Date, step: StepLite): Date {
  return new Date(ankerAm.getTime() + step.offset_tage * TAG_MS)
}
