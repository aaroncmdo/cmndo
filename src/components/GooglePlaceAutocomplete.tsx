'use client'

import { useEffect, useRef, useState } from 'react'

export type PlaceResult = {
  adresse: string
  plz: string
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
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
    s.async = true
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
  className,
}: {
  defaultValue?: string
  placeholder?: string
  onSelect: (result: PlaceResult) => void
  // AAR-262: Optionaler Blur-Handler für Server-Side-Geocoding-Fallback
  // wenn der User Freitext eingibt statt Dropdown-Auswahl.
  onBlur?: (currentValue: string) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue ?? '')
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

        let plz = ''
        for (const comp of place.address_components ?? []) {
          if (comp.types.includes('postal_code')) { plz = comp.long_name; break }
        }

        setValue(formattedAddress)
        onSelectRef.current({ adresse: formattedAddress, plz, lat, lng, place_id: placeId })
      })

      autocompleteRef.current = autocomplete
    }

    // Script laden + Autocomplete initialisieren
    ensureGoogleMapsScript()
      .then(() => { if (!cancelled) initAutocomplete() })
      .catch(() => {})

    return () => { cancelled = true }
  }, [])

  const defaultCls = 'w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-[#4573A2] transition-colors'

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      // AAR-237: Enter im Autocomplete-Feld würde sonst das umgebende
      // Formular submitten und die Wizard-State resetten. Enter
      // abfangen — Google-Autocomplete-Auswahl läuft nicht über Enter
      // sondern über Click auf die Suggestion.
      onKeyDown={e => { if (e.key === 'Enter') e.preventDefault() }}
      // AAR-262: Blur-Handler für Server-Side-Geocoding-Fallback.
      onBlur={() => onBlur?.(value)}
      placeholder={placeholder ?? 'Adresse eingeben...'}
      className={className ?? defaultCls}
    />
  )
}
