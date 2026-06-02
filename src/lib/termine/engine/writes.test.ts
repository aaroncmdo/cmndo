import { describe, it, expect } from 'vitest'
import { assigneeLegacyPatch } from './writes'

describe('assigneeLegacyPatch', () => {
  it('sachverstaendiger → sv_id', () => expect(assigneeLegacyPatch({ typ: 'sachverstaendiger', id: 'a' })).toEqual({ sv_id: 'a' }))
  it('sv_lead → sv_lead_id', () => expect(assigneeLegacyPatch({ typ: 'sv_lead', id: 'b' })).toEqual({ sv_lead_id: 'b' }))
  it('kundenbetreuer → kb_id', () => expect(assigneeLegacyPatch({ typ: 'kundenbetreuer', id: 'c' })).toEqual({ kb_id: 'c' }))
  it('kanzlei → {} (keine Legacy-Spalte)', () => expect(assigneeLegacyPatch({ typ: 'kanzlei', id: 'd' })).toEqual({}))
})
