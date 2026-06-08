// AAR-50: Dispatch-Algorithmus — findBestSV
// Findet die besten Sachverständigen für einen Fall basierend auf:
// - Aktivität + nicht gesperrt
// - Urlaub-Check
// - Kontingent (Paket-Limit vs. genutzte Fälle)
// - Distanz (Isochrone oder Radius)
// - Paket-Prio (premium > pro > standard)
// - Balance (wenig offene Fälle bevorzugt)
// - Ablehnungsrate (wenig Ablehnungen bevorzugt)

import { getBusyWindows, type BusyWindow } from '@/lib/google-calendar/freebusy'
import { precomputeSvSlotEtas, isSlotReachable } from './reachability'
import { berlinWallClockToUtc, toBerlinWallClock } from '@/lib/google-calendar/timezone'
import {
  TERMIN_DAUER_MIN,
  TERMIN_PUFFER_MIN,
} from './termin-konstanten'
import { findBestSVviaEngine } from './findBestSV-via-engine'

export type SvMatchInput = {
  fallLat: number
  fallLng: number
  terminDatum?: string // ISO-Datum optional (für Urlaub-Check)
  // AAR-264: Wunschtermin des Kunden — wenn gesetzt, prüfen wir pro SV ob er
  // im ±wunschterminFensterMin-Fenster bereits einen anderen Termin hat.
  wunschterminIso?: string | null
  wunschterminFensterMin?: number
  // Sticky-SV: bevorzuge diesen SV (kunde hatte ihn schon mal) — er bekommt
  // einen massiven Score-Bonus + "Sticky"-Reason-Badge, sonst normale Logik.
  stickySvId?: string | null
  // AAR-939 6b: bei der Verlegung den No-Show-SV aus dem Kandidaten-Set werfen.
  excludeSvId?: string | null
}

export type SvMatchCandidate = {
  svId: string
  profileId: string | null
  name: string
  paket: string
  distanzKm: number
  /** Echte Mapbox-Driving-ETA Büro → Fall in Minuten. null bei API-Fehler. */
  etaFromBueroMin: number | null
  offeneFaelle: number
  kontingentFrei: number
  ablehnungen30d: number
  score: number
  // Badge-Gründe für UI
  reasons: string[]
  // AAR-264: Wunschtermin-Verfügbarkeit (nur gesetzt wenn wunschterminIso übergeben)
  verfuegbarAmWunschtermin?: boolean
  naechsterFreierSlot?: string | null
}

export const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
  basic: 0,
}

/**
 * Basic-SVs (paket='basic') haben kein Fall-Kontingent — sie werden rein
 * kalender-/verfuegbarkeitsbasiert beruecksichtigt und pro Lead abgerechnet.
 * Alle anderen Pakete: kein freies Kontingent => raus.
 */
export function istKontingentBlockiert(paket: string, kontingentFrei: number): boolean {
  if (paket === 'basic') return false
  return kontingentFrei <= 0
}

/**
 * AAR-50 Dispatch-Matching — seit Sub-A.3 ein Thin-Wrapper.
 *
 * Delegiert an die universelle Termin-Engine (`findeBestePerson` via
 * `findBestSVviaEngine`-Adapter). Signatur (`SvMatchInput` → `SvMatchCandidate[]`)
 * und Rueckgabe-Shape sind unveraendert → alle Consumer (Dispatch, Self-Service,
 * Verlegung) erben die Engine transparent. Aequivalenz im Shadow-Diff bewiesen
 * (PASS_TOP1, Top-1 3/3 identisch).
 */
export async function findBestSV(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  return findBestSVviaEngine(input, limit)
}

// AAR-264 + AAR-719: Sucht den nächsten freien Slot ab einem Start-
// zeitpunkt für einen SV. Berücksichtigt jetzt ZUSÄTZLICH zum
// gutachter_termine-Check auch den privaten Kalender (Google + CalDAV).
//
// Slot-Geometrie (AAR-718):
//   * Termin-Dauer: TERMIN_DAUER_MIN (45)
//   * Puffer beidseitig: TERMIN_PUFFER_MIN (60)
//   * Gesperrtes Fenster um einen Slot-Start `t`: [t - 60min, t + 45min + 60min]
//
// Performance: Busy-Windows werden 1x pro SV für die ganze 12-Wochen-
// Suche vorab geladen — nicht pro Slot ein API-Call.
//
// Werktage Mo–Fr 09:00–16:00 Start, 30-min-Grid. Fail-open bei
// Kalender-Fehler — dann fällt der Slot-Finder auf das vorherige
// gutachter_termine-Only-Verhalten zurück.
 
// Exportiert fuer den TZ-Unit-Test (AAR-958). Sonst nur intern genutzt.
export async function findNextFreeSlotForSv(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  svId: string,
  ab: Date,
  profileId?: string | null,
  candidate?: { lat: number; lng: number } | null,
): Promise<string | null> {
  const inZwoelfWochen = new Date(ab.getTime() + 12 * 7 * 24 * 60 * 60 * 1000)

  const { data: bestehend } = await db
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', ab.toISOString())
    .lte('start_zeit', inZwoelfWochen.toISOString())
    .order('start_zeit', { ascending: true })

  // AAR-2026-05-07: Per-SV Wochentag-Sperre. Default ist [] (kein Block über
  // Wochenende-Hardcode hinaus). SVs koennen z.B. [2,3,4] = Di/Mi/Do setzen.
  const { data: svRow } = await db
    .from('sachverstaendige')
    .select('blockierte_wochentage')
    .eq('id', svId)
    .maybeSingle()
  const blockierteWochentage = new Set<number>(
    ((svRow?.blockierte_wochentage as number[] | null) ?? []) as number[],
  )

  // AAR-719: Private Kalender-Busy-Windows vorab laden.
  let busyWindows: BusyWindow[] = []
  if (profileId) {
    busyWindows = await getBusyWindows(profileId, ab.toISOString(), inZwoelfWochen.toISOString())
  }

  // AAR-CMM PR B: ETA-Vorberechnung — eine Mapbox-Matrix-Call statt
  // pro-Slot-Lookup. Wenn keine Candidate-Location übergeben wird, läuft
  // die Suche wie bisher (nur direkte Konflikt-Checks ohne ETA).
  const slotEtaCtx = candidate
    ? await precomputeSvSlotEtas(db, svId, candidate, ab.toISOString(), inZwoelfWochen.toISOString())
    : null

  const kandidat = new Date(ab)
  // Bei Konflikt am exakten Wunschtermin → ab nächstem halbstündigem Slot weiter.
  kandidat.setUTCMinutes(kandidat.getUTCMinutes() >= 30 ? 60 : 30, 0, 0)

  // AAR-958: Das Slot-Fenster sind Berlin-Geschaeftszeiten (Mo–Fr 09:00–16:00).
  // Auf UTC-Node liefern getHours/getDay/setHours UTC -> +1/+2h-Versatz. Daher
  // Wochentag/Stunde aus der Berlin-Wall-Clock ableiten + Tageswechsel ueber
  // berlinWallClockToUtc (DST-korrekt). `kandidat` bleibt der echte UTC-Instant,
  // damit Konflikt-Checks (gegen UTC-Instants) + Output korrekt sind.
  const berlinParts = (d: Date) => {
    const wall = toBerlinWallClock(d.toISOString()) // "YYYY-MM-DDTHH:mm:ss"
    return {
      datum: wall.slice(0, 10),
      stunde: Number(wall.slice(11, 13)),
      wochentag: new Date(`${wall.slice(0, 10)}T00:00:00Z`).getUTCDay(),
    }
  }
  const weiter = () => {
    kandidat.setTime(kandidat.getTime() + 30 * 60_000)
    const { datum, stunde } = berlinParts(kandidat)
    if (stunde >= 17) {
      const naechster = new Date(`${datum}T00:00:00Z`)
      naechster.setUTCDate(naechster.getUTCDate() + 1)
      kandidat.setTime(
        new Date(berlinWallClockToUtc(`${naechster.toISOString().slice(0, 10)}T09:00:00`)).getTime(),
      )
    }
  }

  const maxIter = 12 * 7 * 24 * 2 // 30-min-Grid statt 60-min
  let i = 0
  while (kandidat < inZwoelfWochen && i < maxIter) {
    i++
    const { stunde, wochentag } = berlinParts(kandidat)
    if (
      wochentag !== 0 &&
      wochentag !== 6 &&
      !blockierteWochentage.has(wochentag) &&
      stunde >= 9 &&
      stunde < 16
    ) {
      // Fenster um den Slot-Start: [t-puffer, t+dauer+puffer]
      const fensterStart = new Date(kandidat.getTime() - TERMIN_PUFFER_MIN * 60_000)
      const fensterEnd = new Date(kandidat.getTime() + (TERMIN_DAUER_MIN + TERMIN_PUFFER_MIN) * 60_000)

      const konfliktIntern = ((bestehend ?? []) as { start_zeit: string; end_zeit: string }[]).some((b) =>
        new Date(b.start_zeit) < fensterEnd && new Date(b.end_zeit) > fensterStart,
      )
      const konfliktPrivat = busyWindows.some((b) =>
        new Date(b.start) < fensterEnd && new Date(b.end) > fensterStart,
      )

      if (!konfliktIntern && !konfliktPrivat) {
        // ETA-Reachability als zusätzlicher Filter
        if (slotEtaCtx) {
          const slotEnde = new Date(kandidat.getTime() + TERMIN_DAUER_MIN * 60_000)
          const reach = isSlotReachable(kandidat, slotEnde, slotEtaCtx)
          if (!reach.reachable) {
            // Slot frei aber unerreichbar — weitersuchen
            weiter()
            continue
          }
        }
        return kandidat.toISOString()
      }
    }
    // Zum nächsten 30-min-Slot weiter.
    weiter()
  }
  return null
}
