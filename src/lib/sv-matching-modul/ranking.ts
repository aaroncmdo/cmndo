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

/** Minimal-Form von TagVerfuegbarkeit (strukturell kompatibel, entkoppelt von slots.ts). */
export type TagSlotsInput = { datum: string; slots: { uhrzeit: string; dauer: number }[] }

const WUNSCH_FENSTER_MS = 30 * 60_000
const NAHE_FENSTER_MS = 1.5 * 24 * 60 * 60_000
const PRIO: Record<SlotVorschlag['matchType'], number> = {
  wunschtermin: 0,
  gleicher_tag: 1,
  nahe: 2,
  nach: 3,
}

function wallToMs(wall: string): number {
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return NaN
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], m[6] ? +m[6] : 0)
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function msToWall(ms: number): string {
  const d = new Date(ms)
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
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
  const alle: SlotVorschlag[] = []
  for (const tag of tage) {
    for (const slot of tag.slots ?? []) {
      const start = `${tag.datum}T${slot.uhrzeit}:00`
      const startMs = wallToMs(start)
      const end = Number.isNaN(startMs)
        ? start
        : msToWall(startMs + (slot.dauer ?? 45) * 60_000)
      alle.push({ start, end, matchType: classifySlot(start, wunschterminWall) })
    }
  }

  const wunschMs = wunschterminWall ? wallToMs(wunschterminWall) : null
  alle.sort((x, y) => {
    const px = PRIO[x.matchType]
    const py = PRIO[y.matchType]
    if (px !== py) return px - py
    if (wunschMs != null && !Number.isNaN(wunschMs)) {
      return Math.abs(wallToMs(x.start) - wunschMs) - Math.abs(wallToMs(y.start) - wunschMs)
    }
    return wallToMs(x.start) - wallToMs(y.start)
  })

  return alle.slice(0, limit)
}
