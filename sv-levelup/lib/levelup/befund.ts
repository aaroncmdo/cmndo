import type { Db } from '../anreicherung/schreiben'
import { ladeCheck, type Check } from './check'
import type { Befund, Fehlstelle } from './modul-vertrag'
import { modulNachId, type ModulId, type Modus } from './registry'

export type ModulBefund = {
  id: ModulId
  titel: string
  punkte: number
  maximum: number
  befunde: Befund[]
  fehlstellen: Fehlstelle[]
}

export type TresorPhase = { nr: number; anzahl: number; aufwand: string }
export type Tresor = { anzahl: number; phasen: TresorPhase[] }

/**
 * Die Antwort von F-05.
 *
 * ⚠ Es gibt hier KEIN Feld `massnahmen` — nicht leer, nicht null, nicht
 * unscharf. Das ist R-E, und es ist der Grund, warum dieser Typ von Hand
 * geschrieben ist statt aus der Check-Zeile abgeleitet: was nicht im Typ steht,
 * kann kein Refactoring versehentlich durchreichen.
 */
export type BefundAntwort = {
  modus: Modus
  score: number | null
  keinScore: boolean
  punkteErhebbar: number
  istPunkte: number
  erhobenAm: string | null
  /** Nur wenn ein Rang gemessen wurde — der Weg `aufbau` lebt davon. */
  position: string | null
  module: ModulBefund[]
  tresor: Tresor
}

export type BefundErgebnis =
  | { ok: true; befund: BefundAntwort }
  | { ok: false; error: string }

type RohModul = { befunde?: Befund[]; istPunkte?: number; maxPunkte?: number }

/**
 * F-05 · Befund ausliefern — die Regel-E-Funktion.
 *
 * Was hier NICHT passiert, ist wichtiger als was passiert: Die Spalte
 * `massnahmen` wird für den Befund nicht gelesen (`CHECK_SPALTEN` führt sie
 * nicht), und der Rückgabetyp kennt sie nicht. Für den Tresor werden die
 * Maßnahmen in einer eigenen, eng begrenzten Abfrage nur GEZÄHLT.
 */
export async function baueBefund(db: Db, token: string): Promise<BefundErgebnis> {
  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }
  if (check.status !== 'fertig') return { ok: false, error: 'nicht_fertig' }
  if (Date.parse(check.gueltig_bis) < Date.now()) return { ok: false, error: 'abgelaufen' }

  const roh = (check.befunde ?? {}) as Record<string, RohModul>
  const fehlstellen = (check.fehlstellen ?? {}) as Record<string, Fehlstelle[]>

  // Nicht `module` nennen — Next verbietet den Namen (CommonJS-Kollision).
  // Der Schluessel in der Antwort heisst trotzdem `module`, so steht er in F-05.
  const modulBefunde: ModulBefund[] = []
  let istPunkte = 0

  // Über die GEWÄHLTEN Module gehen, nicht über die vorhandenen Befunde: ein
  // Modul, das gar nichts geliefert hat, soll im Befund sichtbar bleiben.
  for (const id of check.module_gewaehlt) {
    const m = roh[id]
    const stamm = modulNachId(id)
    istPunkte += m?.istPunkte ?? 0

    modulBefunde.push({
      id,
      titel: stamm?.titel ?? id,
      punkte: m?.istPunkte ?? 0,
      maximum: m?.maxPunkte ?? stamm?.punkte ?? 0,
      befunde: m?.befunde ?? [],
      fehlstellen: fehlstellen[id] ?? [],
    })
  }

  const tresor = await zaehleTresor(db, token)

  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'tresor_gesehen',
    payload: { anzahl: tresor.anzahl },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return {
    ok: true,
    befund: {
      modus: check.modus,
      score: check.score,
      keinScore: check.kein_score,
      punkteErhebbar: check.punkte_erhebbar ?? 0,
      istPunkte,
      erhobenAm: check.erhoben_am,
      position: findePosition(modulBefunde),
      module: modulBefunde,
      tresor,
    },
  }
}

/** Der Rang aus `wett` — die Kernaussage des Wegs `aufbau` („154. von 154"). */
function findePosition(module: ModulBefund[]): string | null {
  for (const m of module) {
    const rang = m.befunde.find((b) => b.schluessel === 'rang')
    if (rang && typeof rang.wert === 'string') return rang.wert
  }
  return null
}

type RohMassnahme = { ph?: number; a?: string }

/**
 * Zählt die Maßnahmen, ohne sie herauszugeben.
 *
 * Eigene Abfrage mit `select('massnahmen')` statt eines Feldes im Check-Objekt:
 * so bleibt der Weg der Maßnahmen an genau EINER Stelle im Code, die nichts
 * anderes tut als zählen. Ihre Rückgabe enthält keine Texte.
 */
export async function zaehleTresor(db: Db, token: string): Promise<Tresor> {
  const { data, error } = await db
    .from('levelup_checks')
    .select('massnahmen')
    .eq('token', token)
    .maybeSingle()

  if (error || !data) return { anzahl: 0, phasen: [] }

  const liste = ((data as { massnahmen?: unknown }).massnahmen ?? []) as RohMassnahme[]
  if (!Array.isArray(liste) || liste.length === 0) return { anzahl: 0, phasen: [] }

  const jePhase = new Map<number, { anzahl: number; minuten: number }>()
  for (const m of liste) {
    const nr = typeof m.ph === 'number' ? m.ph : 0
    const eintrag = jePhase.get(nr) ?? { anzahl: 0, minuten: 0 }
    eintrag.anzahl += 1
    eintrag.minuten += minutenAus(m.a)
    jePhase.set(nr, eintrag)
  }

  return {
    anzahl: liste.length,
    phasen: [...jePhase.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nr, e]) => ({ nr, anzahl: e.anzahl, aufwand: alsStunden(e.minuten) })),
  }
}

/** „30 min" / „2 h" / „1,5 h" → Minuten. Unbekanntes zählt als 0, nicht geraten. */
function minutenAus(text: string | undefined): number {
  if (!text) return 0
  const zahl = parseFloat(text.replace(',', '.'))
  if (Number.isNaN(zahl)) return 0
  return /\bh\b|stunde/i.test(text) ? Math.round(zahl * 60) : Math.round(zahl)
}

function alsStunden(minuten: number): string {
  const stunden = minuten / 60
  const gerundet = Math.round(stunden * 2) / 2      // auf halbe Stunden
  return `${String(gerundet).replace('.', ',')} h`
}

export type { Check }
