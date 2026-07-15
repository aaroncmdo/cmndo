import { describe, it, expect, vi, beforeEach } from 'vitest'

const ensureMock = vi.fn()
const stubMock = vi.fn()
const bindeMock = vi.fn()
vi.mock('@/lib/vehicles/ensure-vehicle', () => ({
  ensureVehicleFromFin: (...a: unknown[]) => ensureMock(...a),
  createVehicleStub: (...a: unknown[]) => stubMock(...a),
}))
vi.mock('./mutate-flotte', () => ({ bindeVehicleAnFlotte: (...a: unknown[]) => bindeMock(...a) }))

import { legeFlottenFahrzeugeAn } from './zb1-batch-anlage'

const felder = (fin: string | null, kz = 'K-AA 1', fahrzeugklasse: string | null = null) => ({
  fin, kennzeichen: kz, hersteller: 'BMW', modell: '320d', hsn: null, tsn: null, farbe: null, erstzulassung: null, baujahr: null, fahrzeugklasse,
})
const db = {} as any

// db-Mock fuer die fahrzeugklasse-Persistenz (Task 6): db.from('vehicles').update({...}).eq('id', v)
function makeDbMock(updateResult: { error: unknown } = { error: null }) {
  const eqMock = vi.fn().mockResolvedValue(updateResult)
  const updateMock = vi.fn(() => ({ eq: eqMock }))
  const fromMock = vi.fn(() => ({ update: updateMock }))
  return { db: { from: fromMock } as any, fromMock, updateMock, eqMock }
}

beforeEach(() => { ensureMock.mockReset(); stubMock.mockReset(); bindeMock.mockReset() })

describe('legeFlottenFahrzeugeAn', () => {
  it('mit FIN -> ensureVehicleFromFin + bind -> angelegt', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder('WBA12345678901234'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('angelegt')
  })
  it('FIN schon in Flotte -> bind meldet bereitsVorhanden (23505) -> aktualisiert', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: false, bereitsVorhanden: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder('WBA12345678901234'), bereitsInFlotte: true }], 'f1', 'u1')
    expect(r[0].status).toBe('aktualisiert')
    // Der Status kommt aus der DB (23505), NICHT aus dem Client-Flag -> bind MUSS laufen.
    expect(bindeMock).toHaveBeenCalledTimes(1)
  })

  it('REGRESSION: bereitsInFlotte:true, aber FIN im Review editiert -> bindet TROTZDEM (kein stiller Skip)', async () => {
    // `bereitsInFlotte` stammt vom Scan der URSPRUENGLICHEN FIN. Korrigiert der Nutzer die FIN
    // auf ein noch-nicht-registriertes Fahrzeug, darf der Bind NICHT uebersprungen werden --
    // sonst landet das Fahrzeug nie in der Flotte, wird aber als Erfolg gemeldet.
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v-neu' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder('WBA99999999999999'), bereitsInFlotte: true }], 'f1', 'u1')
    expect(bindeMock).toHaveBeenCalledWith(db, { firmaId: 'f1', vehicleId: 'v-neu', userId: 'u1' })
    expect(r[0].status).toBe('angelegt')
  })
  it('keine FIN -> createVehicleStub -> stub', async () => {
    stubMock.mockResolvedValue({ ok: true, vehicleId: 'v2' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder(null), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('stub')
    expect(ensureMock).not.toHaveBeenCalled()
  })
  it('falsch formatierte FIN (zu kurz) -> Stub-Pfad statt ensureVehicleFromFin -> stub', async () => {
    stubMock.mockResolvedValue({ ok: true, vehicleId: 'v5' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [{ felder: felder('ABC12'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('stub')
    expect(ensureMock).not.toHaveBeenCalled()
    expect(stubMock).toHaveBeenCalledTimes(1)
    expect(bindeMock).toHaveBeenCalledTimes(1)
  })
  it('NON-ATOMAR: Zeile 2 scheitert, Zeile 1+3 laufen durch', async () => {
    ensureMock
      .mockResolvedValueOnce({ ok: true, vehicleId: 'v1' })
      .mockResolvedValueOnce({ ok: false, error: 'FIN ungueltig' })
      .mockResolvedValueOnce({ ok: true, vehicleId: 'v3' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [
      { felder: felder('WBA00000000000001'), bereitsInFlotte: false },
      { felder: felder('WBA00000000000002'), bereitsInFlotte: false },
      { felder: felder('WBA00000000000003'), bereitsInFlotte: false },
    ], 'f1', 'u1')
    expect(r.map((x) => x.status)).toEqual(['angelegt', 'fehler', 'angelegt'])
  })
  it('NON-ATOMAR (echte Exception): Zeile 2 wirft, Zeile 1+3 laufen trotzdem durch', async () => {
    // Anders als der Test oben (der einen `{ ok:false }`-Rueckgabewert simuliert und damit
    // nur den if(!veh.ok)-Zweig prueft) wirft ensureVehicleFromFin hier eine ECHTE Exception.
    // Das beweist, dass das try/catch PRO ZEILE sitzt -- nicht um die ganze Schleife.
    ensureMock
      .mockResolvedValueOnce({ ok: true, vehicleId: 'v1' })
      .mockRejectedValueOnce(new Error('DB-Verbindung weg'))
      .mockResolvedValueOnce({ ok: true, vehicleId: 'v3' })
    bindeMock.mockResolvedValue({ ok: true })
    const r = await legeFlottenFahrzeugeAn(db, [
      { felder: felder('WBA00000000000001'), bereitsInFlotte: false },
      { felder: felder('WBA00000000000002'), bereitsInFlotte: false },
      { felder: felder('WBA00000000000003'), bereitsInFlotte: false },
    ], 'f1', 'u1')
    expect(r.map((x) => x.status)).toEqual(['angelegt', 'fehler', 'angelegt'])
    expect(r[1].error).toBe('DB-Verbindung weg')
  })

  it('Task 6: fahrzeugklasse gesetzt -> vehicles.update({ fahrzeugklasse })', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: true })
    const { db: dbm, fromMock, updateMock, eqMock } = makeDbMock()
    const r = await legeFlottenFahrzeugeAn(dbm, [{ felder: felder('WBA12345678901234', 'K-AA 1', 'M1'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('angelegt')
    expect(fromMock).toHaveBeenCalledWith('vehicles')
    expect(updateMock).toHaveBeenCalledWith({ fahrzeugklasse: 'M1' })
    expect(eqMock).toHaveBeenCalledWith('id', 'v1')
  })

  it('Task 6: fahrzeugklasse null -> KEIN vehicles.update', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: true })
    const { db: dbm, fromMock } = makeDbMock()
    await legeFlottenFahrzeugeAn(dbm, [{ felder: felder('WBA12345678901234'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('Task 6: fahrzeugklasse-Update-Fehler bricht die Zeile NICHT (best-effort)', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: true })
    const { db: dbm } = makeDbMock({ error: { message: 'boom' } })
    const r = await legeFlottenFahrzeugeAn(dbm, [{ felder: felder('WBA12345678901234', 'K-AA 1', 'M1'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('angelegt')
  })

  it('Task 6: bereits gebunden (23505) -> fahrzeugklasse wird trotzdem aktualisiert', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: false, bereitsVorhanden: true })
    const { db: dbm, updateMock } = makeDbMock()
    const r = await legeFlottenFahrzeugeAn(dbm, [{ felder: felder('WBA12345678901234', 'K-AA 1', 'N1'), bereitsInFlotte: true }], 'f1', 'u1')
    expect(r[0].status).toBe('aktualisiert')
    expect(updateMock).toHaveBeenCalledWith({ fahrzeugklasse: 'N1' })
  })

  it('Task 6: echter Bind-Fehler -> fahrzeugklasse wird NICHT geschrieben (Zeile ist fehler)', async () => {
    ensureMock.mockResolvedValue({ ok: true, vehicleId: 'v1' })
    bindeMock.mockResolvedValue({ ok: false, error: 'DB weg' })
    const { db: dbm, fromMock } = makeDbMock()
    const r = await legeFlottenFahrzeugeAn(dbm, [{ felder: felder('WBA12345678901234', 'K-AA 1', 'M1'), bereitsInFlotte: false }], 'f1', 'u1')
    expect(r[0].status).toBe('fehler')
    expect(fromMock).not.toHaveBeenCalled()
  })
})
