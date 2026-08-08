// T2 (universelle Termin-Engine) + AAR-941: planeTerminOeffentlich
// ─────────────────────────────────────────────────────────────────────────────
// Der ANON-SICHERE Kunde-Gesicht-Output des planeTermin-Flows, gespeist aus den
// ENGINE-Primitiven (findBestSV = findeBestePerson #2500 + engine `freieSlots` mit
// Reachability + now-Floor über v_belegung) und durch die AAR-941-Projektion
// (toOeffentlichesSvProfil) geschützt: score, exakte ETA, reasons und nachname
// verlassen das Modul NIE. Zwei Gesichter:
//   - GLOBAL (fixerSvId=null): findBestSV-Ranking → max 3 Slots in der 2+1-Verteilung
//     (2 beim Best + 1 beim Zweitbesten, adaptiv).
//   - SV-EMBED (fixerSvId gesetzt): genau dieser SV, bis FIXER_MAX_SLOTS, immer gezeigt
//     (Merge mit globalen Alternativen funnel-seitig via mergeFixerUndAlternativen).
//
// matchAndSlots delegiert seit dem Fixer→Engine-Cutover an diese Fn (Thin-Wrapper) →
// EIN engine-gespeister, leak-sicherer Slot-Pfad für den ganzen /flow-Funnel; der alte
// onboarding-`ladeFreieSlots`/cache-busy-Pfad ist damit aus dem Matching raus.
//
// Boundary: dieses Modul (matching*/projection) = Termin-Engine-Revier; der Consumer
// ladeMatchingFlow/FlowSlotStep/SvSlotAuswahl = aar-956.

import { createAdminClient } from '@/lib/supabase/admin'
import { findBestSV, type SvMatchCandidate } from '@/lib/dispatch/findBestSV'
import { freieSlots, type Assignee } from '@/lib/termine/engine'
import { toBerlinWallClock } from '@/lib/google-calendar/timezone'
import { rankSlots } from './ranking'
import { toOeffentlichesSvProfil } from './projection'
import { getPartnerRangBatch } from '@/lib/partner-rang/get'
import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'
import { ladeFreundKandidatIds } from '@/lib/netzwerk/freunde'
import { applyNetzwerkPraeferenz } from '@/lib/netzwerk/apply-netzwerk-praeferenz'
import { istTestSvAngebotBlockiert } from '@/lib/testdaten/test-sv-guard'
import { istInterneIdentitaet } from '@/lib/testdaten/interne-identitaet'
import type { OeffentlichesSvProfil, SlotVorschlag, SvBewertung, SvProfilFelder } from './types'

const SLOT_FENSTER_TAGE = 14
const KUNDE_MAX_SLOTS = 3
// Best + Zweitbester + 1 Reserve für adaptive Auffüllung (z.B. Best ohne Slots).
const TOP_KANDIDATEN = 3
// Owner-Boost (Ebene 2): groesserer Pool, damit ein etwas fernerer ZAHLENDER Freund des Owners
// nicht schon vor der relationalen Partition (Freund oben) durch den Top-3-Schnitt rausfaellt.
const TOP_KANDIDATEN_MIT_OWNER = 8
// SV-Embed: bis 6 Slots beim fixen SV (1:1 zum früheren matchAndSlots-SLOTS_PRO_SV).
const FIXER_MAX_SLOTS = 6

export type PlaneTerminOeffentlichInput = {
  /** Besichtigungsort. */
  lat: number
  lng: number
  /** Optionaler Wunschtermin (ISO/UTC) — steuert NUR das Slot-Ranking (matchType), kein Hard-Filter. */
  wunschterminIso?: string | null
  /** SV-Embed: gesetzt → genau dieser SV (kein globales Matching, bis FIXER_MAX_SLOTS, immer gezeigt). */
  fixerSvId?: string | null
  /**
   * AAR-956 17.07. (Follow-up 3): Kunden-Identitaet des Betrachters (Lead-Email/-Name),
   * NUR fuer den Fixer-Pfad relevant — ein TEST-SV-Embed bietet nur INTERNEN Identitaeten
   * Slots an (istTestSvAngebotBlockiert; der globale Pool filtert Test-SVs laengst via
   * applyDispatchableFilter). Fehlend/unbekannt = fail-closed (Test-SV wird nicht angeboten).
   */
  kundenIdentitaet?: { email?: string | null; name?: string | null } | null
  /**
   * Ebene-2 relationaler Boost (Design §5.2 "Freund oben"): profiles.id des attribuierenden Owners
   * (z.B. aus ?werkstatt=<id> → resolveVermittlerOwnerProfil). Gesetzt → dessen ZAHLENDE Freund-SVs
   * (Freundes-Graph ∩ Netzwerkpartner-Abo) werden im GLOBAL-Ranking nach oben partitioniert +
   * `imNetzwerk` markiert. null/undefined (Default, jeder Nicht-Embed-Caller) → identisches Verhalten.
   * NUR im GLOBAL-Pfad wirksam (der Fixer-/SV-Embed-Pfad zeigt genau einen SV, kein Boost).
   */
  ownerProfilId?: string | null
}

/**
 * PURE 2+1-Mengenverteilung in Count-Form: gegeben die (rankSlots-)verfügbare
 * Slot-Anzahl je nach-Score-sortiertem Kandidat → wie viele Slots zeigt jeder.
 * Best bis 2, dann je 1 von den nächsten, dann adaptive Auffüllung bis
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

/** Haversine-Luftlinie (km) — für die gerundete Distanz-Anzeige des fixen SV. */
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
 * SV-Embed-Fall: neutraler SvMatchCandidate für genau den fixen SV (kein Scoring,
 * kein findBestSV). Nur die für die Projektion relevanten Felder sind echt (svId,
 * profileId, distanzKm); Scoring-Felder bleiben neutral und werden ohnehin nicht projiziert.
 */
async function ladeFixenSvKandidat(
  admin: ReturnType<typeof createAdminClient>,
  svId: string,
  lat: number,
  lng: number,
  kundenIdentitaet?: { email?: string | null; name?: string | null } | null,
): Promise<SvMatchCandidate[]> {
  const { data: sv } = await admin
    .from('sachverstaendige')
    .select('id, profile_id, standort_lat, standort_lng, ist_aktiv, portal_zugang_freigeschaltet, ist_testaccount')
    .eq('id', svId)
    .maybeSingle()
  if (!sv || sv.ist_aktiv === false) return []
  // AAR-956 17.07. (Follow-up 3): Test-SV-Embed nur fuer interne Identitaeten —
  // Angebots-Spiegel der Guard-Matrix (sonst laeuft der echte Kunde erst an der
  // Buchung in den Guard = degradierte UX). Verhalten wie "SV nicht gefunden".
  if (istTestSvAngebotBlockiert(sv.ist_testaccount === true, kundenIdentitaet)) return []
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

/**
 * Batch-lädt vorname/avatar/beschreibung (profiles) + Bewertung
 * (google_bewertungen_cache) für die Projektion — findBestSV liefert sie nicht mit.
 * Single-Source seit matchAndSlots ein Thin-Wrapper auf diese Fn ist.
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
 * Liefert die leak-sichere OeffentlichesSvProfil[] für den /flow-Funnel — GLOBAL (2+1)
 * oder SV-EMBED (fixerSvId). Beide Gesichter ziehen die Slots aus der Engine
 * (`freieSlots` → v_belegung: Buchungen ∪ externe Kalender-Busy ∪ Ausnahmen,
 * Reachability + now-Floor). projiziert via toOeffentlichesSvProfil (AAR-941).
 */
/**
 * D (Aaron 24.07.): nächstgelegenen aktiven Test-SV finden — NUR fuer den internen-Tester-
 * Fallback im Global-Match (planeTerminOeffentlich). Der Global-Pool (applyDispatchableFilter)
 * excludet Test-SVs (ist_testaccount=true); echte Kunden erreichen diesen Pfad nie (das
 * kundenIdentitaet-Gate am Call-Site). Distanz in-memory (wenige Test-SVs, kein PostGIS-Bedarf).
 */
async function findeNahenTestSv(
  admin: ReturnType<typeof createAdminClient>,
  lat: number,
  lng: number,
): Promise<string | null> {
  const { data } = await admin
    .from('sachverstaendige')
    .select('id, standort_lat, standort_lng')
    .eq('ist_testaccount', true)
    .eq('ist_aktiv', true)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
  const rows = (data ?? []) as Array<{ id: string; standort_lat: number | null; standort_lng: number | null }>
  let besterId: string | null = null
  let besteKm = Infinity
  for (const sv of rows) {
    if (sv.standort_lat == null || sv.standort_lng == null) continue
    const km = haversineKm(Number(sv.standort_lat), Number(sv.standort_lng), lat, lng)
    if (km < besteKm) {
      besteKm = km
      besterId = sv.id
    }
  }
  return besterId
}

export async function planeTerminOeffentlich(
  input: PlaneTerminOeffentlichInput,
): Promise<OeffentlichesSvProfil[]> {
  const { lat, lng, wunschterminIso = null, fixerSvId = null, kundenIdentitaet = null, ownerProfilId = null } = input
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const admin = createAdminClient()
  // Wunschtermin in dieselbe Wall-Clock-Welt wie die Slots (TZ-Falle).
  const wunschterminWall = wunschterminIso ? toBerlinWallClock(wunschterminIso) : null
  const vonIso = new Date().toISOString()
  const bisIso = new Date(Date.now() + SLOT_FENSTER_TAGE * 24 * 60 * 60_000).toISOString()

  // Engine-Slots eines SVs (Reachability + now-Floor über v_belegung), Wunschtermin-geranked.
  const slotsFuer = async (svId: string, limit: number): Promise<SlotVorschlag[]> => {
    const assignee: Assignee = { typ: 'sachverstaendiger', id: svId }
    let tage: Awaited<ReturnType<typeof freieSlots>> = []
    try {
      tage = await freieSlots(assignee, vonIso, bisIso, { schadenort: { lat, lng } }, admin)
    } catch (err) {
      // Slot-Ladefehler darf das Matching nicht brechen.
      console.warn('[planeTerminOeffentlich] freieSlots fehlgeschlagen für', svId, err)
    }
    return rankSlots(tage, wunschterminWall, limit)
  }

  // ── SV-EMBED (Fixer): genau dieser SV, bis FIXER_MAX_SLOTS, IMMER gezeigt ──
  if (fixerSvId) {
    const candidates = await ladeFixenSvKandidat(admin, fixerSvId, lat, lng, kundenIdentitaet)
    if (candidates.length === 0) return []
    const { profilById, bewById } = await ladeProfilUndBewertung(admin, candidates)
    const rangById = await getPartnerRangBatch(admin, 'sachverstaendiger', candidates.map((c) => c.svId))
    // 13b (K10): Netzwerkpartner-Abo-Praedikat fuers Badge, EIN Batch fuer diesen Pfad.
    const zahlendeSet = await ladeZahlendeSvSet(admin, candidates.map((c) => c.svId))
    const cand = candidates[0]
    const slots = await slotsFuer(cand.svId, FIXER_MAX_SLOTS)
    return [
      toOeffentlichesSvProfil({
        candidate: cand,
        bewertung: cand.profileId ? bewById.get(cand.profileId) ?? null : null,
        profil: cand.profileId ? profilById.get(cand.profileId) ?? null : null,
        slots,
        rang: rangById.get(cand.svId) ?? null,
        istNetzwerkpartner: zahlendeSet.has(cand.svId),
      }),
    ]
  }

  // ── GLOBAL: Engine-Ranking (findBestSV) + relationaler Owner-Boost (Ebene 2) + 2+1-Verteilung ──
  // Bei injiziertem Owner groesseren Pool laden, damit ein etwas fernerer zahlender Freund des
  // Owners nicht schon vor der relationalen Partition durch den Top-3-Schnitt faellt.
  const kandidatenLimit = ownerProfilId ? TOP_KANDIDATEN_MIT_OWNER : TOP_KANDIDATEN
  const rohKandidaten = await findBestSV({ fallLat: lat, fallLng: lng, wunschterminIso }, kandidatenLimit)
  if (rohKandidaten.length === 0) return []

  // 13b (K10): Netzwerkpartner-Abo-Praedikat EINMAL auf dem ganzen Pool — dient sowohl dem Badge
  // (istNetzwerkpartner) als auch dem Freund-Filter (nur ZAHLENDE Freunde werden geboostet).
  const zahlendeSet = await ladeZahlendeSvSet(admin, rohKandidaten.map((c) => c.svId))

  // Ebene 2 (relational, Design §5.2 "Freund oben, Wahl frei"): die zahlenden Freund-SVs des Owners
  // nach oben partitionieren (stabile Reihenfolge sonst). Ohne Owner / ohne zahlende Freunde: No-op
  // → rohKandidaten unveraendert (identisch zum bisherigen Verhalten).
  let freundPayingIds = new Set<string>()
  if (ownerProfilId) {
    const freundSvIds = await ladeFreundKandidatIds(admin, ownerProfilId, 'gutachter')
    freundPayingIds = new Set([...freundSvIds].filter((id) => zahlendeSet.has(id)))
  }
  const geordnet: SvMatchCandidate[] =
    freundPayingIds.size > 0
      ? applyNetzwerkPraeferenz(rohKandidaten.map((c) => ({ ...c, id: c.svId, qualifiziert: true })), freundPayingIds)
      : rohKandidaten
  const candidates = geordnet.slice(0, TOP_KANDIDATEN)

  const { profilById, bewById } = await ladeProfilUndBewertung(admin, candidates)
  const rangById = await getPartnerRangBatch(admin, 'sachverstaendiger', candidates.map((c) => c.svId))
  // AAR-956 (Aaron 14.06.): die slotsFuer-Calls (freieSlots, DB-schwer) PARALLEL statt sequenziell —
  // der Hauptgrund der „Wir suchen"-Sekunden war 3× freieSlots nacheinander. Promise.all erhält die
  // Reihenfolge (Engine-Ranking) → Ergebnis bit-identisch, nur ~3× schneller.
  const rankedPerSv: SlotVorschlag[][] = await Promise.all(
    candidates.map((cand) => slotsFuer(cand.svId, KUNDE_MAX_SLOTS)),
  )

  // 2+1-Verteilung + kundensichere Projektion. SVs ohne zugeteilte Slots fallen raus.
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
        rang: rangById.get(cand.svId) ?? null,
        istNetzwerkpartner: zahlendeSet.has(cand.svId),
        imNetzwerk: freundPayingIds.has(cand.svId),
      }),
    )
  })

  // D (Aaron 24.07. „du bist die lane"): Interne Tester OHNE gfa-Fixer sehen im Global-Match KEINE
  // Test-SVs — applyDispatchableFilter (findeBestePerson) excludet ist_testaccount=true. In PROD
  // greift der Global-Match (echte Partner-SVs); nur in Test-SV-only-Gebieten (Smoke) bleibt der
  // Pool leer, und der FM-/Fallback-Lead (kein Fixer, = lead-first-Umbau #4748) zeigt keinen
  // Gutachter. Fuer INTERNE Identitaeten (istInterneIdentitaet — genau die, die einen Test-SV per
  // Guard auch buchen duerfen) einen nahen Test-SV als Auto-Fixer nachreichen (reused
  // ladeFixenSvKandidat → der istTestSvAngebotBlockiert-Guard laesst intern durch). Echte Kunden
  // (nicht-interne Identitaet) triggern das NIE → kein Leak (fail-closed).
  if (
    profile.length === 0 &&
    istInterneIdentitaet(kundenIdentitaet?.email ?? null, kundenIdentitaet?.name ?? null)
  ) {
    const testSvId = await findeNahenTestSv(admin, lat, lng)
    if (testSvId) {
      const candidates = await ladeFixenSvKandidat(admin, testSvId, lat, lng, kundenIdentitaet)
      if (candidates.length > 0) {
        const { profilById, bewById } = await ladeProfilUndBewertung(admin, candidates)
        const rangById = await getPartnerRangBatch(admin, 'sachverstaendiger', candidates.map((c) => c.svId))
        // 13b (K10): EIN Batch fuer diesen Pfad — der Test-SV traegt praktisch nie ein
        // Netzwerk-Abo, zahlendeSet bleibt hier also leer -> istNetzwerkpartner: false.
        const zahlendeSet = await ladeZahlendeSvSet(admin, candidates.map((c) => c.svId))
        const cand = candidates[0]
        const slots = await slotsFuer(cand.svId, FIXER_MAX_SLOTS)
        if (slots.length > 0) {
          return [
            toOeffentlichesSvProfil({
              candidate: cand,
              bewertung: cand.profileId ? bewById.get(cand.profileId) ?? null : null,
              profil: cand.profileId ? profilById.get(cand.profileId) ?? null : null,
              slots,
              rang: rangById.get(cand.svId) ?? null,
              istNetzwerkpartner: zahlendeSet.has(cand.svId),
            }),
          ]
        }
      }
    }
  }

  return profile
}
