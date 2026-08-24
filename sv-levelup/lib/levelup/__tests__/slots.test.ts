import { beforeEach, describe, expect, it } from 'vitest'
import { freieSlots, SLOT_STUNDEN, VORLAUF_STUNDEN } from '../slots'
import type { Db } from '../../anreicherung/schreiben'

const state = { belegt: [] as string[], fehler: null as string | null }

const db = {
  from: (tabelle: string) => {
    if (tabelle === 'levelup_termine') {
      return {
        select: () => ({
          in: () => ({
            gte: async () =>
              state.fehler
                ? { data: null, error: { message: state.fehler } }
                : { data: state.belegt.map((s) => ({ slot_start: s })), error: null },
          }),
        }),
      }
    }
    throw new Error(`Unerwartete Tabelle: ${tabelle}`)
  },
} as unknown as Db

/** Mittwoch, 19.08.2026, 10:00 deutscher Zeit. */
const MITTWOCH = new Date('2026-08-19T08:00:00.000Z')

beforeEach(() => {
  state.belegt = []
  state.fehler = null
})

describe('freieSlots', () => {
  it('liefert sechs Termine', async () => {
    const s = await freieSlots(db, MITTWOCH)
    expect(s).toHaveLength(6)
  })

  it('liegt jeder Termin in der Zukunft', async () => {
    const s = await freieSlots(db, MITTWOCH)
    for (const x of s) expect(new Date(x.start).getTime()).toBeGreaterThan(MITTWOCH.getTime())
  })

  it('haelt den Vorlauf ein — nichts in der naechsten Stunde', async () => {
    const s = await freieSlots(db, MITTWOCH)
    const frueheste = Math.min(...s.map((x) => new Date(x.start).getTime()))
    expect(frueheste - MITTWOCH.getTime()).toBeGreaterThanOrEqual(VORLAUF_STUNDEN * 3_600_000)
  })

  /** Ein Beratungstermin am Sonntag waere niemandem geholfen. */
  it('nimmt nur Werktage', async () => {
    // Freitagnachmittag — die naechsten Slots muessen ueber das Wochenende springen
    const freitag = new Date('2026-08-21T14:00:00.000Z')
    const s = await freieSlots(db, freitag)
    for (const x of s) {
      // Der Wochentag muss in ORTSZEIT geprüft werden: ein Slot am Montag
      // 09:00 MESZ liegt in UTC am Montag 07:00 — bei einem 23-Uhr-Slot läge
      // der UTC-Tag aber schon auf dem Vortag.
      const kurz = new Date(x.start).toLocaleDateString('en-US', {
        timeZone: 'Europe/Berlin', weekday: 'short',
      })
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(kurz)
    }
  })

  it('bleibt im Raster der Bürostunden — in deutscher ORTSZEIT', async () => {
    const s = await freieSlots(db, MITTWOCH)
    for (const x of s) {
      const stunde = Number(new Date(x.start).toLocaleString('en-US', {
        timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false,
      }))
      expect(SLOT_STUNDEN).toContain(stunde)
    }
  })

  /**
   * ⚠ Das Raster ist an die ORTSZEIT gebunden, nicht an UTC. Sonst wäre ein
   * „09:00"-Termin im Winter plötzlich 08:00 — der Sachverständige sieht die
   * Uhrzeit, nicht den Zeitzonen-Versatz.
   */
  it('liegt im Winter zur selben Ortszeit wie im Sommer', async () => {
    const dezember = new Date('2026-12-09T06:00:00.000Z')   // Mittwoch, MEZ
    const s = await freieSlots(db, dezember)
    for (const x of s) {
      const stunde = Number(new Date(x.start).toLocaleString('en-US', {
        timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false,
      }))
      expect(SLOT_STUNDEN).toContain(stunde)
    }
    // und die UTC-Stunde MUSS sich gegenüber dem Sommer unterscheiden
    const sommer = await freieSlots(db, MITTWOCH)
    const utcWinter = new Date(s[0].start).getUTCHours()
    const utcSommer = new Date(sommer[0].start).getUTCHours()
    expect(utcWinter).not.toBe(utcSommer)
  })

  it('liefert die Termine aufsteigend', async () => {
    const s = await freieSlots(db, MITTWOCH)
    const zeiten = s.map((x) => new Date(x.start).getTime())
    expect([...zeiten].sort((a, b) => a - b)).toEqual(zeiten)
  })

  /**
   * F-07 reserviert nichts — aber einen Termin anzubieten, den bereits jemand
   * gewuenscht hat, hiesse zwei Sachverstaendige in dasselbe Gespraech zu
   * setzen. Das laesst sich billig verhindern.
   */
  it('laesst bereits gewuenschte Zeiten aus', async () => {
    const alle = await freieSlots(db, MITTWOCH)
    state.belegt = [alle[0].start, alle[2].start]

    const uebrig = await freieSlots(db, MITTWOCH)
    expect(uebrig.map((x) => x.start)).not.toContain(alle[0].start)
    expect(uebrig.map((x) => x.start)).not.toContain(alle[2].start)
    expect(uebrig).toHaveLength(6)          // wird hinten aufgefuellt
  })

  it('beschriftet deutsch und kurz', async () => {
    const s = await freieSlots(db, MITTWOCH)
    for (const x of s) expect(x.label).toMatch(/^(Mo|Di|Mi|Do|Fr) \d{1,2}\.\d{1,2}\. · \d{2}:\d{2}$/)
  })

  /**
   * ⚠ Ein Lesefehler darf nicht dazu fuehren, dass belegte Zeiten wieder
   * angeboten werden. Im Zweifel gar keine Slots — das ist sichtbar und
   * behebbar; eine Doppelbuchung merkt erst der Vertrieb im Gespraech.
   */
  it('liefert bei einem Lesefehler KEINE Slots, statt alle anzubieten', async () => {
    state.fehler = 'permission denied'
    await expect(freieSlots(db, MITTWOCH)).resolves.toEqual([])
  })
})
