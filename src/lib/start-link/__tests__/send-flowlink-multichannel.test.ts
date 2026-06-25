import { describe, it, expect, vi, beforeEach } from 'vitest'

// ensureCanonicalFlowLinkForLead + Email-Send gemockt (keine echten Sends).
vi.mock('@/lib/start-link/ensure-flowlink-for-lead', () => ({
  ensureCanonicalFlowLinkForLead: vi.fn(async () => ({ ok: true, token: 'tok-1' })),
}))
vi.mock('@/lib/start-link/persist-flowlink-versand', () => ({ persistFlowLinkVersand: vi.fn(async () => {}) }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/email/google/flows', () => ({
  sendFlowLinkVersand: vi.fn(async () => ({ success: true })),
  sendMiniWizardMagicLink: vi.fn(async () => ({ success: true })),
}))

import { sendFlowLinkMultiChannelCore } from '../send-flowlink-multichannel'

// Mini queue-Builder (idiom: convert-lead-to-claim.test.ts)
let q: Array<{ data: unknown; error?: unknown }> = []
const updateCalls: unknown[] = []
function next() { return q.shift() ?? { data: null, error: null } }
function makeBuilder() {
  const h: Record<string, unknown> = {}
  h.select = () => h; h.eq = () => h; h.or = () => h; h.in = () => h; h.order = () => h; h.limit = () => h
  h.single = () => Promise.resolve(next())
  h.maybeSingle = () => Promise.resolve(next())
  h.then = (res: (v: unknown) => unknown) => Promise.resolve(next()).then(res)
  return h
}
const db = {
  from: () => ({
    select: () => makeBuilder(),
    update: (p: unknown) => { updateCalls.push(p); return makeBuilder() },
    insert: () => makeBuilder(),
  }),
} as never

beforeEach(() => { q = []; updateCalls.length = 0; vi.clearAllMocks() })

describe('sendFlowLinkMultiChannelCore', () => {
  it('gibt "Lead nicht gefunden" wenn der injizierte db keinen Lead liefert', async () => {
    q = [{ data: null }] // lead .single()
    const r = await sendFlowLinkMultiChannelCore(db, 'lead-x', 'email', 'kb-1')
    expect(r.success).toBe(false)
    expect(r.error).toBe('Lead nicht gefunden')
  })

  it('Email-Happy-Path: success:true + Lead-Status-Advance mit actorId', async () => {
    q = [
      { data: { id: 'lead-1', vorname: 'Max', nachname: 'M', telefon: null, email: 'a@b.de', service_typ: 'komplett', sprache: 'de' } }, // lead
      { data: null },                 // gutachter_termine maybeSingle (kein Termin)
      { data: { zugewiesen_an: null } }, // currentLead
      { data: null, error: null },    // leads update terminal
      { data: null, error: null },    // timeline insert terminal
    ]
    const r = await sendFlowLinkMultiChannelCore(db, 'lead-1', 'email', 'kb-1')
    expect(r.success).toBe(true)
    expect(r.token).toBe('tok-1')
    expect(updateCalls.at(-1)).toMatchObject({ status: 'flow-gesendet', zugewiesen_an: 'kb-1' })
  })
})
