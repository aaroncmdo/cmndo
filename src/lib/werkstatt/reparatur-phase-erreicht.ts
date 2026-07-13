// Reine Ableitung (client-safe): Ist die Reparatur-Phase erreicht, sodass dem Kunden
// die Werkstatt-Wahl / der Reparaturtermin angezeigt werden darf?
//  - Selbstzahler/Kasko: sofort (kein SV-Gutachten in der Strecke).
//  - Haftpflicht: erst NACH dem SV-Gutachten (abgeschlossen/freigegeben) und NUR ohne Totalschaden.

export interface ReparaturPhaseClaim {
  abrechnungsweg: string | null
}
export interface ReparaturPhaseGutachten {
  gutachtenAbgeschlossen: boolean
  totalschaden: boolean | null
}

export function reparaturPhaseErreicht(
  claim: ReparaturPhaseClaim,
  gutachten: ReparaturPhaseGutachten | null,
): boolean {
  if (claim.abrechnungsweg === 'selbstzahler' || claim.abrechnungsweg === 'kasko') return true
  if (claim.abrechnungsweg === 'haftpflicht') {
    return gutachten?.gutachtenAbgeschlossen === true && gutachten?.totalschaden !== true
  }
  return false
}
