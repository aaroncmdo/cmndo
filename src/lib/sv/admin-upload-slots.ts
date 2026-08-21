import { TIER2_SLOTS } from './tier2-docs'

/**
 * Dokument-Slots, die ein Admin in der SV-Akte selbst hochladen darf
 * (`uploadAdminPflichtdokument`).
 *
 * Zwei Gruppen:
 *  1. **Claimondo-Vertragsdokumente** (AAR-359 W6) — Sicherungsabtretung, Honorar,
 *     Datenschutz, Widerruf. Die stellt Claimondo selbst aus, der Admin hat sie ohnehin.
 *  2. **Tier-2-Nachweise** (Berufshaftpflicht, Gewerbeanmeldung) — kamen historisch nur
 *     vom SV. Aufgenommen 20.08.: alle 9 aktiven echten SVs hatten 0 Zeilen in beiden
 *     Slots, obwohl die Nachweise vorlagen — nur eben ausserhalb des Systems. Ohne
 *     Admin-Upload waere der einzige Weg eine Nachforderungs-Mail an Partner, die
 *     laengst geliefert haben.
 *
 * ⚠ **Kein Bypass des Tier-2-Gates:** die Datei muss real hochgeladen werden,
 * `quelle:'admin'` haelt die Herkunft fuer die Revision fest, und `tier2FreigabeErlaubt`
 * prueft weiterhin, dass beide Slots belegt sind.
 *
 * Diese Liste steht bewusst NICHT in `verifizierung-actions.ts`: aus einem
 * `'use server'`-File duerfen keine Konstanten exportiert werden (AGENTS.md
 * §Server-Actions — das Client-Bundle macht `undefined` daraus), und ohne Export
 * ist sie nicht testbar.
 */
export const ADMIN_UPLOADBARE_SLOTS = [
  'sv_sicherungsabtretung',
  'sv_honorarvereinbarung',
  'sv_datenschutzerklaerung',
  'sv_widerrufsbelehrung',
  ...TIER2_SLOTS,
] as const

export type AdminUploadbarerSlot = (typeof ADMIN_UPLOADBARE_SLOTS)[number]

export function istAdminUploadbar(slotId: string): boolean {
  return (ADMIN_UPLOADBARE_SLOTS as readonly string[]).includes(slotId)
}
