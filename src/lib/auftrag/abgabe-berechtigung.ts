// Ownership-Gate fuer gutachtenAbgeben (CMM-32 SV-Abgabe).
//
// Reine Logik (server-import-frei). Seit dem Filmcheck-Audit 29.06.2026 setzt
// gutachtenAbgeben das gutachten-Signal + triggert checkFallAutoPhase (Phasen-
// Advance) -> die Action wird maechtiger und darf nicht mehr von jedem
// authentifizierten User aufrufbar sein. Erlaubt: der SV DIESES Auftrags + admin/KB.

export function kannGutachtenAbgeben(p: {
  rolle: string | null | undefined
  eigeneSvId: string | null | undefined
  auftragSvId: string | null | undefined
}): boolean {
  if (p.rolle === 'admin' || p.rolle === 'kundenbetreuer') return true
  if (p.rolle === 'sachverstaendiger') {
    return !!p.eigeneSvId && p.eigeneSvId === p.auftragSvId
  }
  return false
}
