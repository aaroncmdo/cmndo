/**
 * Zuordnungs-Sicherheit 0..100 nach F-15:
 *   90+    Firmenname im Impressum woertlich und PLZ stimmt
 *   70-89  Firmenname sinngemaess oder nur der Ort stimmt
 *   <70    nur Namensaehnlichkeit
 *
 * Unter 70 wird der Fund geschrieben, aber in der Vertriebsliste als unsicher
 * markiert (sv_leads.website_sicherheit, Kommentar an der Spalte).
 */
export function websiteSicherheit(a: {
  firmaImText: boolean
  plzImText: boolean
  ortImText: boolean
  kernImHost: boolean
}): number {
  // Die Gewichte sind so gesetzt, dass die drei Baender der Spec entstehen:
  //   Kern + Ort                = 70  -> "nur der Ort stimmt"
  //   Kern + Firmenname + PLZ   = 90  -> "woertlich und PLZ stimmt"
  //   Kern allein               = 40  -> blosse Namensaehnlichkeit
  let s = 0
  if (a.kernImHost) s += 40     // die Domain enthaelt den Kernbegriff
  if (a.firmaImText) s += 30    // der Firmenname steht woertlich im Impressum
  if (a.ortImText) s += 30      // der Ort des Leads steht im Impressum
  if (a.plzImText) s += 20      // die PLZ des Leads steht im Impressum
  return Math.min(100, s)
}

/** Rollenadressen sind zulaessig, tragen aber hoechstens 60 (F-16, T-25). */
export function emailSicherheit(istRollenadresse: boolean, website: number): number {
  return istRollenadresse ? Math.min(60, website) : website
}
