// Sub-A2 (universelle Termin-Engine): der universelle 2×2-Buchungs-Router.
// Assignee bekannt/unbekannt × Slot bekannt/unbekannt → freieSlots / findeBestePerson / reserviere.
// Kunde-Gesicht: max 3 Slots, 2 beim Best-Match + 1 beim Zweitbesten (adaptiv). Spec §2/§3.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Assignee, BezugTyp } from './types'
import { findeBestePerson, type PersonKandidat } from './matching'
import { freieSlots } from './slots'
import { reserviere, type Quelle, type TerminTyp } from './writes'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { TERMIN_DAUER_MIN } from '@/lib/dispatch/termin-konstanten'

export type WunschzeitFilter = {
  /** exakter Tag 'YYYY-MM-DD'. */
  tag?: string | null
  /** Tageszeit-Fenster 'HH:mm'. */
  vonUhr?: string | null
  bisUhr?: string | null
  /** ISO — wenn gesetzt: gefilterte Slots nach Nähe sortieren (auch Buchungs-Anker bei modus='buchen'). */
  naheZeitpunkt?: string | null
}

export type SlotVorschlag = {
  assignee: Assignee
  name: string
  von: string
  bis: string
  score?: number
  etaVomBueroMin?: number | null
  reasons?: string[]
}

export type PlaneTerminResult =
  | { ok: true; kind: 'slots'; vorschlaege: SlotVorschlag[] }
  | { ok: true; kind: 'gebucht'; terminId: string; assignee: Assignee; von: string; bis: string; reserviertBis: string }
  | { ok: false; code: 'kein_kandidat' | 'kein_slot' | 'belegt' | 'db' | 'nicht_unterstuetzt'; error: string }

export interface PlaneTerminInput {
  bezug: { typ: BezugTyp; id: string }
  quelle: Quelle
  assigneeTyp: 'sachverstaendiger' | 'kundenbetreuer'
  /** gesetzt = FIX (SV-Embed/zugewiesener KB); null = MATCH. */
  assignee?: Assignee | null
  schadenort?: { lat: number; lng: number } | null
  wunschzeit?: WunschzeitFilter | null
  modus: 'vorschlagen' | 'buchen'
  /** 'video'|'telefon' (KB) → remote, keine Reachability. */
  kanal?: 'vor_ort' | 'video' | 'telefon'
  organisationId?: string | null
  excludeAssigneeIds?: string[]
  stickyAssigneeId?: string | null
  dauerMin?: number
  fensterTage?: number
  db?: SupabaseClient
}

type IsoSlot = { von: string; bis: string }

/** Pures Prädikat: passt ein freier Slot (Wall-Clock) zum Wunschzeit-Filter? */
export function passtZuWunschzeit(slot: { datum: string; uhrzeit: string }, w?: WunschzeitFilter | null): boolean {
  if (!w) return true
  if (w.tag && slot.datum !== w.tag) return false
  if (w.vonUhr && slot.uhrzeit < w.vonUhr) return false
  if (w.bisUhr && slot.uhrzeit > w.bisUhr) return false
  return true
}

/**
 * PURE Kunde-Verteilung: max 3 Slots, 2 beim Best (proKandidat[0]) + 1 beim Zweitbesten;
 * adaptiv — Best hat <2 → auffüllen; nur 1 Kandidat → bis 3 bei ihm. Spec §3.
 */
export function verteileAusSlots(proKandidat: { k: PersonKandidat; slots: IsoSlot[] }[]): SlotVorschlag[] {
  const vorschlag = (k: PersonKandidat, s: IsoSlot): SlotVorschlag => ({
    assignee: k.assignee, name: k.name, von: s.von, bis: s.bis,
    score: k.score, etaVomBueroMin: k.etaVomBueroMin, reasons: k.reasons,
  })
  const result: SlotVorschlag[] = []
  const best = proKandidat[0]
  if (best) for (const s of best.slots.slice(0, 2)) result.push(vorschlag(best.k, s))
  for (const pk of proKandidat.slice(1)) {
    if (result.length >= 3) break
    if (pk.slots[0]) result.push(vorschlag(pk.k, pk.slots[0]))
  }
  // Auffüllen wenn <3: weitere vom Best, dann von den anderen.
  if (result.length < 3 && best) for (const s of best.slots.slice(2)) {
    if (result.length >= 3) break
    result.push(vorschlag(best.k, s))
  }
  if (result.length < 3) for (const pk of proKandidat.slice(1)) {
    for (const s of pk.slots.slice(1)) { if (result.length >= 3) break; result.push(vorschlag(pk.k, s)) }
    if (result.length >= 3) break
  }
  return result.slice(0, 3)
}

/** freie Slots eines Assignees als ISO-Slots, Wunschzeit-gefiltert + (optional) nach Nähe sortiert. */
async function slotsFuerAssignee(
  assignee: Assignee, schadenort: { lat: number; lng: number } | null,
  wunschzeit: WunschzeitFilter | null, vonIso: string, bisIso: string, db: SupabaseClient,
): Promise<IsoSlot[]> {
  const tage = await freieSlots(assignee, vonIso, bisIso, schadenort ? { schadenort } : {}, db)
  const slots: IsoSlot[] = tage.flatMap((t) =>
    t.slots
      .filter((s) => passtZuWunschzeit({ datum: t.datum, uhrzeit: s.uhrzeit }, wunschzeit))
      .map((s) => {
        const von = new Date(berlinWallClockToUtc(`${t.datum}T${s.uhrzeit}:00`))
        return { von: von.toISOString(), bis: new Date(von.getTime() + s.dauer * 60_000).toISOString() }
      }),
  )
  if (wunschzeit?.naheZeitpunkt) {
    const ziel = new Date(wunschzeit.naheZeitpunkt).getTime()
    slots.sort((a, b) => Math.abs(new Date(a.von).getTime() - ziel) - Math.abs(new Date(b.von).getTime() - ziel))
  }
  return slots
}

/** Orchestriert: pro Top-Kandidat freie Slots holen, dann PURE 2+1-Verteilung. */
export async function verteile3Slots(
  kandidaten: PersonKandidat[], schadenort: { lat: number; lng: number } | null,
  wunschzeit: WunschzeitFilter | null, vonIso: string, bisIso: string, db: SupabaseClient,
): Promise<SlotVorschlag[]> {
  const proKandidat: { k: PersonKandidat; slots: IsoSlot[] }[] = []
  for (const k of kandidaten.slice(0, 3)) {
    proKandidat.push({ k, slots: await slotsFuerAssignee(k.assignee, schadenort, wunschzeit, vonIso, bisIso, db) })
  }
  return verteileAusSlots(proKandidat)
}

function terminTyp(input: PlaneTerminInput): TerminTyp {
  return input.assigneeTyp === 'kundenbetreuer' ? 'kb_beratung' : 'sv_begutachtung'
}

/**
 * Universeller 2×2-Buchungs-Eingang (Kunde-/Self-Service-/SV-Embed-/KB-Gesicht).
 * 'vorschlagen' → max 3 Slots (verteilt oder vom fixen Assignee); 'buchen' → reserviert.
 * Dispatch nutzt separat findBestSV (gerankte Kandidatenliste).
 */
export async function planeTermin(input: PlaneTerminInput): Promise<PlaneTerminResult> {
  const db = input.db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const dauerMin = input.dauerMin ?? TERMIN_DAUER_MIN
  const remote = input.kanal === 'video' || input.kanal === 'telefon'
  const schadenort = remote ? null : (input.schadenort ?? null)
  const vonIso = new Date().toISOString()
  const bisIso = new Date(Date.now() + (input.fensterTage ?? 28) * 24 * 60 * 60_000).toISOString()
  const wunschzeit = input.wunschzeit ?? null

  // ── Assignee FIX (SV-Embed / zugewiesener KB) ─────────────────────────────
  if (input.assignee) {
    if (input.modus === 'buchen' && wunschzeit?.naheZeitpunkt) {
      const von = new Date(wunschzeit.naheZeitpunkt).toISOString()
      const bis = new Date(new Date(von).getTime() + dauerMin * 60_000).toISOString()
      const res = await reserviere({ assignee: input.assignee, von, bis, quelle: input.quelle, typ: terminTyp(input), bezug: input.bezug, db })
      if (res.ok) return { ok: true, kind: 'gebucht', terminId: res.terminId, assignee: input.assignee, von, bis, reserviertBis: res.reserviertBis }
      // test_guard -> 'db' mappen (analog matching.ts); der beschreibende Grund reist in res.error.
      return { ok: false, code: res.code === 'test_guard' ? 'db' : res.code, error: res.error }
    }
    const slots = await slotsFuerAssignee(input.assignee, schadenort, wunschzeit, vonIso, bisIso, db)
    return {
      ok: true, kind: 'slots',
      vorschlaege: slots.slice(0, 3).map((s) => ({ assignee: input.assignee!, name: '', von: s.von, bis: s.bis })),
    }
  }

  // ── Assignee UNBEKANNT → Match ───────────────────────────────────────────
  if (input.assigneeTyp !== 'sachverstaendiger') {
    return { ok: false, code: 'nicht_unterstuetzt', error: 'KB-Matching offen — KB läuft über zugewiesenen KB (assignee fix)' }
  }
  if (!schadenort) return { ok: false, code: 'kein_kandidat', error: 'Schadenort für SV-Matching nötig' }
  const res = await findeBestePerson({
    schadenort, bezug: input.bezug, quelle: input.quelle,
    wunschterminIso: wunschzeit?.naheZeitpunkt ?? null,
    organisationId: input.organisationId ?? null,
    excludeAssigneeIds: input.excludeAssigneeIds ?? [],
    stickyAssigneeId: input.stickyAssigneeId ?? null,
    topN: 3, nurVorschlag: true, assigneeTyp: 'sachverstaendiger', dauerMin,
    fensterTage: input.fensterTage, db,
  })
  if (!res.ok) return { ok: false, code: res.code, error: res.error }
  if (res.gebucht) return { ok: false, code: 'db', error: 'unerwartet gebucht (nurVorschlag)' }
  const vorschlaege = await verteile3Slots(res.kandidaten, schadenort, wunschzeit, vonIso, bisIso, db)
  if (vorschlaege.length === 0) return { ok: false, code: 'kein_slot', error: 'Keine buchbaren Slots im Fenster' }
  return { ok: true, kind: 'slots', vorschlaege }
}
