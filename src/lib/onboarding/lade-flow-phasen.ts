// Generischer Render-Loader fuer onboarding-Flows (kein Skip-Filled — alle Phasen).
// Generalisiert aus ladeBeauftragungPhasen (2026-06-01, P2a) damit sowohl der
// Kunden-Flowlink (flow_key='beauftragung', audience='kunde') als auch der flache
// Dispatcher-Renderer (flow_key='lead-erfassung', audience='dispatcher') dieselbe
// Lade-/Lokalisier-/audience-Filter-Logik nutzen. Reiner Server-Loader (kein
// 'use server' — wird aus Server-Components aufgerufen).

import { getLocale } from 'next-intl/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { localizePhase, localizeFeld } from './localize'
import type { OnboardingPhase, OnboardingFeld, FieldOption, DbTarget, ConditionalOn } from '@/components/onboarding/types'
import { filterFelderByAudience } from './filter-felder-by-audience'

export async function ladeFlowPhasen(
  flowKey: string,
  audience: 'kunde' | 'dispatcher',
): Promise<OnboardingPhase[]> {
  const supabase = createAdminClient()
  const locale = await getLocale()

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

  if (!phasenRows) return []

  return phasenRows.map((p) => {
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

    const sichtbareFelder = filterFelderByAudience(felder, audience)

    const ploc = localizePhase(
      { titel: p.titel, eyebrow: p.eyebrow ?? null, beschreibung: p.beschreibung ?? null },
      (p as { i18n?: unknown }).i18n,
      locale,
    )
    return {
      id: p.id,
      flow_key: p.flow_key,
      reihenfolge: p.reihenfolge,
      phase_key: p.phase_key,
      titel: ploc.titel,
      eyebrow: ploc.eyebrow,
      beschreibung: ploc.beschreibung,
      conditional_on: (p.conditional_on as ConditionalOn | null) ?? null,
      felder: sichtbareFelder,
    }
  })
}
