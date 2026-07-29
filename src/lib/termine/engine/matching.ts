// P2.4 — findeBestePerson: assignee-generische Org-/Region-Level-Buchung.
// Pickt die beste buchbare Person (Score + Tenure-Tie-Break), wählt einen erreichbaren
// freien Slot (engine freieSlots) und reserviert ihn (engine reserviere, race-sicher).
// Konkret implementiert für assignee_typ='sachverstaendiger' (Pool sachverstaendige);
// andere Typen → 'nicht_unterstuetzt' (wie freieSlots).
//
// Port-Hinweis (Aaron 02.06.): das SV-Ranking ist aus lib/dispatch/findBestSV in die Engine
// portiert (matching-score.ts). findBestSV bleibt vorerst unangetastet; der Phase-3-Repoint
// macht es zum Thin-Wrapper. parseIsochrone/mapboxEtaMatrix werden als stabile pure Utils
// importiert (kein Re-Derive).
//
// Org-Scope (P2.4): nur thin organisationId-Pass-Through. gebiet_exklusivitaeten +
// rolle_in_organisation sind DEFERRED (live 0 Orgs/0 Gebiete) — Extension-Point unten markiert.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BezugTyp } from './types'
import { reserviere, type Quelle, type TerminTyp } from './writes'
import { pruefeBelegungStrict } from './belegung'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { freieSlots } from './slots'
import {
  bewerteSvKandidat, sortiereKandidaten, istKontingentBlockiert,
  haversineKm, pointInPolygon, ersterFreierSlot, rangToOrdinal, type RankbarerKandidat,
} from './matching-score'
import { getPartnerRangBatch } from '@/lib/partner-rang/get'
import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'
import { applyDispatchableFilter } from '@/lib/sv/queries'
import { parseIsochrone } from '@/lib/dispatch/isochrone-parse'
import { mapboxEtaMatrix } from '@/lib/mapbox/matrix'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'

const DEFAULT_FENSTER_TAGE = 28
// AAR-369: Soft-Boost fuer Fach-Spezialisierung — ein SV, dessen Spezifikationen die
// Fall-Spezifikation enthalten, bekommt +N Score. >= SCORE_BUCKET (5, matching-score.ts)
// damit der Bonus die Rangfolge wirklich verschiebt. KEIN harter Filter — Geo (Isochrone),
// Paket-Kontingent und Verfuegbarkeit bleiben die primaeren Gates; Spezialisierung ist der
// entscheidende Tie-Break unter aehnlich passenden SVs.
const SPEZ_MATCH_BONUS = 8

export interface FindeBestePersonInput {
  schadenort: { lat: number; lng: number }
  bezug: { typ: BezugTyp; id: string }
  quelle: Quelle
  wunschterminIso?: string | null
  dauerMin?: number
  fensterTage?: number
  /** Thin Org-Hook: schränkt den Pool auf sachverstaendige.organisation_id ein. */
  organisationId?: string | null
  excludeAssigneeIds?: string[]
  /** Kontinuität: dieser Assignee bekommt +1000 Score-Bonus, wenn im Pool (Sticky-SV). */
  stickyAssigneeId?: string | null
  topN?: number
  /** true = Rangliste + Slot-Vorschlag OHNE reserviere (Dispatch-"Vorschlagen"). */
  nurVorschlag?: boolean
  typ?: TerminTyp
  assigneeTyp?: 'sachverstaendiger'
  db?: SupabaseClient
}

export interface PersonKandidat {
  assignee: Assignee
  name: string
  score: number
  distanzKm: number
  etaVomBueroMin: number | null
  slotVon: string | null
  slotBis: string | null
  reasons: string[]
  // SvMatchCandidate-Parität (additiv, für den findBestSV-Thin-Wrapper in Sub-A):
  profileId?: string | null
  paket?: string
  offeneFaelle?: number
  kontingentFrei?: number
  ablehnungen30d?: number
  verfuegbarAmWunschtermin?: boolean
  naechsterFreierSlot?: string | null
}

export type FindeBestePersonResult =
  | {
      ok: true; gebucht: true
      assignee: Assignee; terminId: string; reserviertBis: string
      slotVon: string; slotBis: string
      kandidat: PersonKandidat; alternativen: PersonKandidat[]
    }
  | { ok: true; gebucht: false; kandidaten: PersonKandidat[] }
  | { ok: false; code: 'kein_kandidat' | 'kein_slot' | 'belegt' | 'db' | 'nicht_unterstuetzt'; error: string }

interface SvRow {
  id: string
  profile_id: string | null
  paket: string | null
  standort_lat: number | null
  standort_lng: number | null
  isochrone_polygon: unknown
  paket_umkreis_km: number | null
  spezifikationen: string[] | null
  paket_faelle_gesamt: number | null
  paket_faelle_genutzt: number | null
  offene_faelle: number | null
  ablehnungen_30_tage: number | null
  urlaub_von: string | null
  urlaub_bis: string | null
  partner_seit: string | null
  created_at: string | null
  profiles:
    | { vorname: string | null; nachname: string | null }
    | { vorname: string | null; nachname: string | null }[]
    | null
}

export async function findeBestePerson(input: FindeBestePersonInput): Promise<FindeBestePersonResult> {
  const {
    schadenort, bezug, quelle,
    wunschterminIso = null,
    dauerMin = TERMIN_DAUER_MIN,
    fensterTage = DEFAULT_FENSTER_TAGE,
    organisationId = null,
    excludeAssigneeIds = [],
    stickyAssigneeId = null,
    topN = 3,
    nurVorschlag = false,
    typ = 'sv_begutachtung',
    assigneeTyp = 'sachverstaendiger',
  } = input

  if (assigneeTyp !== 'sachverstaendiger') {
    return { ok: false, code: 'nicht_unterstuetzt', error: `findeBestePerson: assignee_typ '${assigneeTyp}' noch nicht unterstuetzt (P2.4: nur sachverstaendiger)` }
  }
  const db: SupabaseClient = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()

  // 1. Pool: dispatchable SVs (+ optional Org-Filter, thin Hook).
  // DEFERRED Extension-Point: hier später rolle_in_organisation-Whitelist +
  // gebiet_exklusivitaeten-Isochron-Intersection einhängen (live 0 Daten → YAGNI).
  let query = db.from('sachverstaendige').select(
    'id, profile_id, paket, standort_lat, standort_lng, isochrone_polygon, paket_umkreis_km, spezifikationen, '
    + 'paket_faelle_gesamt, paket_faelle_genutzt, offene_faelle, ablehnungen_30_tage, '
    + 'urlaub_von, urlaub_bis, partner_seit, created_at, '
    + 'profiles!sachverstaendige_profile_id_fkey(vorname, nachname)',
  )
  if (organisationId) query = query.eq('organisation_id', organisationId)
  const { data: svRaw, error: svErr } = await applyDispatchableFilter(query)
  if (svErr) return { ok: false, code: 'db', error: svErr.message }
  const exclude = new Set(excludeAssigneeIds)
  const pool = ((svRaw ?? []) as unknown as SvRow[]).filter(
    (sv) => !exclude.has(sv.id) && sv.standort_lat != null && sv.standort_lng != null,
  )
  if (pool.length === 0) return { ok: false, code: 'kein_kandidat', error: 'Keine buchbaren SVs im Pool' }

  // AAR-369: Fall-Spezifikation (best-effort) fuer den Spezialisierungs-Soft-Boost laden.
  // bezug.id ist i.d.R. ein claim_id (direkt) oder ein fall_id (via faelle_claim_bridge).
  // Kein Boost wenn nicht ladbar (z.B. Lead-basiertes Matching ohne Claim) → voll
  // rueckwaerts-kompatibel; die Gebiets-/Slot-Logik bleibt unberuehrt.
  let fallSpezifikation: string | null = null
  try {
    const { data: cDirect } = await db.from('claims').select('spezifikation').eq('id', bezug.id).maybeSingle()
    fallSpezifikation = (cDirect?.spezifikation as string | null) ?? null
    if (!fallSpezifikation) {
      const { data: bridge } = await db
        .from('faelle_claim_bridge')
        .select('claims:claims!fk_bridge_claim(spezifikation)')
        .eq('fall_id', bezug.id)
        .maybeSingle()
      const c = Array.isArray(bridge?.claims) ? bridge?.claims[0] : bridge?.claims
      fallSpezifikation = ((c as { spezifikation: string | null } | null | undefined)?.spezifikation) ?? null
    }
  } catch { /* Boost entfaellt */ }

  // 2. Gebiet-Filter (NUR Isochrone — Aaron 12.06.: „nur über die Isochrone, wir brauchen den
  //    Radius nicht") + Kontingent — billige Geo/Logik VOR Mapbox. Der frühere Umkreis-Radius-
  //    Fallback (paket_umkreis_km) ist raus: ein SV ist nur zuständig, wenn der Schadenort in
  //    seiner Fahrzeit-Isochrone liegt. SVs ohne Isochrone matchen nicht (Daten-Pflicht: die
  //    Isochrone wird beim Profil-Speichern erzeugt). distanzKm bleibt fürs Scoring.
  type ImGebiet = { sv: SvRow; distanzKm: number; reasons: string[] }
  const imGebiet: ImGebiet[] = []
  for (const sv of pool) {
    const paket = sv.paket || 'standard'
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    if (istKontingentBlockiert(paket, kontingentGesamt - kontingentGenutzt)) continue
    const distanzKm = haversineKm(Number(sv.standort_lat), Number(sv.standort_lng), schadenort.lat, schadenort.lng)
    const polygon = parseIsochrone(sv.isochrone_polygon)
    if (!polygon || !pointInPolygon([schadenort.lng, schadenort.lat], polygon)) continue
    imGebiet.push({ sv, distanzKm, reasons: ['im Einsatzgebiet (Isochrone)'] })
  }
  if (imGebiet.length === 0) return { ok: false, code: 'kein_kandidat', error: 'Kein SV im Einsatzgebiet' }

  // 3. Mapbox-ETA Büro→Schadenort (eine Matrix-Call) nur für in-Gebiet-SVs.
  const etaArr = await mapboxEtaMatrix(
    { lat: schadenort.lat, lng: schadenort.lng },
    imGebiet.map((g) => ({ lat: Number(g.sv.standort_lat), lng: Number(g.sv.standort_lng) })),
  )

  // 4. Score + Tenure-Felder.
  // AAR-956 Phase 1c: Rang-Fein-Sort INNERHALB der Paket-Stufe. Flag-gated (ENV
  // PARTNER_RANG_MATCHING; default OFF ⇒ kein rang-Fetch, rangOrdinal undefined ⇒
  // identischer Score wie heute). Kein DB-Read im heißen Matching-Pfad, solange der Flag aus ist.
  const rangAktiv = process.env.PARTNER_RANG_MATCHING === '1'
  const rangById = rangAktiv
    ? await getPartnerRangBatch(db, 'sachverstaendiger', imGebiet.map((g) => g.sv.id as string))
    : null
  // Netzwerk-Boost (13b, Ebene 1): zahlende Netzwerkpartner unter den in-Gebiet-SVs EINMAL
  // vorladen (K10 — kein per-Kandidat-Read im Hot-Path). service-role: `db` ist der Admin-Client.
  const zahlendeSet = await ladeZahlendeSvSet(db, imGebiet.map((g) => g.sv.id as string))
  type Bewertet = PersonKandidat & RankbarerKandidat & { sv: SvRow }
  const bewertet: Bewertet[] = imGebiet.map((g, i) => {
    const sv = g.sv
    const paket = sv.paket || 'standard'
    const kontingentGesamt = Number(sv.paket_faelle_gesamt) || 10
    const kontingentGenutzt = Number(sv.paket_faelle_genutzt) || Number(sv.offene_faelle) || 0
    const kontingentFrei = kontingentGesamt - kontingentGenutzt
    const ablehnungen30d = Number(sv.ablehnungen_30_tage) || 0
    const etaVomBueroMin = etaArr[i] ?? null
    const stickyBonus = stickyAssigneeId && sv.id === stickyAssigneeId ? 1000 : 0
    // AAR-369: Spezialisierungs-Soft-Boost — SV-Spezifikationen enthalten die Fall-Spezifikation.
    const spezBonus =
      fallSpezifikation && Array.isArray(sv.spezifikationen) && sv.spezifikationen.includes(fallSpezifikation)
        ? SPEZ_MATCH_BONUS
        : 0
    const istNetzwerkpartner = zahlendeSet.has(sv.id as string)
    const score = bewerteSvKandidat({ istNetzwerkpartner, kontingentGenutzt, ablehnungen30d, etaVomBueroMin, distanzKm: g.distanzKm, rangOrdinal: rangById ? rangToOrdinal(rangById.get(sv.id as string)?.tier) : undefined }) + stickyBonus + spezBonus
    const profile = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
    const reasons = [...g.reasons, `Paket: ${paket}`]
    if (istNetzwerkpartner) reasons.push('Netzwerkpartner')
    if (etaVomBueroMin != null) reasons.push(`${etaVomBueroMin} min Fahrt vom Büro`)
    if (spezBonus > 0) reasons.push(`Fachgebiet passt (${fallSpezifikation})`)
    if (stickyBonus > 0) reasons.unshift('Bekannter SV (Sticky)')
    return {
      assignee: { typ: 'sachverstaendiger', id: sv.id },
      name: profile ? `${profile.vorname ?? ''} ${profile.nachname ?? ''}`.trim() : '—',
      score, distanzKm: Math.round(g.distanzKm * 10) / 10, etaVomBueroMin,
      slotVon: null, slotBis: null, reasons,
      profileId: (sv.profile_id as string | null) ?? null,
      paket, offeneFaelle: kontingentGenutzt, kontingentFrei, ablehnungen30d,
      partnerSeit: sv.partner_seit, createdAt: sv.created_at, id: sv.id, sv,
    }
  })

  // 5. Sortieren (Score-Bucket + Tenure-Tie-Break), Top-N je einen Slot via freieSlots wählen.
  const sortiert = sortiereKandidaten(bewertet)
  const fensterVonIso = new Date().toISOString()
  const fensterBisIso = new Date(Date.now() + fensterTage * 24 * 60 * 60_000).toISOString()
  const mitSlot: PersonKandidat[] = []
  for (const k of sortiert.slice(0, Math.max(topN, 1))) {
    const slot = await waehleSlot(k.assignee, k.sv, wunschterminIso, dauerMin, fensterVonIso, fensterBisIso, schadenort, db)
    mitSlot.push({
      assignee: k.assignee, name: k.name, score: k.score, distanzKm: k.distanzKm,
      etaVomBueroMin: k.etaVomBueroMin, reasons: k.reasons,
      profileId: k.profileId, paket: k.paket, offeneFaelle: k.offeneFaelle,
      kontingentFrei: k.kontingentFrei, ablehnungen30d: k.ablehnungen30d,
      slotVon: slot?.von ?? null, slotBis: slot?.bis ?? null,
      verfuegbarAmWunschtermin: wunschterminIso ? (slot?.istWunschtermin ?? false) : undefined,
      naechsterFreierSlot: slot && !slot.istWunschtermin ? slot.von : null,
    })
  }

  if (nurVorschlag) return { ok: true, gebucht: false, kandidaten: mitSlot }

  // 6. reserviere auf den ersten Kandidaten mit Slot; bei 'belegt' (Race) den nächsten.
  const buchbar = mitSlot.filter((k) => k.slotVon && k.slotBis)
  if (buchbar.length === 0) return { ok: false, code: 'kein_slot', error: 'Kein freier Slot im Fenster' }
  let letzterFehler = 'Slot belegt'
  for (const k of buchbar) {
    const res = await reserviere({ assignee: k.assignee, von: k.slotVon!, bis: k.slotBis!, quelle, typ, bezug, db })
    if (res.ok) {
      return {
        ok: true, gebucht: true, assignee: k.assignee, terminId: res.terminId, reserviertBis: res.reserviertBis,
        slotVon: k.slotVon!, slotBis: k.slotBis!, kandidat: k,
        alternativen: mitSlot.filter((x) => x.assignee.id !== k.assignee.id),
      }
    }
    if (res.code !== 'belegt') return { ok: false, code: 'db', error: res.error }
    letzterFehler = res.error
  }
  return { ok: false, code: 'belegt', error: letzterFehler }
}

/**
 * Wählt einen buchbaren Slot: Wunschtermin (exakte Belegungsprüfung) bevorzugt, sonst
 * frühester erreichbarer freier Slot via freieSlots. Urlaub wird als zusaetzlicheBelegung
 * injiziert (freieSlots kennt nur v_belegung).
 */
async function waehleSlot(
  assignee: Assignee, sv: SvRow, wunschterminIso: string | null, dauerMin: number,
  fensterVonIso: string, fensterBisIso: string, schadenort: { lat: number; lng: number }, db: SupabaseClient,
): Promise<{ von: string; bis: string; istWunschtermin: boolean } | null> {
  const urlaub = sv.urlaub_von && sv.urlaub_bis ? [{ start: sv.urlaub_von, end: sv.urlaub_bis }] : []
  // Wunschtermin bevorzugt: exakte Belegungsprüfung (final race-sicher via reserviere).
  if (wunschterminIso) {
    const wunsch = new Date(wunschterminIso)
    const inUrlaub = !!sv.urlaub_von && !!sv.urlaub_bis
      && wunsch.getTime() >= new Date(sv.urlaub_von).getTime()
      && wunsch.getTime() <= new Date(sv.urlaub_bis).getTime()
    const wunschIso = Number.isNaN(wunsch.getTime()) ? null : wunsch.toISOString()
    if (wunschIso && !inUrlaub && wunschIso >= fensterVonIso && wunschIso <= fensterBisIso) {
      const bisIso = new Date(wunsch.getTime() + dauerMin * 60_000).toISOString()
      const pre = await pruefeBelegungStrict(assignee, wunschIso, bisIso, db)
      if (pre.ok && pre.frei) return { von: wunschIso, bis: bisIso, istWunschtermin: true }
    }
  }
  // Sonst: frühester erreichbarer freier Slot — NICHT vor "jetzt" (freieSlots liefert heute
  // auch vergangene Arbeitszeit-Slots). notBefore = jetzt als Wall-Clock (gleiche TZ wie die Slots).
  const tage = await freieSlots(assignee, fensterVonIso, fensterBisIso, { schadenort, zusaetzlicheBelegung: urlaub }, db)
  const jetzt = new Date(fensterVonIso)
  const p2 = (n: number) => String(n).padStart(2, '0')
  const notBefore = {
    datum: `${jetzt.getFullYear()}-${p2(jetzt.getMonth() + 1)}-${p2(jetzt.getDate())}`,
    uhrzeit: `${p2(jetzt.getHours())}:${p2(jetzt.getMinutes())}`,
  }
  const slot = ersterFreierSlot(tage, notBefore)
  if (!slot) return null
  // AAR-956 TZ: slot.uhrzeit ist Berlin-Wall-Clock -> echter UTC-Instant.
  const von = new Date(berlinWallClockToUtc(`${slot.datum}T${slot.uhrzeit}:00`))
  return { von: von.toISOString(), bis: new Date(von.getTime() + slot.dauerMin * 60_000).toISOString(), istWunschtermin: false }
}
