import { describe, it, expect } from 'vitest'
import { baueWunschzeitOption, istWunschzeitFrei } from '../wunschzeit-optionen'

describe('baueWunschzeitOption', () => {
  it('konvertiert Berlin-Wall-Clock in den korrekten UTC-Instant (CEST = UTC+2)', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00')
    expect(o).not.toBeNull()
    expect(new Date(o!.start).toISOString()).toBe('2026-08-11T10:00:00.000Z')
  })

  it('konvertiert auch im Winter korrekt (CET = UTC+1)', () => {
    const o = baueWunschzeitOption('2026-01-13T12:00')
    expect(new Date(o!.start).toISOString()).toBe('2026-01-13T11:00:00.000Z')
  })

  it('liefert null ohne Wunschtermin', () => {
    expect(baueWunschzeitOption(null)).toBeNull()
    expect(baueWunschzeitOption('')).toBeNull()
  })

  it('liefert null bei unvollstaendiger Eingabe', () => {
    expect(baueWunschzeitOption('2026-08-11')).toBeNull()
  })

  it('liefert null bei unsinniger Eingabe statt zu werfen', () => {
    expect(baueWunschzeitOption('kaese T brot')).toBeNull()
  })

  // RC-1-Regression (Ops-Test 11.08.): der abgeloeste Inline-IIFE erzeugte aus einer
  // Wunschstunde H das Tripel [H, H+2, H-2] und ERSETZTE damit die echten Engine-Slots.
  // Es darf genau EINE Option herauskommen — die tatsaechlich gewuenschte Zeit.
  it('erfindet keine Alternativstunden (RC-1)', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00')
    expect(Array.isArray(o)).toBe(false)
    expect(Object.keys(o!).sort()).toEqual(['end', 'start'])
    expect(new Date(o!.start).getUTCHours()).toBe(10) // 12:00 Berlin, nicht 10/14 Berlin
  })

  it('setzt das Ende auf start + TERMIN_DAUER_MIN (40)', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00')
    const dauerMin = (new Date(o!.end).getTime() - new Date(o!.start).getTime()) / 60_000
    expect(dauerMin).toBe(40)
  })

  it('akzeptiert Sekunden im Eingabe-String', () => {
    const o = baueWunschzeitOption('2026-08-11T12:00:00')
    expect(new Date(o!.start).toISOString()).toBe('2026-08-11T10:00:00.000Z')
  })
})

describe('istWunschzeitFrei', () => {
  // Minimaler PostgREST-Chain-Fake: jede Builder-Methode gibt die Kette zurueck,
  // await auf der Kette liefert { data, error } (thenable). Deckt den Aufrufpfad
  // ladeBelegungStrict: from().select().eq().eq().lt().gt().order() ab.
  const fakeDb = (rows: unknown[], error: { message: string } | null = null) => {
    const chain: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'gt', 'order']) chain[m] = () => chain
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error })
    return { from: () => chain } as never
  }

  // Ops-Test-Konstellation: Wunsch Di 12:00 Berlin = 10:00 UTC, Dauer 40 min.
  const option = { start: '2026-08-11T10:00:00.000Z', end: '2026-08-11T10:40:00.000Z' }

  it('frei, wenn keine Belegung im Fenster liegt', async () => {
    expect(await istWunschzeitFrei('sv-1', option, fakeDb([]))).toBe(true)
  })

  // Der Ops-Test-Fall: SV-Kalenderblock Di 12:30-13:30 Berlin = 10:30-11:30 UTC.
  // Blockade-Fenster der Wunschzeit = 09:50-10:50 UTC (Dauer 40 + Puffer 10
  // beidseitig) -> ueberlappt -> belegt. Genau das wurde im Test als "frei" angeboten.
  it('belegt, wenn ein externer Kalenderblock ueberlappt (RC-1)', async () => {
    const rows = [{ start_zeit: '2026-08-11T10:30:00+00', end_zeit: '2026-08-11T11:30:00+00' }]
    expect(await istWunschzeitFrei('sv-1', option, fakeDb(rows))).toBe(false)
  })

  it('fail-closed: DB-Fehler gilt als belegt', async () => {
    expect(await istWunschzeitFrei('sv-1', option, fakeDb([], { message: 'boom' }))).toBe(false)
  })

  it('fail-closed: ungueltiger Start gilt als belegt', async () => {
    const kaputt = { start: 'nicht-datum', end: 'auch-nicht' }
    expect(await istWunschzeitFrei('sv-1', kaputt, fakeDb([]))).toBe(false)
  })
})
