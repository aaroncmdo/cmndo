// AAR-50: Dispatch-Algorithmus — findBestSV
// Findet die besten Sachverständigen für einen Fall basierend auf:
// - Aktivität + nicht gesperrt
// - Urlaub-Check
// - Kontingent (Paket-Limit vs. genutzte Fälle)
// - Distanz (Isochrone oder Radius)
// - Paket-Prio (premium > pro > standard)
// - Balance (wenig offene Fälle bevorzugt)
// - Ablehnungsrate (wenig Ablehnungen bevorzugt)

import { createAdminClient } from '@/lib/supabase/admin'
import { parseIsochrone } from './isochrone-parse'
import { applyDispatchableFilter } from '@/lib/sv/queries'
import { checkSvFreeBusyBatch, getBusyWindows, type BusyWindow } from '@/lib/google-calendar/freebusy'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'
import { precomputeSvSlotEtas, isSlotReachable } from './reachability'
import {
  TERMIN_DAUER_MIN,
  TERMIN_PUFFER_MIN,
  naechsterWerktag10Uhr,
} from './termin-konstanten'

// AAR-CMM: Minimal-Puffer zwischen erreichbarem Termin und ETA-Eintreffen.
// Wenn ein SV von Termin A 10:45 endet und Termin B 11:00 beginnt, müssen
// 5 min Sicherheits-Puffer obendrauf (Aussteigen, Parken, Kunde finden).
const ETA_SICHERHEITS_PUFFER_MIN = 5

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

const PAKET_PRIO: Record<string, number> = {
  premium: 3, 'premium-50': 3,
  pro: 2, 'standard-25': 2,
  standard: 1, 'starter-10': 1,
}

// Haversine distance in km
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Point-in-polygon (ray-casting)
function pointInPolygon(point: [number, number], polygon: [number, number][]): boolean {
  const [x, y] = point
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i]
    const [xj, yj] = polygon[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export async function findBestSV(input: SvMatchInput, limit = 3): Promise<SvMatchCandidate[]> {
  const db = createAdminClient()
  const { fallLat, fallLng, terminDatum, wunschterminIso, wunschterminFensterMin } = input

  // AAR-718: Kalender-Check läuft IMMER. Wenn der Aufrufer keinen Wunsch-
  // termin übergibt, setzen wir einen impliziten Check-Zeitpunkt
  // (nächster Werktag 10:00) — der SV darf zu dem Zeitpunkt nicht
  // privat belegt sein, sonst kann der Dispatcher ihm realistisch keinen
  // Termin vorschlagen.
  //
  // Fenster um den Check-Termin: ±TERMIN_PUFFER_MIN (60) + TERMIN_DAUER_MIN
  // (45) = 60 min davor + 45 min Termin + 60 min danach = 165 min
  // Blockade-Fenster im Kalender, das NICHT mit einem privaten Event
  // überlappen darf.
  const effektiverCheckIso = wunschterminIso ?? naechsterWerktag10Uhr()
  const hatExplicitWunsch = !!wunschterminIso
  // Für den gutachter_termine-Konflikt-Check nutzen wir ein halbes Fenster
  // (vorne + Dauer) plus Puffer — strikt ±60 min UM den Termin.
  const blockadePufferMin = wunschterminFensterMin ?? TERMIN_PUFFER_MIN
  const terminDauerMin = TERMIN_DAUER_MIN

  let wunschterminStart: Date | null = null
  let wunschterminEnd: Date | null = null
  let wunschterminWindowStart: string | null = null
  let wunschterminWindowEnd: string | null = null
  {
    const wt = new Date(effektiverCheckIso)
    if (!Number.isNaN(wt.getTime())) {
      wunschterminStart = wt
      wunschterminEnd = new Date(wt.getTime() + terminDauerMin * 60_000)
      wunschterminWindowStart = new Date(wt.getTime() - blockadePufferMin * 60_000).toISOString()
      // Ende des Blockade-Fensters = Termin-Ende + Puffer dahinter
      wunschterminWindowEnd = new Date(wt.getTime() + (terminDauerMin + blockadePufferMin) * 60_000).toISOString()
    }
  }

  // AAR SV-Audit-Konsolidierung: applyDispatchableFilter ist die eine Wahrheit
  // für alle Matching-Endpoints. Filter: ist_aktiv=true + portal_zugang_
  // freigeschaltet=true + gesperrt_seit IS NULL + geloescht_am IS NULL.
  // Portal-Gate ist Pflicht — ein SV ohne durchgezogene Anzahlung darf keine
  // Fälle bekommen (Basis des Geschäftsmodells).
  // AAR-662: profiles-Embed mit FK-Hint. sachverstaendige hat 4 FKs auf
  // profiles — Default-Embed wirft PGRST201, data=null, `if (!svsRaw) return []`
  // verschluckte das still. Ergebnis in Prod: jedes findBestSV-Call lieferte
  // 0 Kandidaten, Dispatch zeigte „Keine SVs in Reichweite" unabhängig vom
  // Lead-Standort. AAR-657-Scan hat die Stelle verpasst, weil `sachverstaendige`
  // und `profiles(...)` auf getrennten Zeilen im Template-String stehen.
  const baseQuery = db
    .from('sachverstaendige')
    .select(
      'id, profile_id, paket, standort_lat, standort_lng, isochrone_polygon, ' +
        'paket_umkreis_km, ' +
        'paket_faelle_gesamt, paket_faelle_genutzt, offene_faelle, ' +
        'urlaub_von, urlaub_bis, ist_aktiv, gesperrt_seit, ablehnungen_30_tage, ' +
        'profiles!sachverstaendige_profile_id_fkey(vorname, nachname)',
    )
  const { data: svsRaw, error: svErr } = await applyDispatchableFilter(baseQuery)
  if (svErr) console.error('[findBestSV] SV-Query:', svErr.message)
  if (!svsRaw) return []
  const svs = svsRaw as unknown as Array<Record<string, unknown>>

  // AAR-CMM: Mapbox-ETA Büro → Fall für alle SVs in einem Matrix-Call.
  // Ersetzt die Haversine-Luftlinie als primäres Score-Kriterium und ist
  // Voraussetzung für die Adjacent-Termin-Reachability weiter unten.
  const svsMitStandort = svs.filter(
    (sv) => sv.standort_lat != null && sv.standort_lng != null,
  )
  const bueroEtaArr = await mapboxEtaMatrix(
    { lat: fallLat, lng: fallLng },
    svsMitStandort.map((sv) => ({
      lat: Number(sv.standort_lat),
      lng: Number(sv.standort_lng),
    })),
  )
  const bueroEtaMap = new Map<string, number | null>()
  svsMitStandort.forEach((sv, i) => bueroEtaMap.set(sv.id as string, bueroEtaArr[i]))

  // Adjacent-Termin-Reachability vorbereiten: für den effektiven Check-
  // zeitpunkt alle Termine ±4h um die Wunschtermin-Zeit laden, lead/fall-
  // Locations holen, eine Matrix-Call für Reachability.
  type TerminMitOrt = {
    id: string
    sv_id: string
    start_zeit: string
    end_zeit: string
    lead_id: string | null
    fall_id: string | null
    lat: number | null
    lng: number | null
  }
  const adjTermineBySv = new Map<string, TerminMitOrt[]>()
  if (wunschterminStart && wunschterminEnd) {
    const adjStart = new Date(wunschterminStart.getTime() - 4 * 60 * 60_000).toISOString()
    const adjEnd = new Date(wunschterminEnd.getTime() + 4 * 60 * 60_000).toISOString()
    const candidateSvIds = svs.map((sv) => sv.id as string)
    // CMM-44 SP-D PR2a: besichtigungsort_lat/lng direkt aus gutachter_termine
    // (SSoT) lesen — kein separater faelle-Batch-Read mehr noetig.
    const { data: nearTermineRaw } = await db
      .from('gutachter_termine')
      .select('id, sv_id, lead_id, fall_id, start_zeit, end_zeit, besichtigungsort_lat, besichtigungsort_lng')
      .in('sv_id', candidateSvIds)
      .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
      .gte('end_zeit', adjStart)
      .lte('start_zeit', adjEnd)
      .order('start_zeit', { ascending: true })

    const nearTermine = (nearTermineRaw ?? []) as Array<{
      id: string
      sv_id: string
      lead_id: string | null
      fall_id: string | null
      start_zeit: string
      end_zeit: string
      besichtigungsort_lat: number | null
      besichtigungsort_lng: number | null
    }>

    // leads.besichtigungsort_lat/lng als Fallback wenn GT-Coords fehlen.
    const leadIds = Array.from(new Set(nearTermine.filter(t => t.besichtigungsort_lat == null).map((t) => t.lead_id).filter((x): x is string => !!x)))
    const { data: leadLocs } = leadIds.length > 0
      ? await db.from('leads').select('id, besichtigungsort_lat, besichtigungsort_lng').in('id', leadIds)
      : { data: [] as Array<{ id: string; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }> }
    const leadLocMap = new Map(
      ((leadLocs ?? []) as Array<{ id: string; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>)
        .map((l) => [l.id, { lat: l.besichtigungsort_lat, lng: l.besichtigungsort_lng }]),
    )

    for (const t of nearTermine) {
      let lat: number | null = t.besichtigungsort_lat ?? null
      let lng: number | null = t.besichtigungsort_lng ?? null
      // Fallback: leads.besichtigungsort_lat/lng fuer aeltere Termine ohne GT-Coords.
      if ((lat == null || lng == null) && t.lead_id) {
        const loc = leadLocMap.get(t.lead_id)
        if (loc?.lat != null && loc?.lng != null) {
          lat = loc.lat
          lng = loc.lng
        }
      }
      const arr = adjTermineBySv.get(t.sv_id) ?? []
      arr.push({ ...t, lat, lng })
      adjTermineBySv.set(t.sv_id, arr)
    }
  }

  // Pro SV den unmittelbar vorherigen + nachfolgenden Termin extrahieren,
  // dessen Locations gesammelt für eine Matrix-Call.
  const adjLocsList: Array<{ lat: number; lng: number }> = []
  type AdjEntry = {
    prevTermin: TerminMitOrt | null
    nextTermin: TerminMitOrt | null
    prevIdx: number
    nextIdx: number
  }
  const adjEntryMap = new Map<string, AdjEntry>()
  if (wunschterminStart && wunschterminEnd) {
    for (const sv of svs) {
      const svId = sv.id as string
      const all = adjTermineBySv.get(svId) ?? []
      const prev = all
        .filter((t) => new Date(t.end_zeit).getTime() <= wunschterminStart.getTime())
        .sort((a, b) => new Date(b.end_zeit).getTime() - new Date(a.end_zeit).getTime())[0] ?? null
      const next = all
        .filter((t) => new Date(t.start_zeit).getTime() >= wunschterminEnd.getTime())
        .sort((a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime())[0] ?? null
      const entry: AdjEntry = { prevTermin: prev, nextTermin: next, prevIdx: -1, nextIdx: -1 }
      if (prev?.lat != null && prev?.lng != null) {
        entry.prevIdx = adjLocsList.length
        adjLocsList.push({ lat: prev.lat, lng: prev.lng })
      }
      if (next?.lat != null && next?.lng != null) {
        entry.nextIdx = adjLocsList.length
        adjLocsList.push({ lat: next.lat, lng: next.lng })
      }
      adjEntryMap.set(svId, entry)
    }
  }
  const adjEtas = adjLocsList.length > 0
    ? await mapboxEtaMatrix({ lat: fallLat, lng: fallLng }, adjLocsList)
    : []

  // AAR-694 Teil A + AAR-718: FreeBusy-Batch-Check läuft IMMER (nicht
  // mehr nur bei explizitem Wunschtermin). Ohne Wunschtermin nutzen wir
  // den impliziten Check-Zeitpunkt (nächster Werktag 10:00). Puffer
  // strikt ±TERMIN_PUFFER_MIN. SVs mit „belegt" fallen raus, „unbekannt"
  // (fail-open) bleibt Kandidat.
  const freeBusyMap = new Map<string, 'frei' | 'belegt' | 'unbekannt'>()
  const profileIdsForFB = svs
    .map((sv) => sv.profile_id as string | null)
    .filter((p): p is string => !!p)
  if (profileIdsForFB.length > 0 && wunschterminStart) {
    const batch = await checkSvFreeBusyBatch(
      profileIdsForFB,
      wunschterminStart.toISOString(),
      blockadePufferMin,
    )
    for (const [id, status] of batch) freeBusyMap.set(id, status)
  }

  const candidates: SvMatchCandidate[] = []

  for (const sv of svs) {
    const reasons: string[] = []

    // Urlaub-Check
    const urlaubVon = sv.urlaub_von as string | null
    const urlaubBis = sv.urlaub_bis as string | null
    if (terminDatum && urlaubVon && urlaubBis) {
      const t = new Date(terminDatum).getTime()
      if (t >= new Date(urlaubVon).getTime() && t <= new Date(urlaubBis).getTime()) {
        continue // Im Urlaub
      }
    }

    // Kontingent-Check
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    if (kontingentFrei <= 0) continue

    // Standort vorhanden?
    if (sv.standort_lat == null || sv.standort_lng == null) continue

    // Distanz-Check (Isochrone oder Radius)
    const distanzKm = haversine(Number(sv.standort_lat), Number(sv.standort_lng), fallLat, fallLng)
    const radius = Number(sv.paket_umkreis_km) || 40

    // AAR-521: Isochrone-Polygone kommen aus DB in 3 Formaten (A/B/C).
    // Vorher wurde nur Format B erkannt → Polygone in Format A/C liefen in den
    // else-Branch und Radius-Fallback wurde NICHT gezogen. Jetzt:
    // 1) parseIsochrone normalisiert auf [lng,lat][]
    // 2) Radius-Fallback greift IMMER wenn Polygon fehlt ODER Fall außerhalb ist
    const polygon = parseIsochrone(sv.isochrone_polygon)
    let imGebiet = false
    if (polygon) {
      imGebiet = pointInPolygon([fallLng, fallLat], polygon)
      if (imGebiet) reasons.push('im Einsatzgebiet (Isochrone)')
    }
    if (!imGebiet && distanzKm <= radius) {
      imGebiet = true
      reasons.push(`${Math.round(distanzKm)}km (max ${radius}, Radius-Fallback)`)
    }

    if (!imGebiet) continue

    // AAR-694 Teil A: FreeBusy — SVs deren Google-Kalender laut API belegt
    // ist, fallen aus dem Match. 'unbekannt' (fail-open) bleibt Kandidat.
    const profileId = sv.profile_id as string | null
    if (profileId && freeBusyMap.get(profileId) === 'belegt') {
      continue
    }

    const paket = (sv.paket as string) || 'standard'
    const paketPrio = PAKET_PRIO[paket] ?? 1
    const ablehnungen = Number(sv.ablehnungen_30_tage) || 0

    // AAR-264 + AAR-718: Verfügbarkeits-Check IMMER.
    // Bei explizitem Wunschtermin: Bonus +40 für Verfügbarkeit dort.
    // Ohne Wunschtermin: Check gegen nächsten Werktag 10:00, kein Bonus,
    // aber Reason-String informiert ob SV dort frei ist.
    let verfuegbarAmWunschtermin: boolean | undefined
    let naechsterFreierSlot: string | null | undefined
    let wunschterminBonus = 0
    if (wunschterminStart && wunschterminEnd && wunschterminWindowStart && wunschterminWindowEnd) {
      const { data: konflikte } = await db
        .from('gutachter_termine')
        .select('start_zeit')
        .eq('sv_id', sv.id as string)
        .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
        .lt('start_zeit', wunschterminWindowEnd)
        .gt('end_zeit', wunschterminWindowStart)
        .limit(1)
      const freiInGutachterTermine = !konflikte || konflikte.length === 0
      // AAR-718: Kombinierte Verfügbarkeit — gutachter_termine UND
      // privater Kalender (FreeBusy aus Google/CalDAV) müssen beide frei
      // oder 'unbekannt' liefern. Nur dann ist der SV zum Check-Zeitpunkt
      // wirklich verfügbar.
      const fbStatus = profileId ? freeBusyMap.get(profileId) : undefined
      const freiImKalender = fbStatus !== 'belegt'
      verfuegbarAmWunschtermin = freiInGutachterTermine && freiImKalender

      // AAR-CMM Reachability: Prüfen ob SV von Vorgänger-Termin (oder Büro)
      // den Besichtigungsort rechtzeitig erreichen kann — und ob er nach dem
      // Termin den Folge-Termin noch packt. ETA aus Mapbox-Matrix.
      let reachable = true
      let reachableGrund: string | null = null
      const adj = adjEntryMap.get(sv.id as string)
      if (verfuegbarAmWunschtermin && adj) {
        if (adj.prevTermin && adj.prevIdx >= 0) {
          const prevEta = adjEtas[adj.prevIdx]
          if (prevEta != null) {
            const verfMin = (wunschterminStart.getTime() - new Date(adj.prevTermin.end_zeit).getTime()) / 60_000
            if (prevEta + ETA_SICHERHEITS_PUFFER_MIN > verfMin) {
              reachable = false
              reachableGrund = `nicht erreichbar (${prevEta} min Fahrt vom Vortermin, nur ${Math.round(verfMin)} min Lücke)`
            }
          }
        } else if (bueroEtaMap.get(sv.id as string) != null) {
          // Erster Termin des Tages: ETA vom Büro reicht als Sanity-Check.
          // Wir blocken aber nicht — der SV startet von zu Hause, das ist sein
          // Job. Nur Reason-Info.
        }
        if (reachable && adj.nextTermin && adj.nextIdx >= 0) {
          const nextEta = adjEtas[adj.nextIdx]
          if (nextEta != null) {
            const verfMin = (new Date(adj.nextTermin.start_zeit).getTime() - wunschterminEnd.getTime()) / 60_000
            if (nextEta + ETA_SICHERHEITS_PUFFER_MIN > verfMin) {
              reachable = false
              reachableGrund = `nicht erreichbar (${nextEta} min Fahrt zum Folgetermin, nur ${Math.round(verfMin)} min Lücke)`
            }
          }
        }
      }
      if (verfuegbarAmWunschtermin && !reachable) {
        verfuegbarAmWunschtermin = false
      }

      if (verfuegbarAmWunschtermin) {
        if (hatExplicitWunsch) {
          wunschterminBonus = 40
          reasons.push(`am Wunschtermin frei`)
        } else {
          reasons.push(`am nächsten Werktag 10:00 frei`)
        }
      } else {
        naechsterFreierSlot = await findNextFreeSlotForSv(
          db,
          sv.id as string,
          wunschterminStart,
          profileId,
          { lat: fallLat, lng: fallLng },
        )
        if (reachableGrund) {
          reasons.push(reachableGrund)
        } else {
          const belegtWo = !freiInGutachterTermine ? 'Claimondo-Termin' : 'Privatkalender'
          reasons.push(
            hatExplicitWunsch
              ? `am Wunschtermin belegt (${belegtWo})`
              : `am nächsten Werktag 10:00 belegt (${belegtWo})`,
          )
        }
      }
    }

    // AAR-CMM: Score nutzt jetzt echte Mapbox-ETA Büro→Fall (Minuten) statt
    // Haversine-km. ETA-Gewicht 0.5 weil Minuten in DE-Stadtverkehr ~doppelt
    // so groß sein können wie km — wir wollen ETA nicht überproportional
    // bestrafen. Bei Mapbox-Ausfall fällt der Score auf -distanzKm zurück.
    const etaFromBueroMin = bueroEtaMap.get(sv.id as string) ?? null
    const distanzPenalty = etaFromBueroMin != null ? etaFromBueroMin * 0.5 : distanzKm

    // Score: höher = besser
    // +100 pro Paket-Stufe, -2 pro offenem Fall, -2 pro Ablehnung,
    // -0.5 pro ETA-Minute (oder -1/km Fallback), +40 wenn am Wunschtermin frei
    // Sticky-SV: +1000 (schlaegt alle anderen Faktoren — Kontinuitaet > Optimierung)
    const stickyBonus = input.stickySvId && sv.id === input.stickySvId ? 1000 : 0
    const score =
      paketPrio * 100 -
      kontingentGenutzt * 2 -
      ablehnungen * 2 -
      distanzPenalty +
      wunschterminBonus +
      stickyBonus
    reasons.push(`Paket: ${paket}`)
    reasons.push(`${kontingentFrei}/${kontingentGesamt} frei`)
    if (etaFromBueroMin != null) reasons.push(`${etaFromBueroMin} min Fahrt vom Büro`)
    if (stickyBonus > 0) reasons.unshift('Bekannter SV (Sticky)')

    const profile = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
    candidates.push({
      svId: sv.id as string,
      profileId: (sv.profile_id as string) ?? null,
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : '—',
      paket,
      distanzKm: Math.round(distanzKm * 10) / 10,
      etaFromBueroMin,
      offeneFaelle: kontingentGenutzt,
      kontingentFrei,
      ablehnungen30d: ablehnungen,
      score,
      reasons,
      verfuegbarAmWunschtermin,
      naechsterFreierSlot,
    })
  }

  candidates.sort((a, b) => b.score - a.score)
  return candidates.slice(0, limit)
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
 
async function findNextFreeSlotForSv(
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
  kandidat.setMinutes(kandidat.getMinutes() >= 30 ? 60 : 30, 0, 0)

  const maxIter = 12 * 7 * 24 * 2 // 30-min-Grid statt 60-min
  let i = 0
  while (kandidat < inZwoelfWochen && i < maxIter) {
    i++
    const wochentag = kandidat.getDay()
    if (
      wochentag !== 0 &&
      wochentag !== 6 &&
      !blockierteWochentage.has(wochentag) &&
      kandidat.getHours() >= 9 &&
      kandidat.getHours() < 16
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
            kandidat.setTime(kandidat.getTime() + 30 * 60_000)
            if (kandidat.getHours() >= 17) {
              kandidat.setDate(kandidat.getDate() + 1)
              kandidat.setHours(9, 0, 0, 0)
            }
            continue
          }
        }
        return kandidat.toISOString()
      }
    }
    // Zum nächsten 30-min-Slot weiter.
    kandidat.setTime(kandidat.getTime() + 30 * 60_000)
    if (kandidat.getHours() >= 17) {
      kandidat.setDate(kandidat.getDate() + 1)
      kandidat.setHours(9, 0, 0, 0)
    }
  }
  return null
}
