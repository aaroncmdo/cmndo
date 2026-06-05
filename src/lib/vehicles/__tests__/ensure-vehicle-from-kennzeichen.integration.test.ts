import { describe, it, expect, beforeAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { ensureVehicleFromKennzeichen } from '@/lib/vehicles/ensure-vehicle-from-kennzeichen'

// GEGATET (s. ensure-firma.integration.test.ts): createClient erst in beforeAll.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!URL && !!KEY
const d = RUN ? describe : describe.skip

d('ensureVehicleFromKennzeichen (DB)', () => {
  let db: SupabaseClient
  beforeAll(() => {
    db = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  })
  it('create-then-find-same (provisorisch, FIN-los)', async () => {
    const kz = `B-XX ${Date.now() % 9999}`
    const a = await ensureVehicleFromKennzeichen({ db, kennzeichen: kz })
    const b = await ensureVehicleFromKennzeichen({ db, kennzeichen: kz.toLowerCase().replace('-', ' - ') })
    expect(a.ok && b.ok && b.vehicleId).toBe(a.ok ? a.vehicleId : '')
    expect(b.ok && b.created).toBe(false)
    if (a.ok) await db.from('vehicles').delete().eq('id', a.vehicleId)
  })
})
