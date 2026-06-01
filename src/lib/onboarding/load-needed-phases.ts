'use server'

// 2026-05-11 Funnel v2 PR #4: Datenabhaengiger Onboarding-Loader.
//
// Liest die DB-Lage eines Falls und entscheidet welche onboarding_phasen
// dem Kunden im DynamicWizard noch gezeigt werden — Phasen wo alle
// Pflichtfelder bereits gefuellt sind, werden komplett geskippt.
//
// Datenfluss (siehe docs/plans/funnel-vereinfachung-2026-05-11.md):
//   1. Page laedt ladeNoetigePhasen(fallId)
//   2. Read auf faelle + claims + leads + vehicles + fall_documents
//   3. Pro Feld pruefen: DB-Wert vorhanden?
//   4. Pro Phase pruefen: alle Pflichtfelder gefuellt? → Phase weglassen
//   5. WizardClient bekommt:
//      - phases:        nur die noch unvollstaendigen Phasen
//      - prefilledValues: alle bekannten Werte fuer pre-fill der Form

import { getLocale } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { localizePhase, localizeFeld } from './localize'
import type { OnboardingPhase, OnboardingFeld, FieldOption, DbTarget, ConditionalOn } from '@/components/onboarding/types'
import { filterFelderByAudience } from './filter-felder-by-audience'

export type LoadedWizardState = {
  phases: OnboardingPhase[]
  prefilledValues: Record<string, unknown>
  fallId: string
  // Diagnostik fuer UI-Anzeige ("3 von 8 Phasen schon erledigt durch Dispatcher/OCR")
  totalDefinedPhases: number
  skippedPhases: number
}

/**
 * @param fallId Pflicht — der Fall fuer den der Onboarding-Status berechnet
 *   wird. Auth-Check muss vor dem Aufruf passieren.
 * @param flowKey Welche Phasen-Strecke (default 'kunde-onboarding'). Erweiterbar
 *   fuer SV-Onboarding etc.
 */
export async function ladeNoetigePhasen(
  fallId: string,
  flowKey: string = 'kunde-onboarding',
): Promise<LoadedWizardState> {
  const supabase = createAdminClient()
  const locale = await getLocale()

  // ─── 1. DB-Snapshot: Fall + Claim + Lead + Vehicle + Documents ───────
  const { data: fall } = await supabase
    .from('faelle')
    .select('*')
    .eq('id', fallId)
    .maybeSingle()

  if (!fall) {
    return { phases: [], prefilledValues: {}, fallId, totalDefinedPhases: 0, skippedPhases: 0 }
  }

  const claim_id = (fall as Record<string, unknown>).claim_id as string | null
  const lead_id = (fall as Record<string, unknown>).lead_id as string | null

  const [claimRes, leadRes, docsRes] = await Promise.all([
    claim_id
      ? supabase.from('claims').select('*').eq('id', claim_id).maybeSingle()
      : Promise.resolve({ data: null }),
    lead_id
      ? supabase.from('leads').select('*').eq('id', lead_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('fall_documents').select('typ, slot_id').eq('fall_id', fallId),
  ])

  // Vehicle ueber claim_vehicle_involvements + vehicles
  let vehicle: Record<string, unknown> | null = null
  if (claim_id) {
    const { data: cvi } = await supabase
      .from('claim_vehicle_involvements')
      .select('vehicle_id')
      .eq('claim_id', claim_id)
      .eq('rolle', 'geschaedigter')
      .limit(1)
      .maybeSingle()
    if (cvi?.vehicle_id) {
      const { data: v } = await supabase
        .from('vehicles')
        .select('*')
        .eq('id', cvi.vehicle_id as string)
        .maybeSingle()
      vehicle = (v as Record<string, unknown> | null) ?? null
    }
  }

  // ─── 2. Pre-fill-Map: alle DB-Werte unter ihrem feld_key ────────────
  const prefilled: Record<string, unknown> = {
    ...flachKopie(fall as Record<string, unknown>),
    ...flachKopie((claimRes.data ?? {}) as Record<string, unknown>),
    ...flachKopie((leadRes.data ?? {}) as Record<string, unknown>),
    ...flachKopie(vehicle ?? {}),
  }
  // Documents: pro slot_id ein Flag setzen
  for (const d of ((docsRes.data ?? []) as Array<{ typ: string; slot_id: string | null }>)) {
    if (d.slot_id) prefilled[`doc_${d.slot_id}`] = true
    if (d.typ) prefilled[`doc_typ_${d.typ}`] = true
  }

  // ─── 3. Phasen + Felder aus DB laden ────────────────────────────────
  const { data: phasenRows } = await supabase
    .from('onboarding_phasen')
    .select(`
      id, flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on, i18n,
      onboarding_felder (
        id, phase_id, reihenfolge, feld_key, typ, label, hint, placeholder,
        pflicht, optionen, validation, db_target, conditional_on, i18n, audience, sektion
      )
    `)
    .eq('flow_key', flowKey)
    .order('reihenfolge', { ascending: true })

  if (!phasenRows) {
    return { phases: [], prefilledValues: prefilled, fallId, totalDefinedPhases: 0, skippedPhases: 0 }
  }

  // ─── 4. Phasen filtern: Pflichtfelder bereits alle erfuellt? ─────────
  const phasen: OnboardingPhase[] = []
  let skipped = 0

  for (const p of phasenRows) {
    const felderRaw = Array.isArray(p.onboarding_felder) ? p.onboarding_felder : []
    const felder: OnboardingFeld[] = (felderRaw as typeof felderRaw)
      .sort((a: { reihenfolge: number }, b: { reihenfolge: number }) => a.reihenfolge - b.reihenfolge)
      .map((f: {
        id: string; phase_id: string; reihenfolge: number; feld_key: string; typ: string;
        label: string; hint: string | null; placeholder: string | null; pflicht: boolean;
        optionen: unknown; validation: unknown; db_target: unknown; conditional_on: unknown; i18n: unknown;
        audience: unknown; sektion: unknown;
      }) => {
        const loc = localizeFeld(
          { label: f.label, hint: f.hint, placeholder: f.placeholder, optionen: (f.optionen as FieldOption[] | null) ?? null },
          f.i18n,
          locale,
        )
        return {
          id: f.id,
          phase_id: f.phase_id,
          reihenfolge: f.reihenfolge,
          feld_key: f.feld_key,
          typ: f.typ as OnboardingFeld['typ'],
          label: loc.label,
          hint: loc.hint,
          placeholder: loc.placeholder,
          pflicht: f.pflicht,
          optionen: loc.optionen,
          validation: (f.validation as Record<string, unknown> | null) ?? null,
          db_target: f.db_target as DbTarget,
          conditional_on: (f.conditional_on as ConditionalOn | null) ?? null,
          audience: (f.audience as OnboardingFeld['audience']) ?? null,
          sektion: (f.sektion as string | null) ?? null,
        }
      })

    // P0 (dispatch-config-unify): nur kunde-sichtbare Felder im Kunden-Wizard.
    // Default audience='beide' -> in P0 ein No-op (== felder). Ab P1 (wenn Felder
    // auf 'dispatcher' gesetzt werden) sieht der Kunde dispatcher-only-Felder nicht.
    const sichtbareFelder = filterFelderByAudience(felder, 'kunde')

    // Skip wenn ALLE Pflichtfelder schon einen DB-Wert haben.
    //
    // 2026-05-12 Funnel v3 PR #9: lookup via beiden Pfaden — feld_key
    // (Standard-Match wenn Wizard-Key = DB-Spalte) und db_target.spalte
    // (wenn sie abweichen, z.B. dsgvo_onboarding → dsgvo_zustimmung_am).
    // So greift die Skip-Logik auch wenn der Wizard ein anderes Feld-Naming
    // hat als die DB-Spalte.
    const pflichtFelder = sichtbareFelder.filter(f => f.pflicht)
    const allePflichtErfuellt = pflichtFelder.length > 0 && pflichtFelder.every(f => {
      const valByKey = prefilled[f.feld_key]
      const dbSpalte = f.db_target?.spalte ?? null
      const valBySpalte = dbSpalte ? prefilled[dbSpalte] : undefined
      const v = valByKey ?? valBySpalte
      return v !== null && v !== undefined && v !== ''
    })

    if (allePflichtErfuellt) {
      skipped++
      continue
    }

    const ploc = localizePhase(
      { titel: p.titel, eyebrow: p.eyebrow ?? null, beschreibung: p.beschreibung ?? null },
      (p as { i18n?: unknown }).i18n,
      locale,
    )
    phasen.push({
      id: p.id,
      flow_key: p.flow_key,
      reihenfolge: p.reihenfolge,
      phase_key: p.phase_key,
      titel: ploc.titel,
      eyebrow: ploc.eyebrow,
      beschreibung: ploc.beschreibung,
      conditional_on: (p.conditional_on as ConditionalOn | null) ?? null,
      felder: sichtbareFelder,
    })
  }

  return {
    phases: phasen,
    prefilledValues: prefilled,
    fallId,
    totalDefinedPhases: phasenRows.length,
    skippedPhases: skipped,
  }
}

function flachKopie(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (v !== null && v !== undefined && v !== '') out[k] = v
  }
  return out
}
