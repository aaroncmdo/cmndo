// AAR-941: Slot-Ranking um den Wunschtermin (rein + deterministisch).
// Flacht die TagVerfuegbarkeit-Tage zu Wall-Clock-Slots ("YYYY-MM-DDTHH:mm:ss"
// ohne Offset — konsistent zur SlotField/reserviereSlot-Konvention) und
// klassifiziert nach Naehe zum Wunschtermin (1:1 zur Dispatch-classify-Logik).
//
// TZ-neutral: Wall-Clock-Strings werden via Date.UTC verglichen — die fiktive
// UTC-Interpretation hebt sich in Differenzen auf, daher CI-tz-unabhaengig.
// Der Aufrufer (matchAndSlots) reicht den Wunschtermin bereits als Berlin-
// Wall-Clock (toBerlinWallClock) herein, damit Slot- und Wunsch-Welt gleich sind.

import type { SlotVorschlag } from './types'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

/** Minimal-Form von TagVerfuegbarkeit (strukturell kompatibel, entkoppelt von slots.ts). */
export type TagSlotsInput = { datum: string; slots: { uhrzeit: string; dauer: number }[] }

const WUNSCH_FENSTER_MS = 30 * 60_000
const NAHE_FENSTER_MS = 1.5 * 24 * 60 * 60_000
const PRIO: Record<SlotVorschlag['matchType'], number> = {
  wunschtermin: 0,
  // Ops-Test RC-1: die geprueefte Wunschzeit-Anfrage rankt direkt hinter einem echten
  // Treffer — sie ist das, was der Kunde wollte, aber noch nicht bestaetigt.
  wunschtermin_anfrage: 1,
  gleicher_tag: 2,
  nahe: 3,
  nach: 4,
}

function wallToMs(wall: string): number {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0)
}

export function classifySlot(
  slotStartWall: string,
  wunschterminWall: string | null,
): SlotVorschlag['matchType'] {
  if (!wunschterminWall) return 'nach'
  const a = wallToMs(slotStartWall)
  const b = wallToMs(wunschterminWall)
  if (Number.isNaN(a) || Number.isNaN(b)) return 'nach'
  const diff = Math.abs(a - b)
  if (diff <= WUNSCH_FENSTER_MS) return 'wunschtermin'
  if (slotStartWall.slice(0, 10) === wunschterminWall.slice(0, 10)) return 'gleicher_tag'
  if (diff <= NAHE_FENSTER_MS) return 'nahe'
  return 'nach'
}

export function rankSlots(
  tage: TagSlotsInput[],
  wunschterminWall: string | null,
  limit = 6,
): SlotVorschlag[] {
  // AAR-956 TZ: intern wird in Berlin-Wall-Clock geranked (gegen wunschterminWall,
  // das der Caller als Berlin-Wall-Clock reicht); der ausgegebene start/end ist der
  // echte UTC-Instant -> Speicherung (start_zeit) + Anzeige eindeutig.
  const alle: Array<{ vorschlag: SlotVorschlag; wall: string }> = []
  for (const tag of tage) {
    for (const slot of tag.slots ?? []) {
      const wall = `${tag.datum}T${slot.uhrzeit}:00`
      const startUtc = berlinWallClockToUtc(wall)
      const endUtc = new Date(new Date(startUtc).getTime() + (slot.dauer ?? 45) * 60_000).toISOString()
      alle.push({
        vorschlag: { start: startUtc, end: endUtc, matchType: classifySlot(wall, wunschterminWall) },
        wall,
      })
    }
  }

  const wunschMs = wunschterminWall ? wallToMs(wunschterminWall) : null
  alle.sort((x, y) => {
    const px = PRIO[x.vorschlag.matchType]
    const py = PRIO[y.vorschlag.matchType]
    if (px !== py) return px - py
    if (wunschMs != null && !Number.isNaN(wunschMs)) {
      return Math.abs(wallToMs(x.wall) - wunschMs) - Math.abs(wallToMs(y.wall) - wunschMs)
    }
    return wallToMs(x.wall) - wallToMs(y.wall)
  })

  return alle.slice(0, limit).map((e) => e.vorschlag)
}
