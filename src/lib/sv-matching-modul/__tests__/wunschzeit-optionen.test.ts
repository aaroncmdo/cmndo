import { describe, it, expect } from 'vitest'
import { baueWunschzeitOption, istWunschzeitFrei, liegtInArbeitszeit } from '../wunschzeit-optionen'

// Ops-Test 12.08. (Nachbesserung zu #5176): Die Belegungspruefung allein reicht NICHT.
// Ausserhalb der Arbeitszeit gibt es keine Belegung — 08:00, 18:00 und Samstage galten
// deshalb als "frei" und wurden weiter angeboten. Prod-Beleg: 10 self_service-Termine
// liegen ausserhalb der Arbeitszeit (9x 08:00, 1x 17:00), einer davon an einem Samstag.
describe('liegtInArbeitszeit', () => {
  // Default-SV: Mo-Do 09:00-17:00, Fr 09:00-16:00, Sa/So gar nicht.
  const az = (dowJs: number) => {
    if (dowJs === 0 || dowJs === 6) return null
    return dowJs === 5 ? { vonMin: 540, bisMin: 960 } : { vonMin: 540, bisMin: 1020 }
  }

  it('12:00 an einem Dienstag -> drin', () => {
    expect(liegtInArbeitszeit('2026-08-11T12:00:00', 40, az)).toBe(true)
  })

  it('08:00 -> raus (Arbeitszeit beginnt 09:00)', () => {
    expect(liegtInArbeitszeit('2026-08-11T08:00:00', 40, az)).toBe(false)
  })

  it('Start 16:40 + 40 min = 17:20 -> raus (Ende nach Feierabend)', () => {
    expect(liegtInArbeitszeit('2026-08-11T16:40:00', 40, az)).toBe(false)
  })

  it('Start 16:20 + 40 min = 17:00 -> drin (exakt bis Feierabend)', () => {
    expect(liegtInArbeitszeit('2026-08-11T16:20:00', 40, az)).toBe(true)
  })

  it('Samstag -> raus, egal welche Uhrzeit', () => {
    // 2026-08-15 ist ein Samstag.
    expect(liegtInArbeitszeit('2026-08-15T10:00:00', 40, az)).toBe(false)
  })

  it('Freitag 15:40 -> raus (Fr nur bis 16:00, Ende waere 16:20)', () => {
    // 2026-08-14 ist ein Freitag.
    expect(liegtInArbeitszeit('2026-08-14T15:40:00', 40, az)).toBe(false)
  })

  it('unparsbare Wall-Clock -> raus (fail-closed)', () => {
    expect(liegtInArbeitszeit('kaese', 40, az)).toBe(false)
  })
})

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
  // Zwei Tabellen: `sachverstaendige` (Arbeitszeiten, via maybeSingle) und `v_belegung`
  // (Belegungs-Fenster, via thenable-Kette). `arbeitszeiten: null` => Engine-Default
  // Mo-Do 09:00-17:00 / Fr 09:00-16:00.
  const fakeDb = (
    rows: unknown[],
    error: { message: string } | null = null,
    sv: unknown = { arbeitszeiten: null, blockierte_wochentage: [] },
  ) => {
    const belegung: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'lt', 'gt', 'order']) belegung[m] = () => belegung
    belegung.then = (resolve: (v: unknown) => void) => resolve({ data: rows, error })

    const svChain: Record<string, unknown> = {}
    for (const m of ['select', 'eq']) svChain[m] = () => svChain
    svChain.maybeSingle = async () => ({ data: sv, error: null })

    return { from: (t: string) => (t === 'sachverstaendige' ? svChain : belegung) } as never
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

  // Ops-Test 12.08.: Die Luecke, die #5176 offen liess — ausserhalb der Arbeitszeit
  // gibt es keine Belegung, die Zeit galt daher faelschlich als frei.
  it('08:00 Berlin -> NICHT frei, obwohl keine Belegung (Arbeitszeit ab 09:00)', async () => {
    const frueh = { start: '2026-08-11T06:00:00.000Z', end: '2026-08-11T06:40:00.000Z' }
    expect(await istWunschzeitFrei('sv-1', frueh, fakeDb([]))).toBe(false)
  })

  it('Samstag -> NICHT frei, obwohl keine Belegung', async () => {
    // 2026-08-15 = Samstag, 10:00 Berlin.
    const sa = { start: '2026-08-15T08:00:00.000Z', end: '2026-08-15T08:40:00.000Z' }
    expect(await istWunschzeitFrei('sv-1', sa, fakeDb([]))).toBe(false)
  })

  it('blockierter Wochentag -> NICHT frei', async () => {
    // blockierte_wochentage nutzt ISO (1=Mo..7=So); 2 = Dienstag.
    const sv = { arbeitszeiten: null, blockierte_wochentage: [2] }
    expect(await istWunschzeitFrei('sv-1', option, fakeDb([], null, sv))).toBe(false)
  })

  it('SV existiert nicht -> fail-closed', async () => {
    expect(await istWunschzeitFrei('sv-1', option, fakeDb([], null, null))).toBe(false)
  })
})
