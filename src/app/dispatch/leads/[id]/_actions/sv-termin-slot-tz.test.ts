// AAR-958 (Dispatch-Matching-Hotpath TZ-Fix): getNextFreeSlotsForSv baut das
// Slot-Grid mit setHours(9)/getHours()<16 — auf UTC-Node = 09:00-16:00 UTC =
// 11:00-18:00 Berlin (Sommer). Dieser Test fixiert: erster Slot = 09:00 Berlin,
// alle Slots im Berlin-Werktagsfenster. TZ wird auf UTC erzwungen (Server-Realitaet).

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { toBerlinWallClock } from '@/lib/google-calendar/timezone'

const ORIG_TZ = process.env.TZ
beforeAll(() => { process.env.TZ = 'UTC' })
afterAll(() => { if (ORIG_TZ === undefined) delete process.env.TZ; else process.env.TZ = ORIG_TZ })

// createClient mocken: kein User-Auth-Block, keine bestehenden Termine.
// chain MUSS in der Factory definiert sein (vi.mock-Hoisting).
vi.mock('@/lib/supabase/server', () => {
  function chain(data: unknown) {
    const o: Record<string, unknown> = {
      then: (res: (v: { data: unknown }) => unknown) => Promise.resolve({ data }).then(res),
    }
    for (const m of ['select', 'eq', 'not', 'gte', 'lte', 'order', 'maybeSingle', 'in', 'limit', 'single']) {
      o[m] = () => o
    }
    return o
  }
  return {
    createClient: async () => ({
      auth: { getUser: async () => ({ data: { user: { id: 'u' } } }) },
      from: () => chain([]),
    }),
  }
})

// requireRole mocken: die Slot-Zeit-Logik ist der Testgegenstand, nicht der
// Authz-Guard. Seit M2 ruft getNextFreeSlotsForSv requireRole → requireAuth,
// das supabase.from('profiles')…maybeSingle() macht; der createClient-Mock
// liefert kein Profil → Guard schlägt fehl → Slot-Logik liefe nie. Der Mock
// gibt einen dispatch-User + denselben Query-Mock-Client zurück.
vi.mock('@/lib/auth/guards', async () => {
  const { createClient } = await import('@/lib/supabase/server')
  return {
    requireRole: async () => ({
      success: true,
      user: { id: 'u', email: null, rolle: 'dispatch', vorname: 'T', nachname: 'T' },
      supabase: await createClient(),
    }),
  }
})

import { getNextFreeSlotsForSv } from './sv-termin'

describe('getNextFreeSlotsForSv — Berlin-Slot-Zeiten (AAR-958 TZ-Fix)', () => {
  it('erster Slot = 09:00 Berlin (nicht 11:00) + alle im Werktagsfenster 09-16', async () => {
    const r = await getNextFreeSlotsForSv('sv-test', 5)
    expect(r.success).toBe(true)
    expect(r.slots && r.slots.length > 0).toBe(true)
    // Diskriminierend: pre-fix waere der erste Slot 11:00 Berlin (Sommer).
    expect(toBerlinWallClock(r.slots![0].start).slice(11, 16)).toBe('09:00')
    for (const s of r.slots!) {
      const hh = Number(toBerlinWallClock(s.start).slice(11, 13))
      expect(hh >= 9 && hh < 16).toBe(true)
    }
  })
})
