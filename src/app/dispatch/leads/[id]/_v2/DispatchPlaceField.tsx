'use client'

// P2d-2: Adress-Felder (besichtigungsort_adresse, unfallort) als Google-Place-
// Autocomplete statt Freitext. onSelect schreibt mehrere Spalten (Adresse +
// Koordinaten [+ place_id]) via saveStammdaten; Freitext-Blur schreibt nur die
// Adress-Spalte. Spalten-Map pro target (Allowlist in _actions/stammdaten.ts).

import { useState } from 'react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import type { OnboardingFeld } from '@/components/onboarding/types'
import { saveStammdaten } from '../_actions/stammdaten'
import { OverrideFieldShell, type OverrideSaveStatus } from './OverrideFieldShell'

export type PlaceTarget = 'besichtigungsort' | 'unfallort' | 'kunde'

function adresseSpalte(target: PlaceTarget): string {
  if (target === 'besichtigungsort') return 'besichtigungsort_adresse'
  if (target === 'kunde') return 'kunde_strasse'
  return 'unfallort'
}

function selektionZuSpalten(target: PlaceTarget, r: PlaceResult): Record<string, unknown> {
  if (target === 'besichtigungsort') {
    return {
      besichtigungsort_adresse: r.adresse,
      besichtigungsort_lat: r.lat,
      besichtigungsort_lng: r.lng,
      besichtigungsort_place_id: r.place_id,
    }
  }
  if (target === 'kunde') {
    // P4-D kunde-Geocoding: strukturiertes PlaceResult → die 3 Adress-Spalten + Koordinaten.
    return {
      kunde_strasse: r.strasse,
      kunde_plz: r.plz,
      kunde_stadt: r.stadt,
      kunde_lat: r.lat,
      kunde_lng: r.lng,
    }
  }
  return { unfallort: r.adresse, unfallort_lat: r.lat, unfallort_lng: r.lng }
}

// Freitext (Blur ohne Dropdown-Treffer): Adresse schreiben UND die Koordinaten
// NULLen. Sonst blieben Koordinaten einer frueheren Auswahl (Ort A) an einer neu
// getippten Adresse (Ort B) haengen -> das SV-Matching wuerde nach A ranken.
// (Anders als der generische FieldRenderer-Text, der nur die Adress-Spalte hat,
// muss das Place-Override die Koordinaten-Konsistenz selbst wahren.)
function freetextZuSpalten(target: PlaceTarget, addr: string): Record<string, unknown> {
  if (target === 'besichtigungsort') {
    return {
      besichtigungsort_adresse: addr,
      besichtigungsort_lat: null,
      besichtigungsort_lng: null,
      besichtigungsort_place_id: null,
    }
  }
  if (target === 'kunde') {
    // Freitext (kein Dropdown-Treffer): Straße schreiben, Koordinaten nullen
    // (Stale-Guard). plz/stadt bleiben unberührt (separate Felder).
    return { kunde_strasse: addr, kunde_lat: null, kunde_lng: null }
  }
  return { unfallort: addr, unfallort_lat: null, unfallort_lng: null }
}

export function DispatchPlaceField({
  feld,
  leadId,
  lead,
  target,
}: {
  feld: OnboardingFeld
  leadId: string
  lead: Record<string, unknown>
  target: PlaceTarget
}) {
  const [status, setStatus] = useState<OverrideSaveStatus>('idle')
  const initial = (lead[adresseSpalte(target)] as string | null) ?? ''

  async function persist(partial: Record<string, unknown>) {
    setStatus('saving')
    const r = await saveStammdaten(leadId, partial)
    setStatus(r.success ? 'saved' : 'error')
  }

  return (
    <OverrideFieldShell feld={feld} status={status}>
      <GooglePlaceAutocomplete
        defaultValue={initial}
        placeholder={feld.placeholder ?? feld.label}
        onSelect={(r) => persist(selektionZuSpalten(target, r))}
        onBlur={(v) => {
          const t = v.trim()
          if (t && t !== initial.trim()) persist(freetextZuSpalten(target, t))
        }}
      />
    </OverrideFieldShell>
  )
}
