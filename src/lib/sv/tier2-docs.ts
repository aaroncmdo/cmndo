// Tier-2-Nachweise (Berufshaftpflicht + Gewerbeanmeldung).
//
// Geschichte in drei Entscheidungen:
//   08.08.2026 „Option B": Freischaltung ohne geprüfte Nachweise → 14-Tage-Frist →
//     `frist_ueberschritten` → Fall-Empfang pausiert (Spec 2026-08-08-tier2-dokumente-enforcement).
//   31.08.2026: `verifiziert` (das kundensichtbare Siegel) nur noch nach Doc-Prüfung.
//   19.09.2026 (Aaron): BEIDES zurückgenommen — „ich möchte nicht mehr verifizieren und ich
//     möchte auch nicht mehr nachhalten müssen, ob die Dokumente fehlen oder nicht … Damit
//     soll er wirklich verifiziert und buchbar sein." Die Freischaltung läuft über EINEN
//     Patch (src/lib/sv/freischaltung.ts), die Frist wird nirgends mehr gesetzt, der Cron
//     `verifizierung-reminder` ist ein No-op, der Dispatch-Filter kennt den Status nicht mehr.
//
// Was hier bleibt: die Slot-Liste und der Anti-Bypass-Guard für den OPTIONALEN Admin-Knopf
// „Tier-2 als geprüft markieren" (informativ — er öffnet und schließt nichts mehr).
export const TIER2_SLOTS = ['sv_berufshaftpflicht', 'sv_gewerbeanmeldung'] as const

/**
 * Guard für tier2Freigeben (Admin-„geprüft"-Knopf): erst markieren, wenn beide Tier-2-Slots
 * mindestens hochgeladen sind — sonst behauptet die Akte eine Prüfung ohne Dokument.
 */
export function tier2FreigabeErlaubt(
  docs: Array<{ dokument_typ: string; status: string }>,
): boolean {
  const vorhanden = new Set(
    docs
      .filter((d) => d.status === 'hochgeladen' || d.status === 'geprueft')
      .map((d) => d.dokument_typ),
  )
  return TIER2_SLOTS.every((slot) => vorhanden.has(slot))
}
