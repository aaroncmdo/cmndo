// AI-Claim-Orchestrator — gemeinsame Typen (Phase-1-PoC).
export type ProposalTyp = 'task' | 'escalation' | 'next_step'
export type ZielRolle = 'sachverstaendiger' | 'kundenbetreuer' | 'admin'
export type TaskPrio = 'niedrig' | 'normal' | 'hoch'

/** Kompakter, prompt-tauglicher Fall-Kontext (aus buildClaimContext).
 *  Quellen sind Basis-Tabellen (service_role-lesbar), NICHT die auth-gated
 *  v_claim_*-Views — siehe Plan §Schema-Verifikation. */
export type ClaimContext = {
  claimId: string
  fallId: string | null
  status: string | null
  phase: string | null // aus claims.operative_status ?? claims.status
  letzteAktivitaetAm: string | null // ISO, aus timeline.created_at (Fallback claims.updated_at)
  tageInaktiv: number
  fahrzeug: string | null
  offeneTasks: Array<{ titel: string; rolle: string | null; faelligAm: string | null }>
  kurzverlauf: string[] // letzte Timeline-Titel, max 8
}

/** Ein vom Modell vorgeschlagener Schritt, vor Persistenz. */
export type ProposalDraft = {
  vorschlagTyp: ProposalTyp
  zielRolle: ZielRolle | null
  payload: Record<string, unknown> // z.B. { titel, beschreibung, prioritaet, faellig_in_tagen }
  begruendung: string
}

/** Persistierte Zeile (Subset fuer die UI). */
export type AiProposal = {
  id: string
  claim_id: string
  erstellt_am: string
  vorschlag_typ: ProposalTyp
  ziel_rolle: ZielRolle | null
  payload: Record<string, unknown>
  begruendung: string
  status: 'offen' | 'angenommen' | 'verworfen' | 'bearbeitet'
}
