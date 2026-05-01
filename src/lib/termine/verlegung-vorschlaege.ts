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
import { fahrtMinutenLatLng, createRouteCache, type RouteCache } from '../mapbox/route'

export const DEFAULT_SLOT_MIN = 45
const ARBEITSTAG_VON_STUNDE = 8
const ARBEITSTAG_BIS_STUNDE = 18
const FENSTER_TAGE_DEFAULT = 14
const PUFFER_GRUEN_MIN = 10

const KUNDE_ALTERNATIVE_OFFSET_MIN = 30
const KUNDE_ALTERNATIVE_MAX_TAGE_VORWAERTS = 7

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
  /** Lat/Lng des Besichtigungsorts (verschobener Fall). Aaron-Spec:
   *  Besichtigungsort wird im Dispatch via Koordinate zugeordnet, daher
   *  Routen-Berechnung direkt über lat/lng (kein Geocoding nötig). */
  besichtigungsortLat: number
  besichtigungsortLng: number
  /** Anzeige-Label für die UI (formatierte Adresse). */
  besichtigungsortLabel: string
  /** Dauer des neuen Slots in Minuten. Default 45 (Aaron-Spec). */
  slotDauerMin?: number
  /** Tagesfenster ab heute. Default 14 Tage. */
  fensterTage?: number
  /** ID des zu verschiebenden Termins — wird im Tagesplan ignoriert. */
  exkludiereTerminId?: string
  /** SV-Standort als Fallback, wenn an einem Tag kein Vor-Termin existiert.
   *  Lat/Lng + Anzeige-Label. */
  svStandort?: { lat: number; lng: number; label: string } | null
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
        zielLat: optionen.besichtigungsortLat,
        zielLng: optionen.besichtigungsortLng,
        zielLabel: optionen.besichtigungsortLabel,
        svStandort: optionen.svStandort ?? null,
        cache,
        tagOffset,
      })
      if (slot) kandidaten.push(slot)
    }
  }

  console.log('[AAR-864] findVerlegungsVorschlaege: tagesplan =', tagesplan.length, '| gefiltert =', tagesplanGefiltert.length, '| kandidaten =', kandidaten.length)

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
  zielLat: number
  zielLng: number
  zielLabel: string
  svStandort: { lat: number; lng: number; label: string } | null
  cache: RouteCache
  tagOffset: number
}

async function bewerteSlot({
  slotStart,
  slotEnd,
  vorTermin,
  nachTermin,
  zielLat,
  zielLng,
  svStandort,
  cache,
  tagOffset,
}: BewerteParams): Promise<VerlegungsVorschlag | null> {
  let vor: VerlegungsVorschlag['vor'] = null
  let nach: VerlegungsVorschlag['nach'] = null
  let pufferVorMin: number | null = null
  let pufferNachMin: number | null = null
  let fahrtVor = 0
  let fahrtNach = 0

  if (vorTermin && vorTermin.lat != null && vorTermin.lng != null) {
    const min = await fahrtMinutenLatLng(
      vorTermin.lat,
      vorTermin.lng,
      zielLat,
      zielLng,
      cache,
    )
    // Mapbox-Fail nicht als „unschaffbar" werten — Slot behalten,
    // Routen-Info wird im UI als „Routen-Check unbekannt" angezeigt.
    if (min !== null) {
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
    }
  } else if (!vorTermin && svStandort) {
    const min = await fahrtMinutenLatLng(
      svStandort.lat,
      svStandort.lng,
      zielLat,
      zielLng,
      cache,
    )
    if (min !== null) {
      fahrtVor = min
      vor = {
        quelle: 'buero',
        terminId: null,
        end: null,
        adresse: svStandort.label,
        fahrtMin: min,
        pufferMin: null,
      }
    }
  }

  if (nachTermin && nachTermin.lat != null && nachTermin.lng != null) {
    const min = await fahrtMinutenLatLng(
      zielLat,
      zielLng,
      nachTermin.lat,
      nachTermin.lng,
      cache,
    )
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

  // 'buero'-Quelle hat keinen Puffer-Anker (kein Vortermin der endet) —
  // der SV kann vom Büro früher losfahren. Deshalb immer 'green' für
  // buero-Quelle, unabhängig von pufferVorMin (der bei buero null bleibt).
  const ampelVor = !vor
    ? 'green'
    : vor.quelle === 'buero'
      ? 'green'
      : ampelFor(pufferVorMin)
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

// ─────────────────────────────────────────────────────────────────────
// AAR-864 Kunde-Verlegung: Free-Busy-Check + Alternativen-Suche
// ─────────────────────────────────────────────────────────────────────

/**
 * Prüft ob der SV im gewünschten Zeitfenster einen blockierenden Termin hat.
 * Aktiv = bestaetigt | reserviert | verlegt | verlegung_pending.
 */
export async function istSlotFrei(
  supabase: SupabaseClient,
  svId: string,
  startIso: string,
  endIso: string,
  exkludiereTerminId?: string,
): Promise<boolean> {
  let q = supabase
    .from('gutachter_termine')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', svId)
    .in('status', ['bestaetigt', 'reserviert', 'verlegt', 'verlegung_pending'])
    .lt('start_zeit', endIso)
    .gt('end_zeit', startIso)
  if (exkludiereTerminId) q = q.neq('id', exkludiereTerminId)
  const { count, error } = await q
  if (error) {
    console.warn('[AAR-864] istSlotFrei Query-Fehler', error)
    return false
  }
  return (count ?? 0) === 0
}

export type KundenAlternative = {
  /** Slot-Start-ISO. */
  start: string
  /** Slot-Ende-ISO. */
  end: string
  /** Beschriftung für UI ('Früher heute', 'Später heute', 'Morgen', '+ 2 Tage', …). */
  label: string
  /** Datum als YYYY-MM-DD für Gruppierung. */
  datum: string
  /** Diff zum Wunschslot in Tagen + Minuten — für UI „X Tage später". */
  diffTage: number
  diffMinuten: number
}

/**
 * Findet bis zu drei nahe Alternativen wenn der Kunden-Wunschslot belegt ist:
 *  1. „Früher heute"   — frühster freier Slot vor dem Wunschstart am gleichen Tag
 *  2. „Später heute"   — frühster freier Slot nach dem Wunschende am gleichen Tag
 *  3. „Anderer Tag"    — gleiche Uhrzeit am nächsten freien Tag (bis +7 Tage)
 *
 * Aaron-Spec: Kunde sieht NICHT den vollständigen SV-Kalender — nur Frei/Belegt
 * pro Kandidat, und nur drei Alternativen werden zurückgegeben.
 */
export async function findAlternativenZuWunschslot(
  supabase: SupabaseClient,
  svId: string,
  wunschStartIso: string,
  slotDauerMin: number,
  exkludiereTerminId?: string,
): Promise<KundenAlternative[]> {
  const wunschStart = new Date(wunschStartIso)
  const out: KundenAlternative[] = []

  function fmtTag(d: Date): string {
    return d.toISOString().slice(0, 10)
  }

  function diffMin(target: Date): number {
    return Math.round((target.getTime() - wunschStart.getTime()) / 60_000)
  }

  function diffTage(target: Date): number {
    const a = new Date(wunschStart)
    a.setHours(0, 0, 0, 0)
    const b = new Date(target)
    b.setHours(0, 0, 0, 0)
    return Math.round((b.getTime() - a.getTime()) / 86_400_000)
  }

  // ── 1. Früher heute ──────────────────────────────────────────────
  const heuteStart = new Date(wunschStart)
  heuteStart.setHours(ARBEITSTAG_VON_STUNDE, 0, 0, 0)
  for (
    let probe = new Date(wunschStart);
    probe.getTime() > heuteStart.getTime();
    probe.setMinutes(probe.getMinutes() - KUNDE_ALTERNATIVE_OFFSET_MIN)
  ) {
    const candStart = new Date(probe.getTime() - KUNDE_ALTERNATIVE_OFFSET_MIN * 60_000)
    if (candStart.getTime() < heuteStart.getTime()) break
    const candEnd = new Date(candStart.getTime() + slotDauerMin * 60_000)
    if (await istSlotFrei(supabase, svId, candStart.toISOString(), candEnd.toISOString(), exkludiereTerminId)) {
      out.push({
        start: candStart.toISOString(),
        end: candEnd.toISOString(),
        label: 'Früher heute',
        datum: fmtTag(candStart),
        diffTage: 0,
        diffMinuten: diffMin(candStart),
      })
      break
    }
  }

  // ── 2. Später heute ──────────────────────────────────────────────
  const heuteEnde = new Date(wunschStart)
  heuteEnde.setHours(ARBEITSTAG_BIS_STUNDE, 0, 0, 0)
  for (
    let probe = new Date(wunschStart.getTime() + slotDauerMin * 60_000);
    probe.getTime() < heuteEnde.getTime();
    probe.setMinutes(probe.getMinutes() + KUNDE_ALTERNATIVE_OFFSET_MIN)
  ) {
    const candStart = new Date(probe.getTime() + KUNDE_ALTERNATIVE_OFFSET_MIN * 60_000)
    const candEnd = new Date(candStart.getTime() + slotDauerMin * 60_000)
    if (candEnd.getTime() > heuteEnde.getTime()) break
    if (await istSlotFrei(supabase, svId, candStart.toISOString(), candEnd.toISOString(), exkludiereTerminId)) {
      out.push({
        start: candStart.toISOString(),
        end: candEnd.toISOString(),
        label: 'Später heute',
        datum: fmtTag(candStart),
        diffTage: 0,
        diffMinuten: diffMin(candStart),
      })
      break
    }
  }

  // ── 3. Anderer Tag, gleiche Uhrzeit ──────────────────────────────
  for (let tagOffset = 1; tagOffset <= KUNDE_ALTERNATIVE_MAX_TAGE_VORWAERTS; tagOffset++) {
    const candStart = new Date(wunschStart)
    candStart.setDate(candStart.getDate() + tagOffset)
    const candEnd = new Date(candStart.getTime() + slotDauerMin * 60_000)
    if (await istSlotFrei(supabase, svId, candStart.toISOString(), candEnd.toISOString(), exkludiereTerminId)) {
      out.push({
        start: candStart.toISOString(),
        end: candEnd.toISOString(),
        label:
          tagOffset === 1
            ? 'Morgen, gleiche Uhrzeit'
            : `+${tagOffset} Tage, gleiche Uhrzeit`,
        datum: fmtTag(candStart),
        diffTage: tagOffset,
        diffMinuten: diffMin(candStart),
      })
      break
    }
  }

  return out
}
