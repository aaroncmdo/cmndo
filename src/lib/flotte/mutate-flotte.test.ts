import { describe, it, expect, vi, beforeEach } from 'vitest'

// ensureVehicleFromFin/createVehicleStub werden ueber Modul-Level-Handles gesteuert. Die Referenz
// steckt in einer NESTED Arrow (erst zur Testzeit ausgewertet) -> kein vi.mock-Hoisting-Problem.
const ensureMock = vi.fn()
const stubMock = vi.fn()
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  ensureVehicleFromFin: (...a: unknown[]) => ensureMock(...a),
  createVehicleStub: (...a: unknown[]) => stubMock(...a),
  VIN_REGEX: /^[A-HJ-NPR-Z0-9]{17}$/,
}))

import { addFahrzeugToFlotte, bindeVehicleAnFlotte, updateFahrzeugStammdaten, type FahrzeugStammdatenForm } from './mutate-flotte'

beforeEach(() => {
  ensureMock.mockReset()
  stubMock.mockReset()
  ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v-fin' })
  stubMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
})

function dbWithBindOk() {
  // bindeVehicleAnFlotte macht .from('flotten_fahrzeuge').insert(...)
  return { from: () => ({ insert: async () => ({ error: null }) }) } as never
}

describe('addFahrzeugToFlotte', () => {
  it('maps unique-violation to a friendly message', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as never
    const res = await addFahrzeugToFlotte(db, 'f1', { kennzeichen: 'K-AB 1' }, 'u1')
    expect(res).toEqual({ ok: false, error: 'Dieses Fahrzeug ist bereits in der Flotte.' })
  })

  it('rejects empty kennzeichen', async () => {
    const res = await addFahrzeugToFlotte({} as never, 'f1', { kennzeichen: '' }, 'u1')
    expect(res.ok).toBe(false)
  })

  it('gültige FIN -> ensureVehicleFromFin (dedup), nicht Stub', async () => {
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', {
      kennzeichen: 'K-AB 123', fin: 'WVWZZZ1JZXW000001',
    }, 'u1')
    expect(res.ok).toBe(true)
    expect(ensureMock).toHaveBeenCalledTimes(1)
    expect(stubMock).not.toHaveBeenCalled()
  })

  it('keine/ungültige FIN -> createVehicleStub', async () => {
    const res = await addFahrzeugToFlotte(dbWithBindOk(), 'f1', {
      kennzeichen: 'K-AB 123', fin: 'ZU-KURZ',
    }, 'u1')
    expect(res.ok).toBe(true)
    expect(stubMock).toHaveBeenCalledTimes(1)
    expect(ensureMock).not.toHaveBeenCalled()
  })
})

describe('bindeVehicleAnFlotte', () => {
  it('bindet ein Fahrzeug an die Flotte', async () => {
    const db = { from: () => ({ insert: async () => ({ error: null }) }) } as never
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: true })
  })

  it('23505 (UNIQUE firma_id,vehicle_id) -> bereitsVorhanden, KEIN Fehler', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23505', message: 'dup' } }) }) } as never
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, bereitsVorhanden: true })
  })

  it('anderer Fehler -> ok:false + error', async () => {
    const db = { from: () => ({ insert: async () => ({ error: { code: '23503', message: 'fk' } }) }) } as never
    const res = await bindeVehicleAnFlotte(db, { firmaId: 'f1', vehicleId: 'v1', userId: 'u1' })
    expect(res).toEqual({ ok: false, error: 'fk' })
  })
})

// Chainable Supabase-Mock: unterscheidet die drei Zugriffe in updateFahrzeugStammdaten
//  1) flotten_fahrzeuge .select().eq().eq().maybeSingle()  -> Ownership ({ data: owner })
//  2) vehicles         .update(payload).eq('id', …)        -> awaited { error: vehError }
//  3) flotten_fahrzeuge .update({notiz}).eq().eq()         -> awaited { error: notizError }
// select endet in .maybeSingle() (Promise), updates werden direkt awaited (thenable-Builder).
function makeDb(opts: { owner?: unknown; vehError?: unknown; notizError?: unknown } = {}) {
  const updates: { table: string; payload: unknown }[] = []
  function builder(table: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const b: any = {
      select: () => b,
      update: (payload: unknown) => {
        updates.push({ table, payload })
        return b
      },
      eq: () => b,
      maybeSingle: () =>
        Promise.resolve({ data: table === 'flotten_fahrzeuge' ? opts.owner ?? null : null, error: null }),
      then: (resolve: (v: unknown) => void) => {
        const error = table === 'vehicles' ? opts.vehError ?? null : opts.notizError ?? null
        resolve({ error })
      },
    }
    return b
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = { from: (t: string) => builder(t) } as any
  return { db, updates }
}

const OWNER = { id: 'ff1' }
const baseForm: FahrzeugStammdatenForm = { kennzeichen: 'K-AB 123' }
const vehUpdate = (updates: { table: string; payload: unknown }[]) =>
  updates.find((u) => u.table === 'vehicles')?.payload as Record<string, unknown> | undefined

describe('updateFahrzeugStammdaten', () => {
  it('leeres Kennzeichen -> Fehler, kein Write', async () => {
    const { db, updates } = makeDb({ owner: OWNER })
    const r = await updateFahrzeugStammdaten(db, { firmaId: 'f1', vehicleId: 'v1', form: { kennzeichen: '  ' } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Kennzeichen')
    expect(updates).toHaveLength(0)
  })

  it('Fahrzeug gehoert nicht zur Firma -> Ownership-Fehler, kein vehicles-Write', async () => {
    const { db, updates } = makeDb({ owner: null })
    const r = await updateFahrzeugStammdaten(db, { firmaId: 'f1', vehicleId: 'v1', form: baseForm })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Flotte')
    expect(vehUpdate(updates)).toBeUndefined()
  })

  it('ungueltige FIN -> Fehler, kein vehicles-Write', async () => {
    const { db, updates } = makeDb({ owner: OWNER })
    const r = await updateFahrzeugStammdaten(db, { firmaId: 'f1', vehicleId: 'v1', form: { ...baseForm, fin: 'ABC123' } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('FIN')
    expect(vehUpdate(updates)).toBeUndefined()
  })

  it('nicht-numerischer Kilometerstand -> Fehler', async () => {
    const { db } = makeDb({ owner: OWNER })
    const r = await updateFahrzeugStammdaten(db, { firmaId: 'f1', vehicleId: 'v1', form: { ...baseForm, kilometerstand: 'zwei' } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('Kilometerstand')
  })

  it('Happy-Path: normalisiert Kennzeichen, uppercased FIN, parst km + stempelt _at, Notiz-Write', async () => {
    const { db, updates } = makeDb({ owner: OWNER })
    const r = await updateFahrzeugStammdaten(db, {
      firmaId: 'f1',
      vehicleId: 'v1',
      form: { kennzeichen: 'K-AB 123', fin: 'wba12345678901234', kilometerstand: '12.500', hersteller: 'BMW', notiz: 'Winterreifen' },
    })
    expect(r.ok).toBe(true)
    const p = vehUpdate(updates)!
    expect(p.kennzeichen_aktuell).toBe('K-AB 123')
    expect(p.kennzeichen_normalized).toBe('k ab 123') // normalizeName: lowercase + Separator->Space
    expect(p.fin).toBe('WBA12345678901234')
    expect(p.hersteller).toBe('BMW')
    expect(p.aktueller_kilometerstand).toBe(12500)
    expect(typeof p.aktueller_kilometerstand_at).toBe('string')
    expect(updates.some((u) => u.table === 'flotten_fahrzeuge')).toBe(true) // Notiz-Write lief
  })

  it('leere Optionalfelder -> NULL (kein aktueller_kilometerstand_at)', async () => {
    const { db, updates } = makeDb({ owner: OWNER })
    const r = await updateFahrzeugStammdaten(db, { firmaId: 'f1', vehicleId: 'v1', form: { kennzeichen: 'K-AB 123', hersteller: '', fin: '', hsn: '  ', kilometerstand: '' } })
    expect(r.ok).toBe(true)
    const p = vehUpdate(updates)!
    expect(p.hersteller).toBeNull()
    expect(p.fin).toBeNull()
    expect(p.hsn).toBeNull()
    expect(p.aktueller_kilometerstand).toBeNull()
    expect('aktueller_kilometerstand_at' in p).toBe(false)
  })

  it('FIN-Kollision (23505) -> freundlicher Fehler, kein Notiz-Write', async () => {
    const { db, updates } = makeDb({ owner: OWNER, vehError: { code: '23505', message: 'dup' } })
    const r = await updateFahrzeugStammdaten(db, { firmaId: 'f1', vehicleId: 'v1', form: { ...baseForm, fin: 'WBA12345678901234' } })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('bereits einem anderen')
    expect(updates.some((u) => u.table === 'flotten_fahrzeuge')).toBe(false) // vehicles scheiterte -> Notiz nicht mehr
  })
})
