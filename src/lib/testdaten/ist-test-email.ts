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
