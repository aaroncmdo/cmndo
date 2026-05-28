// Phase 2 / Track A (Doc 48): Locale-Merge fuer Wizard-Config aus der
// i18n-jsonb-Spalte (onboarding_phasen.i18n / onboarding_felder.i18n).
//
// de bleibt in den Basis-Spalten (titel/label/...) = Fallback. Nicht-de-Locales
// ueberschreiben pro Feld; fehlt eine Uebersetzung, greift der de-Wert.
// Locale-Quelle = Cookie claimondo-locale (getLocale), konsistent mit dem
// bereits i18n'd Wizard-Chrome.

import type { FieldOption } from '@/components/onboarding/types'

type PhaseI18n = { titel?: string; eyebrow?: string; beschreibung?: string }
type OptionI18n = { label?: string; description?: string }
type FeldI18n = {
  label?: string
  hint?: string
  placeholder?: string
  optionen?: Record<string, OptionI18n>
}

type PhaseBase = { titel: string; eyebrow: string | null; beschreibung: string | null }
type FeldBase = { label: string; hint: string | null; placeholder: string | null; optionen: FieldOption[] | null }

export function localizePhase(base: PhaseBase, i18n: unknown, locale: string): PhaseBase {
  if (locale === 'de') return base
  const tr = (i18n as Record<string, PhaseI18n> | null | undefined)?.[locale]
  if (!tr) return base
  return {
    titel: tr.titel ?? base.titel,
    eyebrow: tr.eyebrow ?? base.eyebrow,
    beschreibung: tr.beschreibung ?? base.beschreibung,
  }
}

export function localizeFeld(base: FeldBase, i18n: unknown, locale: string): FeldBase {
  if (locale === 'de') return base
  const tr = (i18n as Record<string, FeldI18n> | null | undefined)?.[locale]
  if (!tr) return base
  const optionen = base.optionen
    ? base.optionen.map((o) => {
        const otr = tr.optionen?.[o.value]
        return otr ? { ...o, label: otr.label ?? o.label, description: otr.description ?? o.description } : o
      })
    : base.optionen
  return {
    label: tr.label ?? base.label,
    hint: tr.hint ?? base.hint,
    placeholder: tr.placeholder ?? base.placeholder,
    optionen,
  }
}
