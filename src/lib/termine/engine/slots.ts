import type { SupabaseClient } from '@supabase/supabase-js'
import type { SlotEtaContext } from '@/lib/dispatch/reachability'
import type { Assignee, TagSlot, TagVerfuegbarkeit, FreieSlotsOpts } from './types'
import { ladeBelegung } from './belegung'
import { TERMIN_DAUER_MIN, TERMIN_PUFFER_MIN } from '@/lib/dispatch/termin-konstanten'
import { KB_BERATUNG_DURATION_MIN } from '@/lib/termine/constants'

const WOCHENTAG_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']
const TAG_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
type BelegtPeriod = { von: Date; bis: Date }

// Default-Arbeitszeiten wenn nichts konfiguriert ist — Parität zu ladeFreieSlots/getAvailableKbSlots.
// (Befund 02.06.: alle 10 SVs haben arbeitszeiten=null -> ohne Default = 0 Slots ueberall.)
const DEFAULT_SV_ARBEITSZEITEN: Record<string, { von: string; bis: string }> = {
  mo: { von: '09:00', bis: '17:00' },
  di: { von: '09:00', bis: '17:00' },
  mi: { von: '09:00', bis: '17:00' },
  do: { von: '09:00', bis: '17:00' },
  fr: { von: '09:00', bis: '16:00' },
}
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
  for (let s = arbeitszeit.vonMin; s + slotDauerMin <= arbeitszeit.bisMin; s += slotDauerMin) {
    const von = new Date(tag)
    von.setHours(Math.floor(s / 60), s % 60, 0, 0)
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
async function konfigFuerAssignee(db: SupabaseClient, assignee: Assignee): Promise<AssigneeKalenderKonfig> {
  if (assignee.typ === 'sachverstaendiger') {
    const { data } = await db
      .from('sachverstaendige')
      .select('arbeitszeiten, blockierte_wochentage')
      .eq('id', assignee.id)
      .maybeSingle()
    // Existiert der SV nicht -> keine Slots (kein Default fuer Phantom-IDs).
    if (!data) return { slotDauerMin: TERMIN_DAUER_MIN, pufferMin: TERMIN_PUFFER_MIN, reachability: true, proWochentag: () => null }
    const az = (data.arbeitszeiten as Record<string, { von: string; bis: string } | undefined> | null) ?? DEFAULT_SV_ARBEITSZEITEN
    const blocked = (data.blockierte_wochentage as number[] | null) ?? []
    return {
      slotDauerMin: TERMIN_DAUER_MIN,
      pufferMin: TERMIN_PUFFER_MIN,
      reachability: true,
      proWochentag: (dowJs) => {
        const dowIso = dowJs === 0 ? 7 : dowJs
        if (blocked.includes(dowIso)) return null
        const t = az[TAG_KEYS[dowJs]]
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

  const result: TagVerfuegbarkeit[] = []
  const cur = new Date(vonIso)
  cur.setHours(0, 0, 0, 0)
  const ende = new Date(bisIso)
  while (cur <= ende) {
    const dowJs = cur.getDay()
    const az = konfig.proWochentag(dowJs)
    let slots: TagSlot[] = az ? slotsFuerTag(cur, az, belegt, konfig.slotDauerMin, konfig.pufferMin) : []
    if (slots.length && etaCtx && isReachable) {
      const tagRef = new Date(cur)
      const reach = isReachable
      const ctx = etaCtx
      slots = slots.filter((s) => {
        const [h, m] = s.uhrzeit.split(':').map(Number)
        const sv = new Date(tagRef)
        sv.setHours(h, m, 0, 0)
        return reach(sv, new Date(sv.getTime() + s.dauer * 60_000), ctx).reachable
      })
    }
    result.push({
      // Lokale Kalenderdatum (passt zu den lokal erzeugten Slot-Zeiten; auf UTC-Server
      // identisch zu toISOString, in +TZ-Umgebungen ohne Off-by-one).
      datum: `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`,
      wochentag: WOCHENTAG_LABELS[dowJs],
      frei: slots.length > 0,
      anzahl_slots: slots.length,
      slots,
    })
    cur.setDate(cur.getDate() + 1)
  }
  return result
}
