'use client'

import { useEffect, useRef, useState } from 'react'
import { loadGoogleMaps } from '@/lib/maps/load-google-maps'

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
  /** AAR-956: Business-Name bei types=establishment (sonst undefined). */
  name?: string
}

export default function GooglePlaceAutocomplete({
  defaultValue,
  types,
  placeholder,
  onSelect,
  onBlur,
  onChange,
  className,
  scrollIntoViewOnFocus,
  autoFocus,
}: {
  defaultValue?: string
  /** AAR-956: Autocomplete-Typ. Default ['address'] (Geocoder); ['establishment'] = Business-Suche. */
  types?: string[]
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
  // AAR-956: Mobil — beim Fokus das Input nach oben scrollen, damit Googles pac-Dropdown
  // (öffnet nach unten) im Bottom-Sheet nicht unter den Bildschirm läuft.
  scrollIntoViewOnFocus?: boolean
  // AAR-956: Overlay-Popover — Input beim Mount fokussieren (sobald Google geladen + enabled).
  autoFocus?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue ?? '')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const typesRef = useRef(types)
  typesRef.current = types

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
        fields: ['name', 'formatted_address', 'geometry', 'place_id', 'address_components'],
        types: typesRef.current ?? ['address'],
      })

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace()
        const placeId = place.place_id ?? ''
        // AAR-956: Business-Suche (types=establishment) braucht nur die place_id —
        // Geocoder-Adressen haben immer geometry, Betriebe meist auch; ohne → 0/0.
        if (!placeId) return

        const loc = place.geometry?.location
        const lat = loc ? loc.lat() : 0
        const lng = loc ? loc.lng() : 0
        const formattedAddress = place.formatted_address ?? place.name ?? ''

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
        onSelectRef.current({ adresse: formattedAddress, plz, strasse, stadt, lat, lng, place_id: placeId, name: place.name ?? undefined })
      })

      autocompleteRef.current = autocomplete
    }

    // Script laden + Autocomplete initialisieren
    loadGoogleMaps()
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

  // AAR-956: Overlay-Popover — Input fokussieren, sobald Google geladen + das Input enabled ist.
  useEffect(() => {
    if (autoFocus && !loading) inputRef.current?.focus()
  }, [autoFocus, loading])

  const defaultCls = 'w-full px-4 py-3 rounded-ios-xl border border-claimondo-border bg-white text-claimondo-navy placeholder-claimondo-ondo/60 text-sm focus:outline-none focus:border-claimondo-ondo transition-colors'

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
        // AAR-956: Mobil im Bottom-Sheet — nach dem Keyboard-Slide das Input nach oben scrollen,
        // damit das nach unten öffnende pac-Dropdown Platz hat (sonst läuft es aus dem Screen).
        onFocus={() => {
          if (scrollIntoViewOnFocus) {
            window.setTimeout(() => inputRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 350)
          }
        }}
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
