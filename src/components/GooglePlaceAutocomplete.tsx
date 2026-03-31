'use client'

import { useEffect, useRef, useState } from 'react'

export type PlaceResult = {
  adresse: string
  plz: string
  lat: number
  lng: number
  place_id: string
}

export default function GooglePlaceAutocomplete({
  defaultValue,
  placeholder,
  onSelect,
  className,
}: {
  defaultValue?: string
  placeholder?: string
  onSelect: (result: PlaceResult) => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(defaultValue ?? '')
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null)

  useEffect(() => {
    function init() {
      if (!inputRef.current || typeof google === 'undefined' || !google.maps?.places) return false
      if (autocompleteRef.current) return true

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

        // Extract PLZ from address_components
        let plz = ''
        for (const comp of place.address_components ?? []) {
          if (comp.types.includes('postal_code')) {
            plz = comp.long_name
            break
          }
        }

        setValue(formattedAddress)
        onSelect({ adresse: formattedAddress, plz, lat, lng, place_id: placeId })
      })

      autocompleteRef.current = autocomplete
      return true
    }

    if (init()) return

    // Retry until the Google Maps script has loaded
    const interval = setInterval(() => {
      if (init()) clearInterval(interval)
    }, 300)
    return () => clearInterval(interval)
  }, [onSelect])

  const defaultCls = 'w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-gray-900 placeholder-gray-400 text-sm focus:outline-none focus:border-blue-500 transition-colors'

  return (
    <input
      ref={inputRef}
      type="text"
      value={value}
      onChange={e => setValue(e.target.value)}
      placeholder={placeholder ?? 'Adresse eingeben...'}
      className={className ?? defaultCls}
    />
  )
}
