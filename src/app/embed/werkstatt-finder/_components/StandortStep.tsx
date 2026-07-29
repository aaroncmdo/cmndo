'use client'

// Wizard-Schritt 1: Fahrzeugstandort. EIN präzises Google-Places-Adressfeld + „Aktuellen Standort
// verwenden" (Browser-Geolocation → Reverse-Geocode via Server-Action). Schreibt präzise Koordinaten
// (behebt „findet keine Werkstätten" des alten PLZ-only-Pfads).
import { useState } from 'react'
import { LocateFixed, MapPin } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { Button } from '@/components/primitives'
import { holeAdresseFuerStandort } from '../actions'

type Props = {
  standort: { adresse: string; lat: number; lng: number } | null
  onStandort: (s: { adresse: string; lat: number; lng: number }) => void
}

export function StandortStep({ standort, onStandort }: Props) {
  const [geoLaeuft, setGeoLaeuft] = useState(false)
  const [geoFehler, setGeoFehler] = useState<string | null>(null)

  function aktuellenStandort() {
    setGeoFehler(null)
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGeoFehler('Standort wird von diesem Gerät nicht unterstützt.')
      return
    }
    setGeoLaeuft(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude
        const lng = pos.coords.longitude
        const r = await holeAdresseFuerStandort(lat, lng)
        setGeoLaeuft(false)
        if (r.ok) onStandort({ adresse: r.adresse, lat: r.lat, lng: r.lng })
        else onStandort({ adresse: 'Aktueller Standort', lat, lng })
      },
      () => {
        setGeoLaeuft(false)
        setGeoFehler('Standort konnte nicht ermittelt werden — bitte die Adresse eingeben.')
      },
      { timeout: 8000, maximumAge: 60_000 },
    )
  }

  function onSelect(p: PlaceResult) {
    if (p.lat === 0 && p.lng === 0) return // Places-Treffer ohne Geometrie ignorieren
    onStandort({ adresse: p.adresse, lat: p.lat, lng: p.lng })
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Google-Places-Dropdown (.pac-container) ans Claimondo-Design angepasst. Google haengt den
          Container an document.body → das Styling ist global; die Embed-Seite hat aber NUR dieses
          eine Autocomplete, also trifft es ausschliesslich hier (kein Eingriff in die 29 anderen
          Konsumenten der Shared-Component). Farben ueber CSS-Vars → token-audit-safe. Das
          "Powered by Google"-Attributions-Logo (:after) bleibt unangetastet (Places-ToS). */}
      <style>{`
        .pac-container {
          margin-top: 6px;
          padding: 4px;
          border: 1px solid var(--color-claimondo-border);
          border-radius: 16px;
          background: white;
          box-shadow: 0 14px 34px color-mix(in srgb, var(--brand-primary) 14%, transparent);
          font-family: var(--font-sans, system-ui, sans-serif);
          overflow: hidden;
        }
        .pac-item {
          border-top: 0;
          border-radius: 10px;
          padding: 9px 12px;
          color: var(--color-claimondo-navy);
          font-size: 0.875rem;
          line-height: 1.35;
          cursor: pointer;
          transition: background-color .12s ease;
        }
        .pac-item:hover,
        .pac-item-selected,
        .pac-item.pac-item-selected { background-color: var(--brand-secondary-soft); }
        .pac-icon { display: none; }
        .pac-item-query {
          color: var(--color-claimondo-navy);
          font-size: 0.875rem;
          font-weight: 600;
          padding-right: 6px;
        }
        .pac-matched { font-weight: 700; }
        .pac-item > span:last-child { color: var(--color-claimondo-shield); }
      `}</style>
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Wo steht das Fahrzeug?</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Wir finden die passenden Werkstätten in der Nähe des Fahrzeugstandorts.
        </p>
      </div>
      <GooglePlaceAutocomplete
        placeholder="Adresse eingeben…"
        defaultValue={standort?.adresse}
        className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        onSelect={onSelect}
      />
      <Button type="button" variant="ghost" onClick={aktuellenStandort} loading={geoLaeuft} className="self-start">
        <LocateFixed className="mr-1.5 h-4 w-4" /> Aktuellen Standort verwenden
      </Button>
      {standort && (
        <p className="flex items-center gap-1.5 text-[0.8125rem] text-success-strong">
          <MapPin className="h-4 w-4 flex-shrink-0" /> {standort.adresse}
        </p>
      )}
      {geoFehler && <p className="text-[0.8125rem] text-danger-strong">{geoFehler}</p>}
    </div>
  )
}
