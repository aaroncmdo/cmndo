import { computeProvisionUst } from './partner-billing-ust'

export type KorrekturBetraege = {
  nettoCent: number
  ustSatz: number | null
  ustBetragCent: number | null
  bruttoCent: number
}

/**
 * Bestimmt die Ziel-Beträge einer Gutschrift-Korrektur.
 *
 * Default = Recompute aus aktuellem Ledger-Netto + Partner-USt-Status (computeProvisionUst).
 * Override (Admin) auf `nettoCent` und/oder `ustSatz`; `ustBetrag` + `brutto` werden IMMER
 * daraus abgeleitet, damit `brutto = netto + ust_betrag` konsistent bleibt (kein inkonsistenter
 * §14c-Beleg). Alles in Cent (Integer) gerechnet.
 */
export function computeKorrekturBetraege(input: {
  currentNettoEur: number
  istKleinunternehmer: boolean | null
  override?: { nettoCent?: number; ustSatz?: number }
}): { ok: true; betraege: KorrekturBetraege } | { ok: false; error: string } {
  const def = computeProvisionUst(input.currentNettoEur, input.istKleinunternehmer)

  const nettoCent = input.override?.nettoCent ?? Math.round(input.currentNettoEur * 100)
  if (!Number.isFinite(nettoCent) || nettoCent < 0) {
    return { ok: false, error: 'Ungültiger Netto-Betrag' }
  }

  const ustSatz = input.override?.ustSatz ?? def.ustSatz
  if (ustSatz === null || ustSatz === undefined) {
    return {
      ok: false,
      error: 'USt-Status des Partners unbekannt — Steuerdaten erfassen oder USt-Satz manuell setzen.',
    }
  }

  const ustBetragCent = Math.round((nettoCent * ustSatz) / 100)
  const bruttoCent = nettoCent + ustBetragCent
  return { ok: true, betraege: { nettoCent, ustSatz, ustBetragCent, bruttoCent } }
}
