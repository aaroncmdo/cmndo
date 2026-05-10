import { createClient } from '@/lib/supabase/server'
import { WizardClient } from './WizardClient'
import type { OnboardingPhase, OnboardingFeld, FieldOption, DbTarget, ConditionalOn } from './types'

interface Props {
  flowKey: string
  onComplete?: Parameters<typeof WizardClient>[0]['onComplete']
}

// Server-Component: lädt Phasen + Felder aus onboarding_phasen / onboarding_felder,
// wrappt den WizardClient (Client-Component) der state + animation hält.
export async function DynamicWizard({ flowKey, onComplete }: Props) {
  const supabase = await createClient()

  const { data: phasenRows, error } = await supabase
    .from('onboarding_phasen')
    .select(`
      id, flow_key, reihenfolge, phase_key, titel, eyebrow, beschreibung, conditional_on,
      onboarding_felder (
        id, phase_id, reihenfolge, feld_key, typ, label, hint, placeholder,
        pflicht, optionen, validation, db_target, conditional_on
      )
    `)
    .eq('flow_key', flowKey)
    .order('reihenfolge', { ascending: true })

  if (error || !phasenRows) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-red-700 text-sm font-medium">
        Wizard-Konfiguration konnte nicht geladen werden ({error?.message ?? 'Unbekannter Fehler'})
      </div>
    )
  }

  const phases: OnboardingPhase[] = phasenRows.map(p => {
    // Supabase Nested-Select gibt Array zurück — normalisieren
    const felderRaw = Array.isArray(p.onboarding_felder) ? p.onboarding_felder : []
    const felder: OnboardingFeld[] = (felderRaw as typeof felderRaw)
      .sort((a: { reihenfolge: number }, b: { reihenfolge: number }) => a.reihenfolge - b.reihenfolge)
      .map((f: {
        id: string; phase_id: string; reihenfolge: number; feld_key: string; typ: string;
        label: string; hint: string | null; placeholder: string | null; pflicht: boolean;
        optionen: unknown; validation: unknown; db_target: unknown; conditional_on: unknown;
      }) => ({
        id: f.id,
        phase_id: f.phase_id,
        reihenfolge: f.reihenfolge,
        feld_key: f.feld_key,
        typ: f.typ as OnboardingFeld['typ'],
        label: f.label,
        hint: f.hint,
        placeholder: f.placeholder,
        pflicht: f.pflicht,
        optionen: (f.optionen as FieldOption[] | null) ?? null,
        validation: (f.validation as Record<string, unknown> | null) ?? null,
        db_target: f.db_target as DbTarget,
        conditional_on: (f.conditional_on as ConditionalOn | null) ?? null,
      }))

    return {
      id: p.id,
      flow_key: p.flow_key,
      reihenfolge: p.reihenfolge,
      phase_key: p.phase_key,
      titel: p.titel,
      eyebrow: p.eyebrow ?? null,
      beschreibung: p.beschreibung ?? null,
      conditional_on: (p.conditional_on as ConditionalOn | null) ?? null,
      felder,
    }
  })

  if (phases.length === 0) {
    return (
      <div className="rounded-xl bg-amber-50 p-6 text-amber-700 text-sm font-medium">
        Keine Phasen für Flow „{flowKey}" konfiguriert.
      </div>
    )
  }

  return <WizardClient phases={phases} onComplete={onComplete} />
}
