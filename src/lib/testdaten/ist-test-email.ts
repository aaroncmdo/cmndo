// Kanonische Test-Konto-Erkennung per Email. Vorlage: src/lib/start-link/pick-dispatcher.ts:35
// (dessen lokale Regex ist ein spaeterer Boy-Scout-Kandidat fuer diesen Util).
const TEST_EMAIL_RE = /test|smoke|@claimondo\.test/i

export function istTestEmail(email: string | null | undefined): boolean {
  return !!email && TEST_EMAIL_RE.test(email)
}
