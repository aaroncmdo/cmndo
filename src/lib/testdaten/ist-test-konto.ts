// Ops-Test 12.08.: Erkennt Test-/Smoke-/Demo-KONTEN (profiles) an Name oder E-Mail.
//
// WARUM NICHT `ist_testaccount`: Das kanonische DB-Flag existiert nur auf
// `sachverstaendige`, nicht auf `profiles`. Fuer Personen-Konten bleibt die Heuristik
// der einzige Weg — bis das Flag auf profiles nachgezogen wird.
//
// ABGRENZUNG zu `istTestPartner` (lib/finance/money-integrity-checks): dieselbe Idee,
// aber engerer Zweck (Finance-Monitor auf Partner-Firmen) und ohne 'bkat'. Diese Funktion
// hier deckt Personen-Konten ab und kennt zusaetzlich das `bkat-smoke-*`-Muster der
// Smoke-Enrollment-Konten. Bewusst getrennt gehalten: der Finance-Monitor soll sich nicht
// aendern, wenn hier ein Muster dazukommt.
//
// ANLASS: Das Task-Auto-Assign verteilte Round-Robin an ALLE aktiven Profile einer Rolle.
// Bei `dispatch` waren 4 von 5 aktiven Konten Test-/Smoke-Konten — 29 von 61 offenen Tasks
// (48 %) lagen damit in Postfaechern, die niemand ansieht. Haengende Faelle blieben liegen,
// OBWOHL sie offene Tasks hatten.

/**
 * Wort-Heuristik auf Name + E-Mail. Word-Boundary (`\b`) verhindert Fehltreffer wie
 * „Contest" (enthaelt „test") oder „Demonstration".
 *
 * `bkat` steht fuer die generierten Smoke-Enrollment-Konten (`bkat-smoke-dispatch-<ts>@`)
 * und wird bewusst ohne Wortgrenze am Ende geprueft, weil dort ein Bindestrich folgt.
 */
export function istTestKonto(name: string | null, email: string | null): boolean {
  const haystack = `${name ?? ''} ${email ?? ''}`
  return /\b(test|smoke|demo|bkat)\b/i.test(haystack) || /\bbkat-/i.test(haystack)
}
