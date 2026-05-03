'use client'

import { useEffect, useRef, useState } from 'react'

export type PlaceResult = {
  adresse: string
  plz: string
  /** CMM-23: Straße + Hausnummer (z.B. "Bernhard-Feilchenfeld-Straße 7") */
  strasse: string
  /** CMM-23: Stadt / Ort (z.B. "Köln") */
  stadt: string
  lat: number
  lng: number
  place_id: string
}

// Google Maps Script einmalig laden (singleton)
let scriptLoading = false
let scriptLoaded = false

function ensureGoogleMapsScript(): Promise<void> {
  if (scriptLoaded || (typeof google !== 'undefined' && google.maps?.places)) {
    scriptLoaded = true
    return Promise.resolve()
  }
  if (scriptLoading) {
    return new Promise(resolve => {
      const iv = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps?.places) {
          scriptLoaded = true
          clearInterval(iv)
          resolve()
        }
      }, 200)
    })
  }

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) return Promise.reject('NEXT_PUBLIC_GOOGLE_MAPS_KEY fehlt')

  scriptLoading = true
  return new Promise((resolve, reject) => {
    // Check if script tag already exists
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const iv = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps?.places) {
          scriptLoaded = true
          clearInterval(iv)
          resolve()
        }
      }, 200)
      return
    }

    const s = document.createElement('script')
    // loading=async ist seit März 2024 Pflicht — ohne den Param produziert
    // Google Maps Console-Warnings und kann den Init blockieren wenn der
    // API-Key nach diesem Datum erstellt wurde.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&v=weekly`
    s.async = true
    s.defer = true
    s.onload = () => {
      const iv = setInterval(() => {
        if (typeof google !== 'undefined' && google.maps?.places) {
          scriptLoaded = true
          clearInterval(iv)
          resolve()
        }
      }, 100)
    }
    s.onerror = () => reject('Google Maps Script konnte nicht geladen werden')
    document.head.appendChild(s)
  })
}

export default function GooglePlaceAutocomplete({
  defaultValue,
  placeholder,
  onSelect,
  onBlur,
  onChange,
  className,
}: {
  defaultValue?: string
  placeholder?: string
  onSelect: (result: PlaceResult) => void
  // AAR-262: Optionaler Blur-Handler für Server-Side-Geocoding-Fallback
  // wenn der User Freitext eingibt statt Dropdown-Auswahl.
  onBlur?: (currentValue: string) => void
  // CMM-23: Live-onChange — Parent kann Eingaben sofort übernehmen
  // (verhindert Race wenn der User direkt auf Submit klickt ohne dass
  // blur durchläuft).
  onChange?: (currentValue: string) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue ?? '')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect

  // AAR-237: Sync mit defaultValue wenn es sich ändert (z.B. Parent-State-Reset).
  // Ohne diesen Sync würde der Autocomplete-Value stale bleiben wenn der
  // Parent das Feld programmatisch ändert.
  useEffect(() => {
    if (defaultValue !== undefined && defaultValue !== value) setValue(defaultValue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValue])

  useEffect(() => {
    let cancelled = false

    function initAutocomplete() {
      if (!inputRef.current || autocompleteRef.current) return
      if (typeof google === 'undefined' || !google.maps?.places) return

      const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'de' },
        fields: ['formatted_address', 'geometry', 'place_id', 'address_components'],
        types: ['address'],
      })

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        if (!place.geometry?.location) return

        const lat = place.geometry.location.lat()
        const lng = place.geometry.location.lng()
        const placeId = place.place_id ?? ''
        const formattedAddress = place.formatted_address ?? ''

        // CMM-23: alle Adress-Komponenten extrahieren — Straße, Hausnummer,
        // PLZ, Stadt — damit der Lead-Insert die separate Spalten füllt.
        let plz = ''
        let route = ''
        let streetNumber = ''
        let stadt = ''
        for (const comp of place.address_components ?? []) {
          if (comp.types.includes('postal_code')) plz = comp.long_name
          else if (comp.types.includes('route')) route = comp.long_name
          else if (comp.types.includes('street_number')) streetNumber = comp.long_name
          else if (comp.types.includes('locality')) stadt = comp.long_name
          else if (!stadt && comp.types.includes('postal_town')) stadt = comp.long_name
        }
        const strasse = [route, streetNumber].filter(Boolean).join(' ').trim()

        setValue(formattedAddress)
        onSelectRef.current({ adresse: formattedAddress, plz, strasse, stadt, lat, lng, place_id: placeId })
      })

      autocompleteRef.current = autocomplete
    }

    // Script laden + Autocomplete initialisieren
    ensureGoogleMapsScript()
      .then(() => {
        if (cancelled) return
        initAutocomplete()
        setLoading(false)
        if (!autocompleteRef.current) {
          setLoadError('Autocomplete-Init fehlgeschlagen — Konsole prüfen (Places API ggf. deaktiviert).')
        }
      })
      .catch((err) => {
        setLoading(false)
        const msg = typeof err === 'string' ? err : 'Google Maps konnte nicht geladen werden — bitte Seite neu laden.'
        setLoadError(msg)
        console.error('[GooglePlaceAutocomplete]', msg)
      })

    return () => { cancelled = true }
  }, [])

  const defaultCls = 'w-full px-4 py-3 rounded-xl border border-claimondo-border bg-white text-claimondo-navy placeholder-gray-400 text-sm focus:outline-none focus:border-[#4573A2] transition-colors'

  return (
    <div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => {
          setValue(e.target.value)
          onChange?.(e.target.value)
        }}
        // AAR-237: Enter im Autocomplete-Feld würde sonst das umgebende
        // Formular submitten und die Wizard-State resetten. Enter
        // abfangen — Google-Autocomplete-Auswahl läuft nicht über Enter
        // sondern über Click auf die Suggestion.
        onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
        // AAR-262: Blur-Handler für Server-Side-Geocoding-Fallback.
        onBlur={() => onBlur?.(value)}
        placeholder={loading ? 'Google Maps lädt…' : placeholder ?? 'Adresse eingeben...'}
        className={className ?? defaultCls}
        disabled={loading && !loadError}
      />
      {loadError && (
        <p className="text-[11px] text-red-600 mt-1">
          {loadError} — du kannst die Adresse trotzdem manuell eintippen, sie wird beim Speichern serverseitig geocoded.
        </p>
      )}
    </div>
  )
}
