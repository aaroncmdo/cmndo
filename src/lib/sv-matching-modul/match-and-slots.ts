// AAR-941: Das EINE Matching-Modul (Aaron 31.05. gelockt).
// matchAndSlots() = Prio-Matching nach Besichtigungsort + Slots + kundensichere
// Projektion in einem Aufruf. Self-Service-Wizard, /gutachter-finden und
// Dispatch koennen kuenftig dasselbe Modul konsumieren — eine Wahrheit.
//
// SV-Weiche:
//   fixerSvId == null (intern, native/Cluster-LP) → findBestSV GLOBAL (nur
//     `sachverstaendige` = Tier-1) → Auto-Top-1; candidates[0] ist Prio-1.
//   fixerSvId gesetzt (SV-Embed) → KEIN findBestSV, nur sein Kalender.
//
// Daten-Leak-Schutz: liefert ausschliesslich OeffentlichesSvProfil[] —
// das rohe SvMatchCandidate verlaesst dieses Modul nie (toOeffentlichesSvProfil).

import { createAdminClient } from '@/lib/supabase/admin'
import { findBestSV, type SvMatchCandidate } from '@/lib/dispatch/findBestSV'
import { ladeFreieSlots } from '@/lib/onboarding/slots'
import { toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { rankSlots } from './ranking'
import { toOeffentlichesSvProfil } from './projection'
import type { OeffentlichesSvProfil, SvBewertung, SvProfilFelder } from './types'

const SLOT_FENSTER_TAGE = 14
const DEFAULT_TOP_N = 5
const SLOTS_PRO_SV = 6

export type MatchAndSlotsInput = {
  /** Besichtigungsort. */
  lat: number
  lng: number
  /** Optionaler Wunschtermin (ISO/UTC) — steuert das Slot-Ranking (Fall A/B). */
  wunschterminIso?: string | null
  /** SV-Weiche: gesetzt = SV-Embed → nur dieser SV, kein globales Matching. */
  fixerSvId?: string | null
  /** Anzahl Kandidaten im NULL-Fall (Auto-Top-1 = erster). Default 5. */
  topN?: number
}

// Haversine-Luftlinie (km) — fuer die gerundete Distanz-Anzeige des fixen SV.
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * SV-Embed-Fall: baut einen neutralen SvMatchCandidate fuer genau den fixen SV
 * (kein Scoring, kein findBestSV). Nur die fuer die Projektion relevanten Felder
 * sind echt (svId, profileId, distanzKm); Scoring-Felder bleiben neutral und
 * werden ohnehin nicht projiziert.
 */
async function ladeFixenSvKandidat(
  admin: ReturnType<typeof createAdminClient>,
  svId: string,
  lat: number,
  lng: number,
): Promise<SvMatchCandidate[]> {
  const { data: sv } = await admin
    .from('sachverstaendige')
    .select('id, profile_id, standort_lat, standort_lng, ist_aktiv, portal_zugang_freigeschaltet')
    .eq('id', svId)
    .maybeSingle()

  if (!sv || sv.ist_aktiv === false) return []

  const distanzKm =
    sv.standort_lat != null && sv.standort_lng != null
      ? haversineKm(Number(sv.standort_lat), Number(sv.standort_lng), lat, lng)
      : 0

  return [
    {
      svId: sv.id,
      profileId: (sv.profile_id as string | null) ?? null,
      name: '',
      paket: '',
      distanzKm: Math.round(distanzKm * 10) / 10,
      etaFromBueroMin: null,
      offeneFaelle: 0,
      kontingentFrei: 0,
      ablehnungen30d: 0,
      score: 0,
      reasons: [],
      verfuegbarAmWunschtermin: undefined,
      naechsterFreierSlot: null,
    },
  ]
}

export async function matchAndSlots(input: MatchAndSlotsInput): Promise<OeffentlichesSvProfil[]> {
  const { lat, lng, wunschterminIso = null, fixerSvId = null } = input
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const admin = createAdminClient()
  // Wunschtermin in dieselbe Wall-Clock-Welt wie die Slots holen (TZ-Falle).
  const wunschterminWall = wunschterminIso ? toBerlinWallClock(wunschterminIso) : null

  // 1. SV-Weiche: Kandidaten bestimmen.
  const candidates: SvMatchCandidate[] = fixerSvId
    ? await ladeFixenSvKandidat(admin, fixerSvId, lat, lng)
    : await findBestSV({ fallLat: lat, fallLng: lng, wunschterminIso }, input.topN ?? DEFAULT_TOP_N)

  if (candidates.length === 0) return []

  // 2. Profil (vorname/avatar/beschreibung) + Bewertung fuer alle Kandidaten
  //    batch-laden (Muster: dispatch/karte/get-active-svs). findBestSV liefert
  //    diese Felder nicht mit.
  const profileIds = Array.from(
    new Set(candidates.map((c) => c.profileId).filter((id): id is string => typeof id === 'string')),
  )
  const profilById = new Map<string, SvProfilFelder>()
  const bewById = new Map<string, SvBewertung>()
  if (profileIds.length > 0) {
    const [profRes, bewRes] = await Promise.all([
      admin.from('profiles').select('id, vorname, avatar_url, profilbeschreibung').in('id', profileIds),
      admin
        .from('google_bewertungen_cache')
        .select('profile_id, durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
        .in('profile_id', profileIds),
    ])
    for (const p of profRes.data ?? []) {
      profilById.set(p.id, {
        vorname: p.vorname,
        avatar_url: p.avatar_url,
        profilbeschreibung: p.profilbeschreibung,
      })
    }
    for (const b of bewRes.data ?? []) {
      bewById.set(b.profile_id, {
        durchschnitt: b.durchschnitt,
        anzahl: b.anzahl_bewertungen,
        aktualisiert: b.zuletzt_aktualisiert_am,
      })
    }
  }

  // 3. Slots je Kandidat (nur dessen Kalender, ladeFreieSlots = admin/anon-safe)
  //    + um den Wunschtermin ranken, dann kundensicher projizieren.
  const von = new Date()
  von.setHours(0, 0, 0, 0)
  const bis = new Date(von)
  bis.setDate(von.getDate() + SLOT_FENSTER_TAGE)

  return Promise.all(
    candidates.map(async (cand) => {
      let tage: Awaited<ReturnType<typeof ladeFreieSlots>> = []
      try {
        tage = await ladeFreieSlots(cand.svId, von, bis, { lat, lng })
      } catch (err) {
        // Slot-Ladefehler darf das Matching nicht brechen — SV ohne Slots anbieten.
        console.warn('[matchAndSlots] ladeFreieSlots fehlgeschlagen fuer', cand.svId, err)
      }
      const slots = rankSlots(tage, wunschterminWall, SLOTS_PRO_SV)
      return toOeffentlichesSvProfil({
        candidate: cand,
        bewertung: cand.profileId ? bewById.get(cand.profileId) ?? null : null,
        profil: cand.profileId ? profilById.get(cand.profileId) ?? null : null,
        slots,
      })
    }),
  )
}
