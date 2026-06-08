import { describe, it, expect } from 'vitest'
import { slotsFuerTag, freieSlots } from './slots'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

describe('slotsFuerTag', () => {
  const tag = new Date('2026-07-06T00:00:00Z') // Montag
  // AAR-956 TZ: Belegt-Instants Berlin-verankert (konsistent zur Slot-Generierung),
  // damit der Test runner-TZ-unabhaengig ist (CI UTC vs lokal Berlin).
  const belegt = (vonHHMM: string, bisHHMM: string) => {
    const mk = (hhmm: string) => new Date(berlinWallClockToUtc(`2026-07-06T${hhmm}:00`))
    return { von: mk(vonHHMM), bis: mk(bisHHMM) }
  }
  it('erzeugt 45-Min-Slots 09:00–11:00 (puffer 0, keine Belegung)', () => {
    expect(slotsFuerTag(tag, { vonMin: 540, bisMin: 660 }, [], 45, 0).map((s) => s.uhrzeit)).toEqual([
      '09:00',
      '09:45',
    ])
  })
  it('lässt einen direkt belegten Slot aus (puffer 0)', () => {
    expect(
      slotsFuerTag(tag, { vonMin: 540, bisMin: 720 }, [belegt('09:45', '10:30')], 45, 0).map((s) => s.uhrzeit),
    ).toEqual(['09:00', '10:30', '11:15'])
  })
  it('puffer blockt angrenzende Slots', () => {
    expect(
      slotsFuerTag(tag, { vonMin: 540, bisMin: 720 }, [belegt('10:30', '11:15')], 45, 15).map((s) => s.uhrzeit),
    ).toEqual(['09:00'])
  })
})

describe('freieSlots — now-Floor (Fenster-Untergrenze vonIso)', () => {
  // Stub: SV ohne arbeitszeiten (→ DEFAULT 09:00–17:00) + leere v_belegung. Kein
  // schadenort → keine Reachability. Berlin-verankert via berlinWallClockToUtc → runner-TZ-unabhaengig.
  const dbStub = {
    from: (t: string) => {
      if (t === 'sachverstaendige') {
        return {
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { arbeitszeiten: null, blockierte_wochentage: null } }) }),
          }),
        }
      }
      // v_belegung: .select().eq().eq().lt().gt().order() → {data:[],error:null}
      const chain: Record<string, unknown> = {}
      chain.select = () => chain
      chain.eq = () => chain
      chain.lt = () => chain
      chain.gt = () => chain
      chain.order = () => Promise.resolve({ data: [], error: null })
      return chain
    },
  } as never

  const sv = { typ: 'sachverstaendiger' as const, id: 'sv-1' }

  it('schliesst am vonIso-Tag bereits vergangene Slots aus; Folgetag voll', async () => {
    const von = berlinWallClockToUtc('2026-07-06T14:00:00') // Montag 14:00 Berlin
    const bis = berlinWallClockToUtc('2026-07-07T20:00:00') // bis Dienstag
    const tage = await freieSlots(sv, von, bis, {}, dbStub)
    const mo = tage.find((t) => t.datum === '2026-07-06')!
    const di = tage.find((t) => t.datum === '2026-07-07')!
    expect(mo.slots.length).toBeGreaterThan(0)
    expect(mo.slots.every((s) => s.uhrzeit >= '14:00')).toBe(true) // nichts Vergangenes
    expect(mo.slots.some((s) => s.uhrzeit === '09:00')).toBe(false)
    expect(di.slots[0]?.uhrzeit).toBe('09:00') // Folgetag ungefiltert
  })
})
