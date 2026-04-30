// AAR-864: Engine für Termin-Verlegungs-Vorschläge.
//
// Berechnet die Top-3 nahesten Slots für den SV, in denen er den zu
// verlegenden Termin neu legen kann — unter Berücksichtigung der Routen
// von Vor- und Nach-Termin am gleichen Tag (Mapbox).
//
// Score = tageVerschiebung × 1.0 + (fahrt_vor + fahrt_nach) × 0.05
// Ampel = grün ≥ 10 min Puffer, gelb 0–10, rot < 0.
// Top 3 sind primär grüne Slots; falls weniger als 3 grüne, wird mit
// gelben aufgefüllt.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getSvTagesplan, type TagesplanTermin } from './get-sv-tagesplan'
import { fahrtMinuten, createRouteCache, type RouteCache } from '../mapbox/route'

export const DEFAULT_SLOT_MIN = 45
const ARBEITSTAG_VON_STUNDE = 8
const ARBEITSTAG_BIS_STUNDE = 18
const FENSTER_TAGE_DEFAULT = 14
const PUFFER_GRUEN_MIN = 10

export type Ampel = 'green' | 'yellow' | 'red'

export type VerlegungsVorschlag = {
  /** ISO-String des vorgeschlagenen Slot-Starts. */
  start: string
  /** ISO-String des vorgeschlagenen Slot-Endes. */
  end: string
  /** Datum als YYYY-MM-DD für Gruppierung im UI. */
  datum: string
  ampel: Ampel
  vor: {
    /** 'vor_termin' = anderer Auftrag am gleichen Tag, 'buero' = SV-Standort */
    quelle: 'vor_termin' | 'buero'
    /** terminId nur wenn quelle='vor_termin' */
    terminId: string | null
    /** end-Zeit nur wenn quelle='vor_termin' */
    end: string | null
    adresse: string
    fahrtMin: number
    /** Puffer nur sinnvoll bei quelle='vor_termin'; bei 'buero' = null */
    pufferMin: number | null
  } | null
  nach: {
    terminId: string
    start: string
    adresse: string
    fahrtMin: number
    pufferMin: number
  } | null
  /** Score (kleiner = näher dran). */
  score: number
}

type Optionen = {
  /** Adresse des verschobenen Falls (= unverändert beim Verlegen). */
  besichtigungsortAdresse: string
  /** Dauer des neuen Slots in Minuten. Default 45 (Aaron-Spec). */
  slotDauerMin?: number
  /** Tagesfenster ab heute. Default 14 Tage. */
  fensterTage?: number
  /** ID des zu verschiebenden Termins — wird im Tagesplan ignoriert. */
  exkludiereTerminId?: string
  /** SV-Standort (Büro) als Fallback, wenn an einem Tag kein Vor-Termin
   *  existiert. Aaron-Spec: dann muss die Anfahrt vom Büro berechnet werden. */
  svStandortAdresse?: string | null
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function ampelFor(pufferMin: number | null): Ampel {
  if (pufferMin === null) return 'red'
  if (pufferMin < 0) return 'red'
  if (pufferMin < PUFFER_GRUEN_MIN) return 'yellow'
  return 'green'
}

/**
 * Engine: liefert Top-3 (oder weniger) Vorschläge für die Verlegung.
 * Wirft nicht — bei Fehlern leeres Array.
 */
export async function findVerlegungsVorschlaege(
  supabase: SupabaseClient,
  svId: string,
  optionen: Optionen,
): Promise<VerlegungsVorschlag[]> {
  const slotDauer = optionen.slotDauerMin ?? DEFAULT_SLOT_MIN
  const fensterTage = optionen.fensterTage ?? FENSTER_TAGE_DEFAULT
  const cache = createRouteCache()

  const heute = new Date()
  heute.setHours(0, 0, 0, 0)
  const fensterEnde = new Date(heute)
  fensterEnde.setDate(fensterEnde.getDate() + fensterTage)

  const tagesplan = await getSvTagesplan(
    supabase,
    svId,
    heute.toISOString(),
    fensterEnde.toISOString(),
  )

  const tagesplanGefiltert = optionen.exkludiereTerminId
    ? tagesplan.filter((t) => t.id !== optionen.exkludiereTerminId)
    : tagesplan

  const kandidaten: VerlegungsVorschlag[] = []

  for (let tagOffset = 0; tagOffset < fensterTage; tagOffset++) {
    const tag = new Date(heute)
    tag.setDate(tag.getDate() + tagOffset)
    const tagYmd = ymd(tag)
    const tagTermine = tagesplanGefiltert.filter((t) =>
      t.start_zeit.startsWith(tagYmd),
    )

    const luecken = berechneLuecken(tag, tagTermine, slotDauer)

    for (const luecke of luecken) {
      const slot = await bewerteSlot({
        slotStart: luecke.fruehesterStart,
        slotEnd: new Date(luecke.fruehesterStart.getTime() + slotDauer * 60_000),
        vorTermin: luecke.vor,
        nachTermin: luecke.nach,
        besichtigungsort: optionen.besichtigungsortAdresse,
        svStandortAdresse: optionen.svStandortAdresse ?? null,
        cache,
        tagOffset,
      })
      if (slot) kandidaten.push(slot)
    }
  }

  // Sortieren: erst Ampel (green > yellow > red), dann Score asc
  kandidaten.sort((a, b) => {
    const ampelRank: Record<Ampel, number> = { green: 0, yellow: 1, red: 2 }
    const ar = ampelRank[a.ampel] - ampelRank[b.ampel]
    if (ar !== 0) return ar
    return a.score - b.score
  })

  return kandidaten.slice(0, 3)
}

type Luecke = {
  fruehesterStart: Date
  vor: TagesplanTermin | null
  nach: TagesplanTermin | null
}

function berechneLuecken(
  tag: Date,
  tagTermine: TagesplanTermin[],
  slotDauerMin: number,
): Luecke[] {
  const luecken: Luecke[] = []
  const arbeitsBeginn = new Date(tag)
  arbeitsBeginn.setHours(ARBEITSTAG_VON_STUNDE, 0, 0, 0)
  const arbeitsEnde = new Date(tag)
  arbeitsEnde.setHours(ARBEITSTAG_BIS_STUNDE, 0, 0, 0)

  // Heute: keine Slots in der Vergangenheit
  const jetzt = new Date()
  if (tag.getTime() === toMidnight(jetzt).getTime() && jetzt > arbeitsBeginn) {
    arbeitsBeginn.setTime(roundUpTo15Min(jetzt).getTime())
  }

  if (tagTermine.length === 0) {
    if (arbeitsBeginn.getTime() + slotDauerMin * 60_000 <= arbeitsEnde.getTime()) {
      luecken.push({ fruehesterStart: arbeitsBeginn, vor: null, nach: null })
    }
    return luecken
  }

  // Lücke vor erstem Termin
  const erster = tagTermine[0]
  const ersterStart = new Date(erster.start_zeit)
  if (
    arbeitsBeginn.getTime() + slotDauerMin * 60_000 <= ersterStart.getTime()
  ) {
    luecken.push({ fruehesterStart: arbeitsBeginn, vor: null, nach: erster })
  }

  // Lücken zwischen Terminen
  for (let i = 0; i < tagTermine.length - 1; i++) {
    const vor = tagTermine[i]
    const nach = tagTermine[i + 1]
    const fruehst = roundUpTo15Min(new Date(vor.end_zeit))
    if (fruehst.getTime() + slotDauerMin * 60_000 <= new Date(nach.start_zeit).getTime()) {
      luecken.push({ fruehesterStart: fruehst, vor, nach })
    }
  }

  // Lücke nach letztem Termin
  const letzter = tagTermine[tagTermine.length - 1]
  const letzterEnd = roundUpTo15Min(new Date(letzter.end_zeit))
  if (letzterEnd.getTime() + slotDauerMin * 60_000 <= arbeitsEnde.getTime()) {
    luecken.push({ fruehesterStart: letzterEnd, vor: letzter, nach: null })
  }

  return luecken
}

function toMidnight(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function roundUpTo15Min(d: Date): Date {
  const x = new Date(d)
  const min = x.getMinutes()
  const rest = min % 15
  if (rest === 0 && x.getSeconds() === 0 && x.getMilliseconds() === 0) return x
  x.setMinutes(min + (15 - rest), 0, 0)
  return x
}

type BewerteParams = {
  slotStart: Date
  slotEnd: Date
  vorTermin: TagesplanTermin | null
  nachTermin: TagesplanTermin | null
  besichtigungsort: string
  svStandortAdresse: string | null
  cache: RouteCache
  tagOffset: number
}

async function bewerteSlot({
  slotStart,
  slotEnd,
  vorTermin,
  nachTermin,
  besichtigungsort,
  svStandortAdresse,
  cache,
  tagOffset,
}: BewerteParams): Promise<VerlegungsVorschlag | null> {
  let vor: VerlegungsVorschlag['vor'] = null
  let nach: VerlegungsVorschlag['nach'] = null
  let pufferVorMin: number | null = null
  let pufferNachMin: number | null = null
  let fahrtVor = 0
  let fahrtNach = 0

  if (vorTermin) {
    const min = await fahrtMinuten(vorTermin.adresse, besichtigungsort, cache)
    if (min === null) return null // Adresse-Pflicht: wenn Mapbox-Fail, Slot droppen
    fahrtVor = min
    const ankunft = new Date(new Date(vorTermin.end_zeit).getTime() + min * 60_000)
    pufferVorMin = Math.round((slotStart.getTime() - ankunft.getTime()) / 60_000)
    vor = {
      quelle: 'vor_termin',
      terminId: vorTermin.id,
      end: vorTermin.end_zeit,
      adresse: vorTermin.adresse,
      fahrtMin: min,
      pufferMin: pufferVorMin,
    }
  } else if (svStandortAdresse) {
    // AAR-864: Kein Vor-Termin → Anfahrt vom SV-Büro berechnen
    const min = await fahrtMinuten(svStandortAdresse, besichtigungsort, cache)
    if (min !== null) {
      fahrtVor = min
      vor = {
        quelle: 'buero',
        terminId: null,
        end: null,
        adresse: svStandortAdresse,
        fahrtMin: min,
        pufferMin: null, // Kein Puffer-Konzept beim Büro-Start
      }
    }
    // Wenn null: Slot bleibt ohne vor-Info, kein blocker — SV kommt
    // morgens irgendwann los.
  }

  if (nachTermin) {
    const min = await fahrtMinuten(besichtigungsort, nachTermin.adresse, cache)
    if (min === null) return null
    fahrtNach = min
    const abfahrtNoetig = new Date(slotEnd.getTime() + min * 60_000)
    pufferNachMin = Math.round(
      (new Date(nachTermin.start_zeit).getTime() - abfahrtNoetig.getTime()) / 60_000,
    )
    nach = {
      terminId: nachTermin.id,
      start: nachTermin.start_zeit,
      adresse: nachTermin.adresse,
      fahrtMin: min,
      pufferMin: pufferNachMin,
    }
  }

  // Slot droppen wenn beide Anker scheitern (rot)
  const ampelVor = vor ? ampelFor(pufferVorMin) : 'green'
  const ampelNach = nach ? ampelFor(pufferNachMin) : 'green'
  const ampelRank: Record<Ampel, number> = { green: 0, yellow: 1, red: 2 }
  const gesamt: Ampel =
    ampelRank[ampelVor] >= ampelRank[ampelNach] ? ampelVor : ampelNach

  if (gesamt === 'red') return null // unschaffbare Slots gar nicht zeigen

  const score = tagOffset * 1.0 + (fahrtVor + fahrtNach) * 0.05

  return {
    start: slotStart.toISOString(),
    end: slotEnd.toISOString(),
    datum: ymd(slotStart),
    ampel: gesamt,
    vor,
    nach,
    score,
  }
}
