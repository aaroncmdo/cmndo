// src/lib/ops/claim-workflow-meta.test.ts
import { describe, it, expect } from 'vitest'
import { CLAIM_WORKFLOW_META, CLAIM_SLA_DAYS } from './claim-workflow-meta'
import { ALL_CLAIM_SUB_PHASES } from '@/lib/claims/lifecycle'

describe('claimWorkflowMeta', () => {
  it('deckt jede ClaimSubPhase ab', () => {
    for (const sp of ALL_CLAIM_SUB_PHASES) expect(CLAIM_WORKFLOW_META[sp]).toBeDefined()
  })
  it('erfassung-Phasen warten auf den Kunden', () => {
    for (const sp of ['sa_offen', 'vollmacht_offen', 'onboarding_offen'] as const)
      expect(CLAIM_WORKFLOW_META[sp].waitingOn).toBe('kunde')
  })
  it('SLA-Schwellen sind positive Tage', () => {
    for (const v of Object.values(CLAIM_SLA_DAYS)) expect(v).toBeGreaterThan(0)
  })
})
