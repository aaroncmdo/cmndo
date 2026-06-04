// AAR-958 (Dispatch-Matching-Hotpath TZ-Fix): die SV-Slot-Vorschlaege muessen
// Berlin-Geschaeftszeiten (09:00-16:00) sein. Auf UTC-Node erzeugte setHours(9)
// einen 09:00-UTC-Slot = 11:00 Berlin (Sommer) / 10:00 (Winter). Dieser Test
// fixiert das gewuenschte Verhalten: erster freier Slot = 09:00 Berlin.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { findNextFreeSlotForSv } from './findBestSV'

// Der Bug ist runtime-TZ-abhaengig: lokal (Berlin) maskiert, auf UTC-Node
// (Server + CI) sichtbar. Wir erzwingen UTC, damit der Test ueberall die
// Server-Realitaet prueft (nicht die lokale Maschine).
const ORIG_TZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'UTC' })
afterAll(() => { if (ORIG_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIG_TZ })

// Mock-DB (thenable-chain): keine bestehenden gutachter_termine, keine
// blockierten Wochentage. profileId/candidate = null -> kein Busy/ETA-Pfad.
function chain(data: unknown) {
  const o: Record<string, unknown> = {
    then: (res: (v: { data: unknown }) => unknown) => Promise.resolve({ data }).then(res),
  }
  for (const m of ['select', 'eq', 'not', 'gte', 'lte', 'order', 'maybeSingle', 'in', 'limit', 'single']) {
    o[m] = () => o
  }
  return o
}
const db = {
  from: (t: string) => chain(t === 'sachverstaendige' ? { blockierte_wochentage: [] } : []),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any

describe('findNextFreeSlotForSv — Berlin-Slot-Zeiten (AAR-958 TZ-Fix)', () => {
  it('Sommer (CEST +2): erster freier Slot = 09:00 Berlin, nicht 11:00', async () => {
    const ab = new Date('2026-06-08T05:00:00Z') // Montag, vor 09:00 Berlin
    const iso = await findNextFreeSlotForSv(db, 'sv-test', ab, null, null)
    expect(iso).not.toBeNull()
    expect(toBerlinWallClock(iso!).slice(11, 16)).toBe('09:00')
    // Sommer: 09:00 Berlin == 07:00Z
    expect(iso).toBe('2026-06-08T07:00:00.000Z')
  })

  it('Winter (CET +1): erster freier Slot = 09:00 Berlin, nicht 10:00', async () => {
    const ab = new Date('2026-01-12T05:00:00Z') // Montag, vor 09:00 Berlin
    const iso = await findNextFreeSlotForSv(db, 'sv-test', ab, null, null)
    expect(iso).not.toBeNull()
    expect(toBerlinWallClock(iso!).slice(11, 16)).toBe('09:00')
    // Winter: 09:00 Berlin == 08:00Z
    expect(iso).toBe('2026-01-12T08:00:00.000Z')
  })

  it('Slot-Start liegt nie ausserhalb 09:00-15:30 Berlin (Werktags-Fenster)', async () => {
    const ab = new Date('2026-06-08T05:00:00Z')
    const iso = await findNextFreeSlotForSv(db, 'sv-test', ab, null, null)
    const hhmm = toBerlinWallClock(iso!).slice(11, 16)
    expect(hhmm >= '09:00' && hhmm < '16:00').toBe(true)
  })
})
