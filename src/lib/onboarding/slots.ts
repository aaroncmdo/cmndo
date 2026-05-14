'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { getSvBusySlots } from '@/lib/google-calendar/busy-slots'
import { TERMIN_DAUER_MIN, TERMIN_PUFFER_MIN } from '@/lib/dispatch/termin-konstanten'
import { precomputeSvSlotEtas, isSlotReachable } from '@/lib/dispatch/reachability'

export type TagSlot = {
  uhrzeit: string // 'HH:MM'
  dauer: number   // Minuten
}

export type TagVerfuegbarkeit = {
  datum: string       // 'YYYY-MM-DD'
  wochentag: string   // 'Mo' | 'Di' | ...
  frei: boolean
  anzahl_slots: number
  slots: TagSlot[]
}

type Arbeitszeiten = {
  [tag: string]: { von: string; bis: string } | undefined
}

const DEFAULT_ARBEITSZEITEN: Arbeitszeiten = {
  mo: { von: '09:00', bis: '17:00' },
  di: { von: '09:00', bis: '17:00' },
  mi: { von: '09:00', bis: '17:00' },
  do: { von: '09:00', bis: '17:00' },
  fr: { von: '09:00', bis: '16:00' },
}

const WOCHENTAG_KEYS = ['so', 'mo', 'di', 'mi', 'do', 'fr', 'sa']
const WOCHENTAG_LABELS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

// Slot-Dauer identisch zu Dispatch (TERMIN_DAUER_MIN = 45 Min).
const SLOT_DAUER = TERMIN_DAUER_MIN

function zeitZuMinuten(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number)
  return h * 60 + (m ?? 0)
}

function minutenZuZeit(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

type BelegtesPeriod = { von: Date; bis: Date }

function istPeriodBelegt(von: Date, bis: Date, perioden: BelegtesPeriod[]): boolean {
  // Inklusive TERMIN_PUFFER_MIN — analog zu Dispatch-Reachability-Check
  const vonMitPuffer = new Date(von.getTime() - TERMIN_PUFFER_MIN * 60_000)
  const bisMitPuffer = new Date(bis.getTime() + TERMIN_PUFFER_MIN * 60_000)
  return perioden.some(p => p.von < bisMitPuffer && p.bis > vonMitPuffer)
}

export async function ladeFreieSlots(
  svId: string,
  datumVon: Date,
  datumBis: Date,
  // Optional: Schadenort des Kunden für ETA-Reachability-Check (analog Dispatch).
  // Wenn übergeben, werden Slots gefiltert die der SV vom Vor-/Nachtermin
  // nicht erreichbar ist (Mapbox-Matrix, identisch zu getNextFreeSlotsForSv).
  schadenort?: { lat: number; lng: number } | null,
): Promise<TagVerfuegbarkeit[]> {
  // Service-Client: Kunden im Wizard sind anonym — kein auth.getUser() nötig.
  const supabase = createAdminClient()

  // SV-Daten: Arbeitszeiten, blockierte_wochentage, profile_id für Google-/CalDAV-Check
  const { data: svRow } = await supabase
    .from('sachverstaendige')
    .select('arbeitszeiten, blockierte_wochentage, profile_id')
    .eq('id', svId)
    .single()

  const arbeitszeiten: Arbeitszeiten =
    (svRow?.arbeitszeiten as Arbeitszeiten | null) ?? DEFAULT_ARBEITSZEITEN

  const blockierteWochentage: number[] =
    (svRow?.blockierte_wochentage as number[] | null) ?? []

  const profileId: string | null = (svRow?.profile_id as string | null) ?? null

  // Claimondo-Termine (gutachter_termine) im Zeitraum — analog zu getNextFreeSlotsForSv
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select('start_zeit, end_zeit')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt")')
    .gte('start_zeit', datumVon.toISOString())
    .lte('start_zeit', datumBis.toISOString())

  // GFA-Reservierungen (Wizard-Anfragen) — das neue Element gegenüber Dispatch
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: reservierungen } = await (supabase as any)
    .from('gutachter_finder_anfragen')
    .select('reservierter_slot_von, reservierter_slot_bis')
    .eq('reservierter_sv_id', svId)
    .gte('reservierter_slot_von', datumVon.toISOString())
    .lte('reservierter_slot_von', datumBis.toISOString())
    .not('status', 'in', '("abgeschlossen","storniert","entwurf")')

  // Google Calendar + CalDAV Busy-Slots (fail-open: Fehler = leer)
  let externBusy: { start: string; end: string }[] = []
  if (profileId) {
    try {
      externBusy = await getSvBusySlots(profileId, datumVon.toISOString(), datumBis.toISOString())
    } catch {
      // Extern-Kalender nicht verfügbar — weiter ohne externe Blockierungen
    }
  }

  // ETA-Reachability-Kontext (analog zu getNextFreeSlotsForSv + precomputeSvSlotEtas).
  // Nur wenn der Schadenort bekannt ist — ansonsten kein Reachability-Filter.
  let etaCtx: Awaited<ReturnType<typeof precomputeSvSlotEtas>> | null = null
  if (schadenort?.lat != null && schadenort?.lng != null) {
    try {
      etaCtx = await precomputeSvSlotEtas(
        supabase,
        svId,
        { lat: schadenort.lat, lng: schadenort.lng },
        datumVon.toISOString(),
        datumBis.toISOString(),
      )
    } catch {
      // Mapbox nicht verfügbar — weiter ohne Reachability-Check
    }
  }

  const belegte: BelegtesPeriod[] = [
    ...(termine ?? []).map((t: { start_zeit: string; end_zeit: string }) => ({
      von: new Date(t.start_zeit),
      bis: new Date(t.end_zeit),
    })),
    ...(reservierungen ?? []).map((r: { reservierter_slot_von: string; reservierter_slot_bis: string }) => ({
      von: new Date(r.reservierter_slot_von),
      bis: new Date(r.reservierter_slot_bis),
    })),
    ...externBusy.map(b => ({
      von: new Date(b.start),
      bis: new Date(b.end),
    })),
  ]

  const result: TagVerfuegbarkeit[] = []
  const current = new Date(datumVon)
  current.setHours(0, 0, 0, 0)

  while (current <= datumBis) {
    const dowJs = current.getDay() // 0=So, 1=Mo, ..., 6=Sa
    // Dispatch nutzt ISO-Wochentag (1=Mo...7=So) in blockierte_wochentage
    const dowIso = dowJs === 0 ? 7 : dowJs
    const tagKey = WOCHENTAG_KEYS[dowJs]
    const tagLabel = WOCHENTAG_LABELS[dowJs]
    const az = arbeitszeiten[tagKey]
    const datum = current.toISOString().split('T')[0]

    const tagesSlots: TagSlot[] = []

    const istBlockiert = blockierteWochentage.includes(dowIso)

    if (az && !istBlockiert) {
      const vonMin = zeitZuMinuten(az.von)
      const bisMin = zeitZuMinuten(az.bis)

      for (let slotStart = vonMin; slotStart + SLOT_DAUER <= bisMin; slotStart += SLOT_DAUER) {
        const slotVon = new Date(current)
        slotVon.setHours(Math.floor(slotStart / 60), slotStart % 60, 0, 0)
        const slotBis = new Date(slotVon.getTime() + SLOT_DAUER * 60_000)

        if (!istPeriodBelegt(slotVon, slotBis, belegte)) {
          // ETA-Reachability: Slot nur anbieten wenn SV ihn vom Vor-/Nachtermin
          // erreichen kann — identisch zu isSlotReachable in getNextFreeSlotsForSv.
          if (etaCtx) {
            const reach = isSlotReachable(slotVon, slotBis, etaCtx)
            if (!reach.reachable) continue
          }
          tagesSlots.push({
            uhrzeit: minutenZuZeit(slotStart),
            dauer: SLOT_DAUER,
          })
        }
      }
    }

    result.push({
      datum,
      wochentag: tagLabel,
      frei: tagesSlots.length > 0,
      anzahl_slots: tagesSlots.length,
      slots: tagesSlots,
    })

    current.setDate(current.getDate() + 1)
  }

  return result
}

/**
 * 2026-05-11 Funnel v2: Tier-aware Slot-Loader. Wrapper um ladeFreieSlots
 * (Tier 1, echte SVs) und getStandardSlots (Tier 3, sv_leads).
 *
 * Wird vom SlotField im DynamicWizard genutzt — dieser bekommt entweder
 * eine svId oder svLeadId aus den Wizard-Values (gesetzt durch die
 * Karten-Auswahl in /gutachter-finden).
 */
export async function ladeSlotsFuerTier(input: {
  svId?: string | null
  svLeadId?: string | null
  datumVon: Date
  datumBis: Date
  schadenort?: { lat: number; lng: number } | null
}): Promise<TagVerfuegbarkeit[]> {
  if (input.svId) {
    return ladeFreieSlots(input.svId, input.datumVon, input.datumBis, input.schadenort)
  }
  if (input.svLeadId) {
    const { getStandardSlots } = await import('@/lib/slots/standard-availability')
    return getStandardSlots(input.svLeadId, input.datumVon, input.datumBis)
  }
  // Weder Tier 1 noch Tier 3 — leere Liste, SlotField faellt auf Demo zurueck
  return []
}

export async function reserviereSlot(
  anfrageId: string,
  svId: string,
  vonISO: string,
  bisISO: string,
  // 2026-05-11 Funnel v2: bei Tier-3-Termin (sv_leads) wird sv_lead_id statt
  // sv_id gesetzt. Mindestens einer von beiden Pflicht.
  svLeadId: string | null = null,
): Promise<{ ok: true; terminId: string } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  // 2026-05-13: Idempotenz — wenn die GFA bereits einen reservierten Slot hat
  // (Wizard-Back-Forward / Re-Auswahl), vorherigen Termin als 'abgelehnt'
  // markieren bevor neuer eingefuegt wird. Sonst ergibt sich pro Phasen-
  // Submit ein neuer gutachter_termine-Row mit status='reserviert'.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gfaCurrent } = await (supabase as any)
    .from('gutachter_finder_anfragen')
    .select('reservierter_slot_von, reservierter_sv_id, zugeordneter_sv_lead_id')
    .eq('id', anfrageId)
    .maybeSingle()

  if (gfaCurrent?.reservierter_slot_von) {
    if (gfaCurrent.reservierter_sv_id) {
      await supabase
        .from('gutachter_termine')
        .update({ status: 'abgelehnt' })
        .eq('sv_id', gfaCurrent.reservierter_sv_id)
        .eq('start_zeit', gfaCurrent.reservierter_slot_von)
        .eq('status', 'reserviert')
    }
    if (gfaCurrent.zugeordneter_sv_lead_id) {
      await supabase
        .from('gutachter_termine')
        .update({ status: 'abgelehnt' })
        .eq('sv_lead_id', gfaCurrent.zugeordneter_sv_lead_id)
        .eq('start_zeit', gfaCurrent.reservierter_slot_von)
        .eq('status', 'pre_flowlink_reserviert')
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: gfaErr } = await (supabase as any)
    .from('gutachter_finder_anfragen')
    .update({
      reservierter_slot_von: vonISO,
      reservierter_slot_bis: bisISO,
      reservierter_sv_id: svLeadId ? null : svId,
      zugeordneter_sv_lead_id: svLeadId ?? null,
      matching_typ: svLeadId ? 'lead_fallback' : 'isochron',
    })
    .eq('id', anfrageId)

  if (gfaErr) return { ok: false, error: gfaErr.message }

  // Vorläufigen Termin mit status='reserviert' anlegen.
  // Tier 1 (svId): wird nach SA via bestaetigeSlot() auf 'geplant' gesetzt.
  // Tier 3 (svLeadId): bleibt bei 'pre_flowlink_reserviert', Dispatcher
  // bestaetigt manuell mit dem SV per Telefon.
  const { data: terminData, error: terminErr } = await supabase
    .from('gutachter_termine')
    .insert({
      sv_id: svLeadId ? null : svId,
      sv_lead_id: svLeadId,
      start_zeit: vonISO,
      end_zeit: bisISO,
      status: svLeadId ? 'pre_flowlink_reserviert' : 'reserviert',
      typ: 'vor_ort',
    })
    .select('id')
    .single()

  if (terminErr || !terminData) {
    return { ok: false, error: terminErr?.message ?? 'Termin-Insert fehlgeschlagen' }
  }

  // SV-Heute/-Feldmodus zeigt neue Termine, Dispatch-Leads die Reservierung.
  revalidatePath('/gutachter/heute')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/dispatch/leads')
  revalidatePath('/gutachter-finden')

  return { ok: true, terminId: terminData.id }
}

export async function bestaetigeSlot(
  anfrageId: string,
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()

  const { error: terminErr } = await supabase
    .from('gutachter_termine')
    .update({ status: 'geplant' })
    .eq('id', terminId)
    .eq('status', 'reserviert')

  if (terminErr) return { ok: false, error: terminErr.message }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('gutachter_finder_anfragen')
    .update({ status: 'neu' })
    .eq('id', anfrageId)

  revalidatePath('/gutachter/heute')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/dispatch/leads')

  return { ok: true }
}
