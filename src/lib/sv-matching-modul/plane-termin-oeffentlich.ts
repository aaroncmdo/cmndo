// T2 (universelle Termin-Engine) + AAR-941: planeTerminOeffentlich
// ─────────────────────────────────────────────────────────────────────────────
// Der ANON-SICHERE Kunde-Gesicht-Output des planeTermin-Flows: max 3 Slots in der
// 2+1-Verteilung (2 beim Best-Match-SV + 1 beim Zweitbesten, adaptiv) — gespeist aus
// den ENGINE-Primitiven (findBestSV = findeBestePerson #2500 fuer das Ranking +
// engine `freieSlots` mit Reachability + now-Floor fuer die Slots) und durch die
// AAR-941-Projektion (toOeffentlichesSvProfil) geschuetzt: score, exakte ETA,
// reasons und nachname verlassen das Modul NIE.
//
// Drop-in fuer den /flow-Funnel: Rueckgabe == matchAndSlots (OeffentlichesSvProfil[]),
// nur reachability-korrekt + 2+1 statt onboarding-Slots ohne Verteilung. ladeMatchingFlow
// (aar-956) tauscht im GLOBAL-Fall matchAndSlots → diese Fn; der SV-Embed-Fixer-Fall
// bleibt auf matchAndSlots (Merge funnel-seitig via mergeFixerUndAlternativen).
//
// Boundary: dieses Modul (matching*/projection) = Termin-Engine-Revier; der Consumer
// ladeMatchingFlow/FlowSlotStep/SvSlotAuswahl = aar-956. toOeffentlichesSvProfil wird
// nur AUFGERUFEN, nicht veraendert (shared mit matchAndSlots + /anfrage).

import { createAdminClient } from '@/lib/supabase/admin'
import { findBestSV, type SvMatchCandidate } from '@/lib/dispatch/findBestSV'
import { freieSlots, type Assignee } from '@/lib/termine/engine'
import { toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { rankSlots } from './ranking'
import { toOeffentlichesSvProfil } from './projection'
import type { OeffentlichesSvProfil, SlotVorschlag, SvBewertung, SvProfilFelder } from './types'

const SLOT_FENSTER_TAGE = 14
const KUNDE_MAX_SLOTS = 3
// Best + Zweitbester + 1 Reserve fuer adaptive Auffuellung (z.B. Best ohne Slots).
const TOP_KANDIDATEN = 3

export type PlaneTerminOeffentlichInput = {
  /** Besichtigungsort. */
  lat: number
  lng: number
  /** Optionaler Wunschtermin (ISO/UTC) — steuert NUR das Slot-Ranking (matchType), kein Hard-Filter. */
  wunschterminIso?: string | null
}

/**
 * PURE 2+1-Mengenverteilung in Count-Form: gegeben die (rankSlots-)verfuegbare
 * Slot-Anzahl je nach-Score-sortiertem Kandidat → wie viele Slots zeigt jeder.
 * Best bis 2, dann je 1 von den naechsten, dann adaptive Auffuellung bis
 * KUNDE_MAX_SLOTS. Spiegelt verteileAusSlots (termine/engine) in der pro-SV-
 * Projektions-Welt: 1 Kandidat → bis 3 bei ihm; Best ohne Slots → von anderen. Testbar.
 */
export function verteile2plus1Counts(verfuegbar: number[]): number[] {
  const counts = verfuegbar.map(() => 0)
  let total = 0
  if (verfuegbar.length > 0) {
    const take = Math.min(2, verfuegbar[0])
    counts[0] = take
    total += take
  }
  for (let i = 1; i < verfuegbar.length && total < KUNDE_MAX_SLOTS; i++) {
    if (verfuegbar[i] >= 1) {
      counts[i] += 1
      total += 1
    }
  }
  while (total < KUNDE_MAX_SLOTS && verfuegbar.length > 0 && counts[0] < verfuegbar[0]) {
    counts[0] += 1
    total += 1
  }
  for (let i = 1; i < verfuegbar.length && total < KUNDE_MAX_SLOTS; i++) {
    while (total < KUNDE_MAX_SLOTS && counts[i] < verfuegbar[i]) {
      counts[i] += 1
      total += 1
    }
  }
  return counts
}

/**
 * Batch-laedt vorname/avatar/beschreibung (profiles) + Bewertung
 * (google_bewertungen_cache) fuer die Projektion — findBestSV liefert sie nicht mit.
 * Spiegelt den matchAndSlots-Block; bleibt hier self-contained, bis matchAndSlots
 * nach dem ladeMatchingFlow-Cutover retired wird (dann Single-Source).
 */
async function ladeProfilUndBewertung(
  admin: ReturnType<typeof createAdminClient>,
  candidates: SvMatchCandidate[],
): Promise<{ profilById: Map<string, SvProfilFelder>; bewById: Map<string, SvBewertung> }> {
  const profileIds = Array.from(
    new Set(candidates.map((c) => c.profileId).filter((id): id is string => typeof id === 'string')),
  )
  const profilById = new Map<string, SvProfilFelder>()
  const bewById = new Map<string, SvBewertung>()
  if (profileIds.length === 0) return { profilById, bewById }
  const [profRes, bewRes] = await Promise.all([
    admin.from('profiles').select('id, vorname, avatar_url, profilbeschreibung').in('id', profileIds),
    admin
      .from('google_bewertungen_cache')
      .select('profile_id, durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
      .in('profile_id', profileIds),
  ])
  for (const p of profRes.data ?? []) {
    profilById.set(p.id, { vorname: p.vorname, avatar_url: p.avatar_url, profilbeschreibung: p.profilbeschreibung })
  }
  for (const b of bewRes.data ?? []) {
    bewById.set(b.profile_id, {
      durchschnitt: b.durchschnitt,
      anzahl: b.anzahl_bewertungen,
      aktualisiert: b.zuletzt_aktualisiert_am,
    })
  }
  return { profilById, bewById }
}

/**
 * GLOBAL-Match Kunde-Gesicht: liefert die leak-sichere OeffentlichesSvProfil[] mit
 * der 2+1-Verteilung (Best 2 Slots + Zweitbester 1 → 2 Profile der slots-Laengen 2/1;
 * adaptiv). Reachability-gefilterte, now-floored Engine-Slots. SV-Embed (fixerSvId)
 * laeuft weiter ueber matchAndSlots — der Merge ist funnel-seitig (mergeFixerUndAlternativen).
 */
export async function planeTerminOeffentlich(
  input: PlaneTerminOeffentlichInput,
): Promise<OeffentlichesSvProfil[]> {
  const { lat, lng, wunschterminIso = null } = input
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const admin = createAdminClient()
  // Wunschtermin in dieselbe Wall-Clock-Welt wie die Slots (TZ-Falle), 1:1 zu matchAndSlots.
  const wunschterminWall = wunschterminIso ? toBerlinWallClock(wunschterminIso) : null

  // 1. Ranking via Engine (findBestSV = findeBestePerson #2500). GLOBAL, Tier-1.
  const candidates = await findBestSV({ fallLat: lat, fallLng: lng, wunschterminIso }, TOP_KANDIDATEN)
  if (candidates.length === 0) return []

  // 2. Projektions-Stammdaten (vorname/avatar/beschreibung + Bewertung) batch-laden.
  const { profilById, bewById } = await ladeProfilUndBewertung(admin, candidates)

  // 3. Engine-Slots je Kandidat (Reachability + now-Floor), dann um den Wunschtermin ranken.
  const vonIso = new Date().toISOString()
  const bisIso = new Date(Date.now() + SLOT_FENSTER_TAGE * 24 * 60 * 60_000).toISOString()
  const rankedPerSv: SlotVorschlag[][] = []
  for (const cand of candidates) {
    const assignee: Assignee = { typ: 'sachverstaendiger', id: cand.svId }
    let tage: Awaited<ReturnType<typeof freieSlots>> = []
    try {
      tage = await freieSlots(assignee, vonIso, bisIso, { schadenort: { lat, lng } }, admin)
    } catch (err) {
      // Slot-Ladefehler darf das Matching nicht brechen — SV ohne Slots → faellt unten raus.
      console.warn('[planeTerminOeffentlich] freieSlots fehlgeschlagen fuer', cand.svId, err)
    }
    rankedPerSv.push(rankSlots(tage, wunschterminWall, KUNDE_MAX_SLOTS))
  }

  // 4. 2+1-Verteilung + kundensichere Projektion. SVs ohne zugeteilte Slots fallen raus.
  const counts = verteile2plus1Counts(rankedPerSv.map((s) => s.length))
  const profile: OeffentlichesSvProfil[] = []
  candidates.forEach((cand, i) => {
    const slots = rankedPerSv[i].slice(0, counts[i])
    if (slots.length === 0) return
    profile.push(
      toOeffentlichesSvProfil({
        candidate: cand,
        bewertung: cand.profileId ? bewById.get(cand.profileId) ?? null : null,
        profil: cand.profileId ? profilById.get(cand.profileId) ?? null : null,
        slots,
      }),
    )
  })
  return profile
}
