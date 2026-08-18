'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { freieSlots, pruefeBelegungStrict } from '@/lib/termine/engine'

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

/**
 * Freie Slots eines SVs — seit der Engine-Unifikation ein THIN-WRAPPER auf die engine
 * `freieSlots`. EINE Slot-Quelle für /flow, Dispatch UND Onboarding-Wizard: v_belegung
 * (Buchungen ∪ externe Kalender-Busy ∪ Ausnahmen) + Reachability + now-Floor, 40-min-
 * Slots / 10-min-Puffer. Behebt die frühere Divergenz (Onboarding hatte eine eigene,
 * abweichende Slot-Implementierung — u.a. ohne now-Floor → vergangene Slots).
 *
 * GFA-Wizard-Reservierungen (Soft-Holds bei parallelem Submit) kennt v_belegung NICHT →
 * werden als `zusaetzlicheBelegung` mitgegeben (sonst Doppelbuchungs-Vektor). Damit liest
 * der Wrapper eine ECHTE Obermenge der alten Busy-Quellen (kein Under-Blocking).
 * Rückgabe-Typ struktur-identisch zur Engine-TagVerfuegbarkeit.
 */
export async function ladeFreieSlots(
  svId: string,
  datumVon: Date,
  datumBis: Date,
  // Optional: Schadenort des Kunden für ETA-Reachability-Check (analog Dispatch/Flow).
  schadenort?: { lat: number; lng: number } | null,
): Promise<TagVerfuegbarkeit[]> {
  const db = createAdminClient()

  // GFA-Reservierungen (Wizard-Soft-Holds) — v_belegung-fremd, sonst könnte ein
  // parallel laufender Wizard denselben Slot doppelt bekommen.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gfa } = await (db as any)
    .from('gutachter_finder_anfragen')
    .select('reservierter_slot_von, reservierter_slot_bis')
    .eq('reservierter_sv_id', svId)
    .gte('reservierter_slot_von', datumVon.toISOString())
    .lte('reservierter_slot_von', datumBis.toISOString())
    .not('status', 'in', '("abgeschlossen","storniert","entwurf")')
  const zusaetzlicheBelegung = (
    (gfa ?? []) as Array<{ reservierter_slot_von: string | null; reservierter_slot_bis: string | null }>
  )
    .filter((r) => r.reservierter_slot_von && r.reservierter_slot_bis)
    .map((r) => ({ start: r.reservierter_slot_von as string, end: r.reservierter_slot_bis as string }))

  return freieSlots(
    { typ: 'sachverstaendiger', id: svId },
    datumVon.toISOString(),
    datumBis.toISOString(),
    { schadenort: schadenort ?? undefined, zusaetzlicheBelegung },
    db,
  )
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
      // Alte Reservierung freigeben. Bleibt sie stehen, blockiert sie den Slot des
      // Sachverstaendigen weiter — Doppelbelegung, ohne dass irgendwo etwas rot wird.
      const { error: svSlotFehler } = await supabase
        .from('gutachter_termine')
        .update({ status: 'abgelehnt' })
        // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee (Update-Filter)
        .eq('assignee_id', gfaCurrent.reservierter_sv_id)
        .eq('assignee_typ', 'sachverstaendiger')
        .eq('start_zeit', gfaCurrent.reservierter_slot_von)
        .eq('status', 'reserviert')
      if (svSlotFehler) {
        console.error('[onboarding/slots] Alt-Reservierung (SV) nicht freigegeben:', svSlotFehler.message)
      }
    }
    if (gfaCurrent.zugeordneter_sv_lead_id) {
      const { error: svLeadSlotFehler } = await supabase
        .from('gutachter_termine')
        .update({ status: 'abgelehnt' })
        .eq('sv_lead_id', gfaCurrent.zugeordneter_sv_lead_id)
        .eq('start_zeit', gfaCurrent.reservierter_slot_von)
        .eq('status', 'reserviert')
      if (svLeadSlotFehler) {
        console.error('[onboarding/slots] Alt-Reservierung (SV-Lead) nicht freigegeben:', svLeadSlotFehler.message)
      }
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

  // Fail-closed Verfuegbarkeits-Check nur fuer echte SVs (Tier-1). Der Wizard bietet freieSlots-
  // gepruefte Slots an — dieser Recheck schliesst das TOCTOU-Fenster (SV traegt zwischen Angebot und
  // Submit ein CalDAV-Event/Urlaub ein). Tier-3 (sv_lead) hat KEINEN echten Kalender → skip.
  if (!svLeadId) {
    const belegung = await pruefeBelegungStrict(
      { typ: 'sachverstaendiger', id: svId },
      vonISO,
      bisISO,
      supabase,
    )
    if (!belegung.ok) {
      return { ok: false, error: 'Verfuegbarkeit konnte nicht geprueft werden — bitte erneut versuchen.' }
    }
    if (!belegung.frei) {
      return { ok: false, error: 'Der gewaehlte Slot ist nicht mehr frei — bitte einen anderen waehlen.' }
    }
  }

  // Vorläufigen Termin mit status='reserviert' anlegen.
  // CHECK-Fix (2026-06-04): typ war 'vor_ort' + Tier-3-status 'pre_flowlink_reserviert' — beide
  // NICHT im gutachter_termine-CHECK (typ ∈ {sv_begutachtung,kb_beratung,konfrontation}; status-
  // Liste) → JEDER reserviereSlot-Insert scheiterte STILL in Prod (fire-and-forget im WizardClient).
  // Jetzt typ='sv_begutachtung' (Engine-Default) + status='reserviert'; Tier-3 wird via sv_lead_id
  // unterschieden, nicht via Status. Engine-Adoption (engine.reserviere) = koordinierter Sweep später.
  const { data: terminData, error: terminErr } = await supabase
    .from('gutachter_termine')
    .insert({
      assignee_id: svLeadId ?? svId,
      assignee_typ: svLeadId ? 'sv_lead' : 'sachverstaendiger',
      sv_lead_id: svLeadId,
      start_zeit: vonISO,
      end_zeit: bisISO,
      status: 'reserviert',
      typ: 'sv_begutachtung',
    })
    .select('id')
    .single()

  if (terminErr || !terminData) {
    // 23P01 = Exclusion-Constraint: SV in der TOCTOU-Luecke anderweitig verplant.
    if (terminErr?.code === '23P01') {
      return { ok: false, error: 'Der gewaehlte Slot wurde gerade vergeben — bitte einen anderen waehlen.' }
    }
    return { ok: false, error: terminErr?.message ?? 'Termin-Insert fehlgeschlagen' }
  }

  // SV-Heute/-Feldmodus zeigt neue Termine, Dispatch-Leads die Reservierung.
  revalidatePath('/gutachter/heute')
  revalidatePath('/gutachter/feldmodus')
  revalidatePath('/dispatch/leads')

  return { ok: true, terminId: terminData.id }
}

export async function bestaetigeSlot(
  anfrageId: string,
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createAdminClient()

  const { error: terminErr } = await supabase
    .from('gutachter_termine')
    // FIX (Status-Enum-Audit 05.07.): 'geplant' ist KEIN gueltiger gutachter_termine.status
    // (CHECK) -> Update warf 400. reserviert -> bestaetigt ist der Confirm-Uebergang.
    .update({ status: 'bestaetigt' })
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
