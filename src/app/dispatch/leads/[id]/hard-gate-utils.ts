// AAR-80: Dispatch Schritt 0 Hard Gate — Helpers (pure functions, kein 'use server')

export type HardGateStatus = {
  q1Complete: boolean // Hergang + (Aufklaerung falls unklar)
  q2Complete: boolean // Schaden-Frage beantwortet
  q3Complete: boolean // Haftpflicht-Check
  allComplete: boolean
  disqualifiziert: boolean
}

export function computeHardGateStatus(lead: {
  unfallhergang?: string | null
  schuldfrage?: string | null
  aufklaerung_teilschuld_bestaetigt?: boolean | null
  schaden_sichtbar?: boolean | null
  personenschaden_flag?: boolean | null
  hat_haftpflicht?: boolean | null
  qualifizierungs_phase?: string | null
}): HardGateStatus {
  const q1Complete = !!lead.unfallhergang && !!lead.schuldfrage &&
    (lead.schuldfrage !== 'unklar' || lead.aufklaerung_teilschuld_bestaetigt === true)
  const q2Complete = lead.schaden_sichtbar !== null && lead.schaden_sichtbar !== undefined
  const q3Complete = lead.hat_haftpflicht !== null && lead.hat_haftpflicht !== undefined
  const disqualifiziert = lead.qualifizierungs_phase === 'disqualifiziert'
  return {
    q1Complete, q2Complete, q3Complete,
    allComplete: q1Complete && q2Complete && q3Complete && !disqualifiziert,
    disqualifiziert,
  }
}
