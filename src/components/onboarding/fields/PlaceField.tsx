'use client'

// Ops-Test 11.08. (RC-8): Der Unfallort war ein reines Freitextfeld (onboarding_felder.typ
// = 'text') — ohne Adress-Autocomplete und ohne Koordinaten. Aaron: "unfallort nicht mit
// google maps". Prod-Beleg: der Test-Lead trug 'Ecke Wiesenstraße' bei unfallort_lat/lng
// = NULL, also nicht geocodiert und nicht kartierbar.
//
// Dieser Feldtyp rendert den geteilten GooglePlaceAutocomplete im Onboarding-/Flow-Look.
// Der gespeicherte WERT bleibt ein String (die formatierte Adresse) — damit ist das Feld
// voll kompatibel zum generischen Speicherpfad (saveOnboardingFields ueber db_target.spalte),
// und die Koordinaten ergaenzt der Server per Geocoding.
//
// Freitext bleibt erlaubt: wer keinen Treffer auswaehlt (Feldweg, Kreuzung, Parkplatz),
// tippt weiter frei — onChange uebernimmt jede Eingabe. Das Autocomplete ist eine Hilfe,
// keine Pflicht; sonst waeren genau die unpraezisen Unfallorte nicht mehr erfassbar.

import GooglePlaceAutocomplete from '@/components/GooglePlaceAutocomplete'
import type { OnboardingFeld } from '../types'

interface Props {
  feld: OnboardingFeld
  value: string
  onChange: (val: string) => void
  disabled?: boolean
}

export function PlaceField({ feld, value, onChange, disabled }: Props) {
  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <label className="text-sm font-semibold tracking-[-.01em] text-claimondo-navy">
        {feld.label}
        {feld.pflicht && <span className="text-danger"> *</span>}
      </label>
      {feld.hint && <span className="-mt-1 text-xs text-claimondo-ondo">{feld.hint}</span>}
      {disabled ? (
        // Der Autocomplete kennt kein disabled — im gesperrten Zustand ein inertes
        // Read-only-Input mit identischem Look, statt die Sperre zu unterlaufen.
        <input
          type="text"
          readOnly
          disabled
          value={value}
          data-testid={`feld-${feld.feld_key}`}
          className="w-full rounded-ios-md border border-claimondo-border bg-claimondo-bg px-3 py-2.5 text-sm text-claimondo-navy/60"
        />
      ) : (
        <div data-testid={`feld-${feld.feld_key}`}>
          <GooglePlaceAutocomplete
            defaultValue={value}
            placeholder={feld.placeholder ?? undefined}
            // Auswahl aus dem Dropdown -> formatierte Adresse uebernehmen.
            onSelect={(r) => onChange(r.adresse)}
            // Freitext ohne Auswahl -> trotzdem uebernehmen (Race-sicher, s. Datei-Kommentar).
            onChange={(v) => onChange(v)}
            onBlur={(v) => onChange(v)}
            scrollIntoViewOnFocus
            className="w-full rounded-ios-md border border-claimondo-border bg-white px-3 py-2.5 text-sm text-claimondo-navy placeholder:text-claimondo-ondo/50 focus:border-claimondo-ondo focus:outline-none"
          />
        </div>
      )}
    </div>
  )
}
