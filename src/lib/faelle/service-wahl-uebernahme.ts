// P4-Smoke-Befund 31.07. (PR #4897-Kommentar): der sign-into-existing-Pfad liess den
// Vermittlungs-Claim auf den Anlage-Defaults (komplett/partnerkanzlei) stehen, obwohl der
// Kunde im SA-Step "Nur Gutachten" gewaehlt hatte -> LexDrive-Pipeline fuer nur_gutachter-
// Kunden. Diese pure Ableitung ist die Mapping-PARITAET zu convertLeadToClaim (dort inline):
// service_typ = lead-Wahl ?? 'komplett'; kanzlei_wunsch: komplett -> 'partnerkanzlei',
// sonst 'nicht_gefragt' (keine Claimondo-Kanzlei; der Kunde reguliert selbst).

export function leiteServiceUebernahmeAb(
  leadServiceTyp: string | null | undefined,
): { service_typ: string; kanzlei_wunsch: string } {
  const serviceTyp = leadServiceTyp ?? 'komplett'
  return {
    service_typ: serviceTyp,
    kanzlei_wunsch: serviceTyp === 'komplett' ? 'partnerkanzlei' : 'nicht_gefragt',
  }
}
