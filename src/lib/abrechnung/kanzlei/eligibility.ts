// Kanzlei-Abrechnung — Eligibility-Ableitung (server-import-frei, damit unit-testbar).
//
// Belebt den toten Abrechnungs-Prereq (Kanzlei-Strecke-Investigation 28.06.):
// Der Monats-Cron (erstelle-abrechnung.ts) filterte bisher auf claims.kanzlei_provision_status
// = 'berechtigt' — ein Flag, das KEIN Code je setzt (live: 89/89 = 'offen'). Zusaetzlich
// hing er an vollmacht_status='unterschrieben' (live: 0/89) und einem vollmacht_signiert_am-
// Monatsfenster (passt nie zum spaeten Zahlungseingang). Ergebnis: 0 Abrechnungen je.
//
// Aaron-Entscheid 28.06.: Provision wird mit dem ZAHLUNGSEINGANG faellig. Wir leiten die
// Berechtigung daher aus LIVE-Signalen ab statt aus toten Flags:
//   - kanzlei_faelle.mandatsnummer gesetzt  -> echtes Kanzlei-Mandat erteilt
//   - claim_payments.zahlungseingang_am set -> Zahlung eingegangen (Provision faellig)
//   - kanzlei_abrechnung_id IS NULL         -> noch nicht abgerechnet (Idempotenz)
//   - kanzlei_faelle.kanzlei_id == Kanzlei  -> dieser Kanzlei zugeordnet

export type AbrechnungsKanzleiFall = {
  fall_id: string | null
  kanzlei_id: string | null
  mandatsnummer: string | null
}

export type AbrechnungsClaimPayment = {
  zahlungseingang_am: string | null
  status?: string | null
}

export type AbrechnungsClaim = {
  id: string
  claim_nummer: string | null
  vollmacht_signiert_am: string | null
  kanzlei_abrechnung_id: string | null
  kanzlei_honorar: number | null
  kanzlei_faelle: AbrechnungsKanzleiFall | AbrechnungsKanzleiFall[] | null
  claim_payments: AbrechnungsClaimPayment | AbrechnungsClaimPayment[] | null
}

/** Nested-FK normalisieren (supabase liefert je nach Cardinality Objekt ODER Array). */
function asArray<T>(x: T | T[] | null | undefined): T[] {
  if (x == null) return []
  return Array.isArray(x) ? x : [x]
}

export function kanzleiFallVon(claim: AbrechnungsClaim): AbrechnungsKanzleiFall | null {
  return asArray(claim.kanzlei_faelle)[0] ?? null
}

/** Hat der Claim mindestens eine eingegangene Zahlung? */
export function hatZahlungseingang(claim: AbrechnungsClaim): boolean {
  return asArray(claim.claim_payments).some((p) => p?.zahlungseingang_am != null)
}

/**
 * Ist dieser Claim fuer die gegebene Kanzlei abrechenbar?
 * Live-Signal-basiert (mandatsnummer + Zahlungseingang), kein totes Flag.
 */
export function istAbrechenbarerKanzleiClaim(claim: AbrechnungsClaim, kanzleiId: string): boolean {
  const kf = kanzleiFallVon(claim)
  if (!kf || kf.kanzlei_id !== kanzleiId) return false
  if (!kf.mandatsnummer) return false
  if (claim.kanzlei_abrechnung_id != null) return false
  if (!hatZahlungseingang(claim)) return false
  return true
}
