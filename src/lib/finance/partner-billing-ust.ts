/** USt auf Partner-Provisionen (Auszahlung). Kleinunternehmer (§19) -> keine USt. */
export function computeProvisionUst(
  nettoEur: number,
  istKleinunternehmer: boolean | null,
): { ustSatz: number | null; ustBetrag: number | null; brutto: number | null; bekannt: boolean } {
  if (istKleinunternehmer === null || istKleinunternehmer === undefined) {
    return { ustSatz: null, ustBetrag: null, brutto: null, bekannt: false }
  }
  const ustSatz = istKleinunternehmer ? 0 : 19
  const round2 = (n: number) => Math.round(n * 100) / 100
  const ustBetrag = round2((nettoEur * ustSatz) / 100)
  const brutto = round2(nettoEur + ustBetrag)
  return { ustSatz, ustBetrag, brutto, bekannt: true }
}
