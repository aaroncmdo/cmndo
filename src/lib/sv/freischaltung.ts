// Freischaltung eines Sachverständigen — EIN Patch für ALLE Eingänge.
//
// Aaron 19.09.2026: „ich möchte nicht mehr verifizieren und ich möchte auch nicht mehr
// nachhalten müssen, ob die Dokumente fehlen oder nicht … Damit soll er dann aber auch
// freigeschaltet sein … Damit soll er wirklich verifiziert und buchbar sein."
//
// Vorher setzte jede Freischalt-Stelle ihre eigene Feldliste (Stripe-Webhook ×3, Gutschein-
// pfad, Sub-Mitarbeiter, Basic-Auto-Freigabe, Admin-Nachhol-Weg) — zwei davon starteten
// zusätzlich die 14-Tage-Tier-2-Frist (Option B vom 08.08.), die Basic-Freigabe setzte
// `verifiziert` nur nach geprüften Dokumenten. Ergebnis auf prod (19.09.): 14 von 27
// freigeschalteten Gutachtern ohne Siegel, 3 per Fristablauf aus der Engine gesperrt.
//
// Ab jetzt heißt „freigeschaltet" an jeder Stelle dasselbe: Portal offen, aktiv, Siegel.
// Dokumente (Berufshaftpflicht, Gewerbeanmeldung, Sicherungsabtretung/Honorarvereinbarung,
// Datenschutzerklärung, Widerrufsbelehrung) sind Zubehör für den Kundenflow — hochladbar
// im Onboarding und jederzeit im Portal, nie Bedingung.
//
// Bewusst NICHT hier: `onboarding_status`, `anzahlung_status`, Werbebudget — die sind
// pfadspezifisch (bezahlt vs. Basic) und bleiben beim Aufrufer.

export type FreischaltungsPatch = {
  portal_zugang_freigeschaltet: true
  ist_aktiv: true
  verifiziert: true
  verifiziert_am: string
}

/**
 * @param jetztIso Zeitstempel der Freischaltung.
 * @param opts.verifiziertAmBestehend Bereits gesetzter Zeitstempel — wird NICHT überschrieben,
 *   damit ein erneuter Lauf (Admin klickt „Profil freischalten" ein zweites Mal) das Datum
 *   des ersten Siegels nicht verfälscht.
 */
export function freischaltungsPatch(
  jetztIso: string,
  opts?: { verifiziertAmBestehend?: string | null },
): FreischaltungsPatch {
  return {
    portal_zugang_freigeschaltet: true,
    ist_aktiv: true,
    verifiziert: true,
    verifiziert_am: opts?.verifiziertAmBestehend ?? jetztIso,
  }
}
