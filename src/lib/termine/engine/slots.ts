import type { SupabaseClient } from '@supabase/supabase-js'
import type { SlotEtaContext } from '@/lib/dispatch/reachability'
import type { Assignee, TagSlot, TagVerfuegbarkeit, FreieSlotsOpts } from './types'
import { ladeBelegung } from './belegung'
import { TERMIN_DAUER_MIN, TERMIN_PUFFER_MIN } from '@/lib/dispatch/termin-konstanten'
import { KB_BERATUNG_DURATION_MIN } from '@/lib/termine/constants'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
// Geteilte SV-Arbeitszeiten-Quelle (Default + Block-Logik) — dieselbe Fn nutzt die SV-Kalender-
// Anzeige, damit angezeigte Verfuegbarkeit == angebotene Slots (kein Drift Engine vs. UI).
import { svWochentagArbeitszeit, TAG_KEYS, type SvArbeitszeitenMap } from '@/lib/termine/sv-arbeitszeiten'

const WOCHENTAG_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
type BelegtPeriod = { von: Date; bis: Date }

const DEFAULT_KB_WORKING_HOURS: Record<string, [string, string]> = {
  mo: ['09:00', '17:00'],
  di: ['09:00', '17:00'],
  mi: ['09:00', '17:00'],
  do: ['09:00', '17:00'],
  fr: ['09:00', '17:00'],
}

export function zeitZuMin(z: string): number {
  const [h, m] = z.split(':').map(Number)
  return h * 60 + (m ?? 0)
}
export function minZuZeit(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

/** Reine Slot-Generierung für einen Tag: Arbeitszeit − belegte Perioden (inkl. Puffer beidseitig). */
export function slotsFuerTag(
  tag: Date,
  arbeitszeit: { vonMin: number; bisMin: number },
  belegt: BelegtPeriod[],
  slotDauerMin: number,
  pufferMin: number,
): TagSlot[] {
  const out: TagSlot[] = []
  // AAR-956 TZ: Arbeitszeit ist Berlin-Wall-Clock -> Slot-Instant Berlin-verankert
  // (setHours auf UTC-Node erzeugte +1/+2h Versatz gegen die echten Belegt-Instants).
  const tagDatum = `${tag.getFullYear()}-${String(tag.getMonth() + 1).padStart(2, '0')}-${String(tag.getDate()).padStart(2, '0')}`
  for (let s = arbeitszeit.vonMin; s + slotDauerMin <= arbeitszeit.bisMin; s += slotDauerMin) {
    const von = new Date(berlinWallClockToUtc(`${tagDatum}T${minZuZeit(s)}:00`))
    const bis = new Date(von.getTime() + slotDauerMin * 60_000)
    const vonP = new Date(von.getTime() - pufferMin * 60_000)
    const bisP = new Date(bis.getTime() + pufferMin * 60_000)
    if (!belegt.some((p) => p.von < bisP && p.bis > vonP)) {
      out.push({ uhrzeit: minZuZeit(s), dauer: slotDauerMin })
    }
  }
  return out
}

type TagArbeitszeit = { vonMin: number; bisMin: number } | null
type AssigneeKalenderKonfig = {
  proWochentag: (dowJs: number) => TagArbeitszeit // dowJs 0=So..6=Sa
  slotDauerMin: number
  pufferMin: number
  reachability: boolean
}

/** Arbeitszeiten-Konfig je Assignee-Typ. sachverstaendiger + kundenbetreuer; Rest deferred. */
export async function konfigFuerAssignee(db: SupabaseClient, assignee: Assignee): Promise<AssigneeKalenderKonfig> {
  if (assignee.typ === 'sachverstaendiger') {
    const { data } = await db
      .from('sachverstaendige')
      .select('arbeitszeiten, blockierte_wochentage')
      .eq('id', assignee.id)
      .maybeSingle()
    // Existiert der SV nicht -> keine Slots (kein Default fuer Phantom-IDs).
    if (!data) return { slotDauerMin: TERMIN_DAUER_MIN, pufferMin: TERMIN_PUFFER_MIN, reachability: true, proWochentag: () => null }
    const arbeitszeiten = (data.arbeitszeiten as SvArbeitszeitenMap) ?? null
    const blocked = (data.blockierte_wochentage as number[] | null) ?? null
    return {
      slotDauerMin: TERMIN_DAUER_MIN,
      pufferMin: TERMIN_PUFFER_MIN,
      reachability: true,
      // svWochentagArbeitszeit = geteilte Quelle mit der SV-Kalender-Anzeige (Default + Block-Logik).
      proWochentag: (dowJs) => {
        const t = svWochentagArbeitszeit(arbeitszeiten, blocked, dowJs)
        return t ? { vonMin: zeitZuMin(t.von), bisMin: zeitZuMin(t.bis) } : null
      },
    }
  }
  if (assignee.typ === 'kundenbetreuer') {
    const { data } = await db.from('profiles').select('working_hours').eq('id', assignee.id).maybeSingle()
    if (!data) return { slotDauerMin: KB_BERATUNG_DURATION_MIN, pufferMin: 0, reachability: false, proWochentag: () => null }
    const wh = (data.working_hours as Record<string, [string, string] | null | undefined> | null) ?? DEFAULT_KB_WORKING_HOURS
    return {
      slotDauerMin: KB_BERATUNG_DURATION_MIN,
      pufferMin: 0,
      reachability: false,
      proWochentag: (dowJs) => {
        const t = wh[TAG_KEYS[dowJs]]
        return Array.isArray(t) && t.length >= 2 ? { vonMin: zeitZuMin(t[0]), bisMin: zeitZuMin(t[1]) } : null
      },
    }
  }
  throw new Error(
    `freieSlots: assignee_typ '${assignee.typ}' nicht unterstuetzt (P2.1c: nur sachverstaendiger/kundenbetreuer)`,
  )
}

/**
 * Freie Slots eines Assignees im Fenster [vonIso, bisIso]. Arbeitszeit (je Typ) MINUS
 * ladeBelegung (v_belegung: Buchung UNION extern UNION ausnahme) MINUS opts.zusaetzlicheBelegung
 * MINUS (nur sachverstaendiger) Reachability. Liest v_belegung via service_role.
 */
export async function freieSlots(
  assignee: Assignee,
  vonIso: string,
  bisIso: string,
  opts: FreieSlotsOpts = {},
  db?: SupabaseClient,
): Promise<TagVerfuegbarkeit[]> {
  const client: SupabaseClient = db ?? (await import('@/lib/supabase/admin')).createAdminClient()
  const konfig = await konfigFuerAssignee(client, assignee)

  const belegung = await ladeBelegung(assignee, vonIso, bisIso, client)
  const belegt: BelegtPeriod[] = [
    ...belegung.map((f) => ({ von: new Date(f.start), bis: new Date(f.end) })),
    ...(opts.zusaetzlicheBelegung ?? []).map((b) => ({ von: new Date(b.start), bis: new Date(b.end) })),
  ]

  let etaCtx: SlotEtaContext | null = null
  let isReachable:
    | ((s: Date, e: Date, ctx: SlotEtaContext) => { reachable: boolean; grund?: string })
    | null = null
  if (konfig.reachability && opts.schadenort?.lat != null && opts.schadenort?.lng != null) {
    try {
      const reach = await import('@/lib/dispatch/reachability')
      etaCtx = await reach.precomputeSvSlotEtas(
        client,
        assignee.id,
        { lat: opts.schadenort.lat, lng: opts.schadenort.lng },
        vonIso,
        bisIso,
      )
      isReachable = reach.isSlotReachable
    } catch {
      etaCtx = null
    }
  }

  // AAR-956 TZ: s.uhrzeit ist Berlin-Wall-Clock -> Slot-Instant Berlin-verankert.
  const slotInstant = (tagRef: string, s: TagSlot) => new Date(berlinWallClockToUtc(`${tagRef}T${s.uhrzeit}:00`))
  // now-Floor: das Fenster ist [vonIso, bisIso] — Slots vor dem vonIso-Instant
  // gehoeren NICHT dazu. Ohne Floor liefert slotsFuerTag fuer den heutigen Tag die
  // volle 09:00–Grid (auch bereits vergangene Uhrzeiten), weil cur auf Mitternacht
  // gefloored wird. Paritaet zum alten findNextFreeSlotForSv (floored auf jetzt).
  // Lead-Time-Puffer = Caller-Sache: vonIso = jetzt + Puffer uebergeben.
  const abInstant = new Date(vonIso)

  const result: TagVerfuegbarkeit[] = []
  const cur = new Date(vonIso)
  cur.setHours(0, 0, 0, 0)
  const ende = new Date(bisIso)
  while (cur <= ende) {
    const dowJs = cur.getDay()
    // Lokale Kalenderdatum (passt zu den lokal erzeugten Slot-Zeiten; auf UTC-Server
    // identisch zu toISOString, in +TZ-Umgebungen ohne Off-by-one).
    const tagRef = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    const az = konfig.proWochentag(dowJs)
    let slots: TagSlot[] = az ? slotsFuerTag(cur, az, belegt, konfig.slotDauerMin, konfig.pufferMin) : []
    if (slots.length) slots = slots.filter((s) => slotInstant(tagRef, s) >= abInstant)
    if (slots.length && etaCtx && isReachable) {
      const reach = isReachable
      const ctx = etaCtx
      slots = slots.filter((s) => {
        const sv = slotInstant(tagRef, s)
        return reach(sv, new Date(sv.getTime() + s.dauer * 60_000), ctx).reachable
      })
    }
    result.push({
      datum: tagRef,
      wochentag: WOCHENTAG_LABELS[dowJs],
      frei: slots.length > 0,
      anzahl_slots: slots.length,
      slots,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}
