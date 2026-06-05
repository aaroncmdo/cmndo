import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ensureFirma } from '@/lib/firmen/ensure-firma'

// GEGATET: laeuft NUR mit RUN_DB_INTEGRATION=1 + Service-Creds. createClient erst in
// beforeAll (sonst wuerde describe.skip die Factory bei der Collection ausfuehren und
// createClient(undefined) werfen) — Muster: confirm-orphan-match.integration.test.ts.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!URL && !!KEY
const d = RUN ? describe : describe.skip

d('ensureFirma (DB)', () => {
  let db: SupabaseClient
  beforeAll(() => {
    db = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  })
  it('create-then-find-same = ein Dedup ueber normalized_name', async () => {
    const name = `Testfirma ${Date.now()} GmbH`
    const a = await ensureFirma({ db, snapshot: { name } })
    expect(a.ok).toBe(true)
    // andere Schreibweise, gleiche normalized -> SELBE Zeile
    const b = await ensureFirma({ db, snapshot: { name: name.replace(' GmbH', '  gmbh') } })
    expect(b.ok && a.ok && b.firmaId).toBe(a.ok ? a.firmaId : '')
    expect(b.ok && b.created).toBe(false)
    if (a.ok) await db.from('firmen').delete().eq('id', a.firmaId)
  })
  it('ust_id matcht auch bei abweichendem Namen', async () => {
    const ust = `DE${Date.now()}`
    const a = await ensureFirma({ db, snapshot: { name: 'Alpha', ust_id: ust } })
    const b = await ensureFirma({ db, snapshot: { name: 'Alpha Logistik', ust_id: ust } })
    expect(a.ok && b.ok && b.firmaId).toBe(a.ok ? a.firmaId : '')
    if (a.ok) await db.from('firmen').delete().eq('id', a.firmaId)
  })
})
