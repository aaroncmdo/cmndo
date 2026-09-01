// Kanonische Test-Konto-Erkennung per Email. Vorlage: src/lib/start-link/pick-dispatcher.ts:35
// (dessen lokale Regex ist ein spaeterer Boy-Scout-Kandidat fuer diesen Util).
const TEST_EMAIL_RE = /test|smoke|@claimondo\.test/i

export function istTestEmail(email: string | null | undefined): boolean {
  return !!email && TEST_EMAIL_RE.test(email)
}

// Kanonische Test-PARTNER-Erkennung per Name ODER Email — Wort-Grenze `\b(test|smoke|demo)\b`
// gegen False-Positives wie "Contest"/"latest"/"MaxTest" (bewusst strikter als das
// substring-basierte istTestEmail). Deckt Firma/Name UND Email ab, weil Test-Partner
// "Test"/"Smoke" i.d.R. im Namen tragen ("Test Firmna", "SMOKE Werkstatt (Test)").
// Spiegelt die money-integrity-Variante (Session 6f60c510, PR #4041) — hierher ins geteilte
// testdaten-Modul gezogen; deren lokale Kopie ist ein Boy-Scout-Konvergenz-Kandidat.
const TEST_PARTNER_RE = /\b(test|smoke|demo)\b/i

export function istTestPartner(
  name: string | null | undefined,
  email: string | null | undefined,
): boolean {
  return TEST_PARTNER_RE.test(name ?? '') || TEST_PARTNER_RE.test(email ?? '')
}

// ⭐ Dritte, STRIKTESTE Stufe: nur von der IETF reservierte Domains (RFC 2606 / RFC 6761).
// Diese kann niemand registrieren -- ein Treffer ist damit BEWIESEN, nicht geraten.
//
// Warum drei Stufen und nicht eine: die Richtung des Schadens unterscheidet sich.
//   • istTestEmail (Substring, breit)  -> Comms-Unterdrueckung. Ein False-Positive ist
//     harmlos (eine Mail geht nicht raus); ein False-NEGATIVE schickt einem echten Kunden
//     eine Testnachricht. Breit ist dort richtig.
//   • istTestPartner (Wortgrenze)      -> Partner-/Finder-Sichtbarkeit. Mittelweg.
//   • istReservierteTestDomain (hier)  -> Entscheidungen, bei denen ein False-Positive
//     einen ECHTEN Fall VERSTECKEN wuerde: Listen-Filter, Kennzahlen, claims.ist_testfall.
//     Hier waere `MaxTest@web.de` oder `contest@firma.de` als "Testfall" fatal -- der
//     Schadensfall verschwaende aus der operativen Liste und niemand merkte es.
//     (Genau dieser Schaden ist am 31.08. real geworden: fuenf Kundenfaelle lagen
//     33-45 Tage unberuehrt, weil sie in der Menge nicht mehr auffielen.)
//
// Abgedeckt: @*.test (die Smoke-Konvention aus Regel 4), @*.example, @*.invalid,
// @*.localhost sowie die Second-Level-Reservierungen @example.com/.net/.org.
//
// ⭐ Gegen ECHTE prod-Daten geprueft (31.08., 73 Leads mit Email) -- nicht nur gegen die
// eigene Erwartung im Unit-Test:
//   • strikt (diese Funktion):  11 Treffer
//   • breit  (istTestEmail):    26 Treffer
//   • Differenz von 15:         10x @claimondo.de (INTERNE Tests, 8 ohne Telefon)
//                                5x @gmail.com    (ECHTE Kunden, 0 ohne Telefon -- deren
//                                                  Adresse enthaelt nur zufaellig
//                                                  "test"/"smoke")
// Die 5 Gmail-Leads sind der Beweis, dass der breite Filter hier realen Schaden anrichten
// wuerde: fuenf echte Schadensfaelle waeren als Testdaten aus den Listen gefallen.
//
// ⚠ BEWUSSTE LUECKE -- @claimondo.de wird NICHT automatisch markiert. Die Firmen-Domain
// bedeutet "intern", nicht "Test": ein Mitarbeiter mit echtem Unfall haette einen echten
// Fall darunter. Interne Testfaelle werden deshalb explizit markiert (Seed setzt
// ist_testfall direkt), nicht per Heuristik erraten.
const RESERVIERTE_TEST_DOMAIN_RE =
  /@(?:[a-z0-9-]+\.)*(?:test|example|invalid|localhost)$|@example\.(?:com|net|org)$/i

/**
 * Beweisbare Test-Adresse: die Domain ist per RFC reserviert und nicht registrierbar.
 * Nutzen fuer Markierungen/Filter, bei denen ein False-Positive echte Daten verbergen wuerde.
 */
export function istReservierteTestDomain(email: string | null | undefined): boolean {
  const wert = email?.trim()
  return !!wert && RESERVIERTE_TEST_DOMAIN_RE.test(wert)
}
