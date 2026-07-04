import type { Segment, WbwHeuristikBand } from './types'

export type WbwErgebnis = {
  wbwMin: number; wbwMax: number
  restwertMin: number; restwertMax: number
  quelle: 'vision' | 'vision-geklemmt' | 'heuristik'
}

type VisionWbw = {
  wiederbeschaffungswert_min?: number | null
  wiederbeschaffungswert_max?: number | null
  restwert_min?: number | null
  restwert_max?: number | null
}

const KORRIDOR_MIN = 0.6
const KORRIDOR_MAX = 1.6

function findeBand(segment: Segment, alter: number, heuristik: WbwHeuristikBand[]): WbwHeuristikBand | null {
  const kandidaten = heuristik.filter((b) => b.segment === segment).sort((a, b) => a.alterBisJahre - b.alterBisJahre)
  return kandidaten.find((b) => alter <= b.alterBisJahre) ?? kandidaten[kandidaten.length - 1] ?? null
}

function mittleresBand(segment: Segment, heuristik: WbwHeuristikBand[]): WbwHeuristikBand | null {
  const k = heuristik.filter((b) => b.segment === segment).sort((a, b) => a.alterBisJahre - b.alterBisJahre)
  return k[Math.floor((k.length - 1) / 2)] ?? null
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n))
}

export function plausibilisiereWbw(
  vision: VisionWbw,
  segment: Segment,
  alterJahre: number | null,
  heuristik: WbwHeuristikBand[],
): WbwErgebnis {
  const band = alterJahre != null ? findeBand(segment, alterJahre, heuristik) : mittleresBand(segment, heuristik)
  const hMin = band?.wbwMinEur ?? 0
  const hMax = band?.wbwMaxEur ?? 0
  const rFaktor = band?.restwertFaktor ?? 0.25

  const vMin = vision.wiederbeschaffungswert_min
  const vMax = vision.wiederbeschaffungswert_max
  const hatVision = typeof vMin === 'number' && typeof vMax === 'number' && vMin > 0 && vMax > 0

  if (!hatVision || !band) {
    return {
      wbwMin: hMin, wbwMax: hMax,
      restwertMin: Math.round(hMin * rFaktor), restwertMax: Math.round(hMax * rFaktor),
      quelle: 'heuristik',
    }
  }

  const lo = hMin * KORRIDOR_MIN
  const hi = hMax * KORRIDOR_MAX
  const imKorridor = (vMin as number) >= lo && (vMax as number) <= hi
  const wbwMin = Math.round(clamp(vMin as number, lo, hi))
  const wbwMax = Math.round(clamp(vMax as number, lo, hi))

  const rMin = typeof vision.restwert_min === 'number' && vision.restwert_min > 0 ? vision.restwert_min : wbwMin * rFaktor
  const rMax = typeof vision.restwert_max === 'number' && vision.restwert_max > 0 ? vision.restwert_max : wbwMax * rFaktor

  return {
    wbwMin, wbwMax,
    restwertMin: Math.round(rMin), restwertMax: Math.round(rMax),
    quelle: imKorridor ? 'vision' : 'vision-geklemmt',
  }
}
