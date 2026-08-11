// Nutzungsausfall-Rechner — pure Logik, zero deps (Muster: wertminderung.ts).
//
// DATENBASIS: Orientierungs-Spannen, 1:1 gespiegelt aus autounfall-io/lib/tools/
// rechner-data.ts (NUTZ) — bewusst KEINE Punktwerte aus einer geschuetzten
// Sanden/Danner-Liste, und bewusst identisch zu autounfall.io, damit unsere
// Properties fuer dieselbe Frage nicht widerspruechliche Zahlen zeigen.
// Bezeichnung + Beispielfahrzeuge stammen aus der App-Migration
// 20260707225412_nutzungsausfall_klasse_saetze (unabhaengig von den Euro-Werten).
//
// Die Alters-Ruecktufung spiegelt src/lib/anspruch/nutzungsausfall-klasse.ts
// (>10 Jahre = 2 Klassen runter, >5 Jahre = 1 Klasse, geclamped bei A).

export type NaKlasse = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L'

export interface NaKlasseInfo {
  klasse: NaKlasse
  /** €/Tag als [min, max]-Orientierungsspanne */
  satz: readonly [number, number]
  bezeichnung: string
  beispiele: string
}

/** Reihenfolge = aufsteigende Fahrzeugklasse (Index 0 = kleinste). Kein "I". */
export const NA_KLASSEN: readonly NaKlasseInfo[] = [
  { klasse: 'A', satz: [23, 27], bezeichnung: 'Kleinstwagen', beispiele: 'Smart, VW up!' },
  { klasse: 'B', satz: [29, 35], bezeichnung: 'Kleinwagen', beispiele: 'VW Polo, Ford Fiesta, Opel Corsa' },
  { klasse: 'C', satz: [38, 43], bezeichnung: 'Kompaktklasse', beispiele: 'VW Golf (Basis), Opel Astra' },
  { klasse: 'D', satz: [50, 59], bezeichnung: 'untere Mittelklasse', beispiele: 'VW Golf (stärker motorisiert), Ford Focus' },
  { klasse: 'E', satz: [59, 65], bezeichnung: 'Mittelklasse', beispiele: 'VW Passat, BMW 3er' },
  { klasse: 'F', satz: [65, 79], bezeichnung: 'obere Mittelklasse', beispiele: 'Audi A4, Mercedes C-Klasse' },
  { klasse: 'G', satz: [79, 99], bezeichnung: 'Oberklasse', beispiele: 'Audi A6, BMW 5er' },
  { klasse: 'H', satz: [99, 119], bezeichnung: 'Luxusklasse', beispiele: 'Mercedes E-Klasse, Lexus ES' },
  { klasse: 'J', satz: [119, 139], bezeichnung: 'Oberklasse (SUV/Van)', beispiele: 'BMW X5, Audi Q7' },
  { klasse: 'K', satz: [139, 175], bezeichnung: 'Sportwagen/Oberklasse', beispiele: 'Porsche 911, Mercedes S-Klasse' },
  { klasse: 'L', satz: [175, 219], bezeichnung: 'Luxus-Sportwagen', beispiele: 'Lamborghini, Ferrari' },
] as const

/** Ab dieser Ausfalldauer weisen wir auf die uebliche Reparaturfall-Deckelung hin. */
export const LANGE_DAUER_TAGE = 14

export interface NaInput {
  klasse: string
  tage: number
  alterJahre?: number
}

export type NaResult =
  | { kind: 'unvollstaendig'; hinweise: string[] }
  | {
      kind: 'schaetzung'
      /** Gesamt-Spanne in Euro (Satz × Tage) */
      min: number
      max: number
      /** effektive Klasse nach Ruecktufung */
      klasse: NaKlasse
      /** Ausgangs-Klasse (Eingabe) */
      basis: NaKlasse
      /** um wie viele Klassen zurueckgestuft wurde (0 = keine) */
      stufen: number
      satzMin: number
      satzMax: number
      hinweise: string[]
    }

export function findeKlasse(klasse: string): NaKlasseInfo | undefined {
  return NA_KLASSEN.find((k) => k.klasse === klasse)
}

/** >10 Jahre → 2 Klassen runter, >5 Jahre → 1 Klasse, sonst 0. */
export function altersRueckstufung(alterJahre: number | undefined): number {
  if (alterJahre == null || !Number.isFinite(alterJahre) || alterJahre < 0) return 0
  if (alterJahre > 10) return 2
  if (alterJahre > 5) return 1
  return 0
}

export function computeNutzungsausfall(input: NaInput): NaResult {
  const basisInfo = findeKlasse(String(input.klasse ?? ''))
  const tage = Number(input.tage)

  if (!basisInfo || !Number.isFinite(tage) || tage <= 0) {
    return { kind: 'unvollstaendig', hinweise: [] }
  }

  const stufen = altersRueckstufung(input.alterJahre)
  const basisIdx = NA_KLASSEN.findIndex((k) => k.klasse === basisInfo.klasse)
  const effIdx = Math.max(0, basisIdx - stufen) // clamp bei A
  const eff = NA_KLASSEN[effIdx]
  const effektiveStufen = basisIdx - effIdx

  const hinweise: string[] = []
  if (effektiveStufen > 0) hinweise.push('rueckstufung')
  if (tage > LANGE_DAUER_TAGE) hinweise.push('lange_dauer')

  return {
    kind: 'schaetzung',
    min: Math.round(eff.satz[0] * tage),
    max: Math.round(eff.satz[1] * tage),
    klasse: eff.klasse,
    basis: basisInfo.klasse,
    stufen: effektiveStufen,
    satzMin: eff.satz[0],
    satzMax: eff.satz[1],
    hinweise,
  }
}
