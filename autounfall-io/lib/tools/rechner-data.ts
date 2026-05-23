// Rechner-Datenbasis + Helfer — 1:1 portiert aus assets-autounfall/au-rechner.js
// (Orientierungs-Spannen aus research/, keine geschuetzten Tabellen). Dieselben
// Tabellen/Funktionen liegen im Prototyp zusaetzlich im Wizard (UNFALL-ASSISTANCE.html);
// hier zentralisiert, damit Rechner + Wizard garantiert nicht auseinanderlaufen.
//
// WICHTIG (Logik-Treue WP-4): Werte + Interpolations-/Nearest-Logik exakt wie
// die Vorlage. bsOf() sortiert die Keys; rueckOf() nutzt die (fuer Integer-Keys
// aufsteigende) Object.keys-Reihenfolge und bevorzugt bei Gleichstand den
// kleineren Key (strikt-<). Beides bewusst 1:1 uebernommen.

/** Nutzungsausfall-Pauschale €/Tag je Fahrzeugklasse (Sanden-Danner-Groessenordnung). */
export const NUTZ: Record<string, readonly [number, number]> = {
  A: [23, 27],
  B: [29, 35],
  C: [38, 43],
  D: [50, 59],
  E: [59, 65],
  F: [65, 79],
  G: [79, 99],
  H: [99, 119],
  J: [119, 139],
  K: [139, 175],
  L: [175, 219],
}

/** Schmerzensgeld-Groessenordnung je Verletzung (§253 BGB, Einzelfall weicht ab). */
export const SCHMERZ: Record<string, readonly [number, number]> = {
  'HWS Grad 1 (leicht)': [250, 800],
  'HWS Grad 2 (Beschwerden, AU 1-4 Wo)': [800, 2000],
  'HWS Grad 3 (Befund, längere AU)': [2000, 5000],
  'Prellung/Quetschung (folgenlos)': [250, 1500],
  'Knochenbruch Finger/Zehen': [500, 2000],
  'Rippenbruch (folgenlos)': [1500, 4000],
  'Handgelenksfraktur': [2000, 6000],
  'Schlüsselbeinbruch': [1500, 5000],
  'Kreuzbandriss': [5000, 15000],
  'Schnittwunde mit Narbe': [1500, 5000],
}

// Beitragssatz % je SF-Klasse (Stuetzstellen) + lineare Interpolation dazwischen.
const BS: Record<number, number> = { 0: 100, 1: 70, 5: 50, 10: 38, 15: 32, 20: 28, 25: 26, 30: 24, 35: 22 }

export function bsOf(sf: number): number {
  const k = Object.keys(BS).map(Number).sort((a, b) => a - b)
  let lo = k[0]
  for (let i = 0; i < k.length; i++) {
    if (k[i] <= sf) lo = k[i]
  }
  let hi: number | undefined = k.find((x) => x >= sf)
  if (hi == null) hi = k[k.length - 1]
  if (lo === hi) return BS[lo]
  return BS[lo] + (BS[hi] - BS[lo]) * ((sf - lo) / (hi - lo))
}

// Ziel-SF-Klasse nach EINEM Schaden (Stuetzstellen) + Nearest-Match.
const RUECK: Record<number, number> = { 35: 23, 30: 19, 25: 16, 20: 12, 15: 7, 10: 4, 7: 2, 5: 1, 3: 0, 1: 0 }

export function rueckOf(sf: number): number {
  const k = Object.keys(RUECK).map(Number)
  let best = k[0]
  for (let i = 0; i < k.length; i++) {
    if (Math.abs(k[i] - sf) < Math.abs(best - sf)) best = k[i]
  }
  return RUECK[best]
}

/** de-DE Tausenderpunkt, gerundet — wie au-rechner.js `eur()`. */
export function eur(n: number): string {
  return Math.round(n).toLocaleString('de-DE')
}
