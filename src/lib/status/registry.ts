// src/lib/status/registry.ts
import type { DomainName, StatusDef } from './types'
import { FALL_STATUS_DEFS } from './domains/fall-status'
import { FALL_PHASE_DEFS } from './domains/fall-phase'
import { CLAIM_MAIN_PHASE_DEFS } from './domains/claim-main-phase'
import { CLAIMS_STATUS_DEFS } from './domains/claims-status'
import { LEAD_WORKFLOW_DEFS } from './domains/lead-workflow'
import { VERTRIEB_WORKFLOW_DEFS } from './domains/vertrieb-workflow'
import { COLD_MAIL_DEFS } from './domains/cold-mail'
import { PARTNER_AKTIVITAET_DEFS } from './domains/partner-aktivitaet'
import { TASK_PRIORITAET_DEFS } from './domains/task-prioritaet'
import { NETZWERK_ABO_DEFS } from './domains/netzwerk-abo'

export const DOMAINS: Record<DomainName, Record<string, StatusDef>> = {
  'fall-status': FALL_STATUS_DEFS,
  'fall-phase': FALL_PHASE_DEFS,
  'claim-main-phase': CLAIM_MAIN_PHASE_DEFS,
  'claims-status': CLAIMS_STATUS_DEFS,
  'lead-workflow': LEAD_WORKFLOW_DEFS,
  'vertrieb-workflow': VERTRIEB_WORKFLOW_DEFS,
  'cold-mail': COLD_MAIL_DEFS,
  'partner-aktivitaet': PARTNER_AKTIVITAET_DEFS,
  'task-prioritaet': TASK_PRIORITAET_DEFS,
  'netzwerk-abo': NETZWERK_ABO_DEFS,
}
