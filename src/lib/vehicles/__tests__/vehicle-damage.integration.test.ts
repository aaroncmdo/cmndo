import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { recordVehicleDamage, markClaimDamagesAsVorschaden } from '@/lib/vehicles/vehicle-damage'

// GEGATET (s. ensure-firma.integration.test.ts): createClient erst in beforeAll.
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const RUN = process.env.RUN_DB_INTEGRATION === '1' && !!URL && !!KEY
const d = RUN ? describe : describe.skip

d('vehicle-damage (DB)', () => {
  let db: SupabaseClient
  let vehicleId = ''
  beforeAll(async () => {
    db = createClient(URL!, KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
    // vehicles.hersteller ist NOT NULL ohne Default -> Sentinel setzen (Konvention 'Unbekannt')
    const { data } = await db.from('vehicles')
      .insert({ kennzeichen_aktuell: `DMG-${Date.now()}`, hersteller: 'Unbekannt' })
      .select('id').single()
    vehicleId = data!.id as string
  })
  afterAll(async () => {
    if (!vehicleId) return
    await db.from('vehicle_vorschaeden').delete().eq('vehicle_id', vehicleId)
    await db.from('vehicles').delete().eq('id', vehicleId)
  })

  it('aktueller Schaden ist idempotent pro (vehicle, claim)', async () => {
    const a = await recordVehicleDamage({ db, damage: { vehicleId, state: 'aktuell', art: 'frontschaden' } })
    expect(a.ok).toBe(true)
    // ohne claim_id wird KEINE Idempotenz erzwungen -> 2. Aufruf legt 2. Row an (Historie)
    const b = await recordVehicleDamage({ db, damage: { vehicleId, state: 'vorschaden', art: 'heckschaden' } })
    expect(b.ok && a.ok && b.damageId).not.toBe(a.ok ? a.damageId : '')
  })

  it('importierte Historie ohne state -> vorschaden', async () => {
    const r = await recordVehicleDamage({ db, damage: { vehicleId, art: 'lack', quelle: 'cardentity' } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const { data } = await db.from('vehicle_vorschaeden').select('state').eq('id', r.damageId).single()
      expect(data!.state).toBe('vorschaden')
    }
  })

  it('markClaimDamagesAsVorschaden: aktuell -> vorschaden', async () => {
    // braucht eine echte claim_id: kleinster Weg = eine vorhandene lesen
    const { data: claim } = await db.from('claims').select('id').limit(1).single()
    const claimId = claim!.id as string
    const rec = await recordVehicleDamage({ db, damage: { vehicleId, claimId, state: 'aktuell', art: 'tuer' } })
    expect(rec.ok).toBe(true)
    const res = await markClaimDamagesAsVorschaden({ db, claimId })
    expect(res.ok && res.updated >= 1).toBe(true)
    if (rec.ok) {
      const { data } = await db.from('vehicle_vorschaeden').select('state').eq('id', rec.damageId).single()
      expect(data!.state).toBe('vorschaden')
    }
  })
})
