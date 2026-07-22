'use client'

// Klickbare Kachel-Galerie fuer Zustandsdoku-Fotos (read-only). Tap auf eine Kachel -> Foto-
// Vorschau (Lightbox, vergroessert). Ausgelagert aus VehicleScanGalerie (Server-Component),
// damit die Vorschau-Interaktion im Client lebt. ZustandsQualitaetsBadge ist server-safe +
// hier weiter nutzbar. Die Kachel ist ein <button> (Vergroessern-Trigger), kein Card-Pattern.
import { useState } from 'react'
import { ZustandsQualitaetsBadge } from '@/components/shared/ZustandsQualitaetsBadge'
import { FotoLightbox, type FotoLightboxBild } from '@/components/shared/FotoLightbox'
import type { ScanGalerieFoto } from '@/lib/vehicles/vehicle-scan-view'

export function VehicleScanFotoGrid({ fotos }: { fotos: ScanGalerieFoto[] }) {
  const [aktiv, setAktiv] = useState<FotoLightboxBild | null>(null)

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {fotos.map((f) => (
          <figure key={f.id} className="space-y-1">
            <button
              type="button"
              onClick={() => setAktiv({ url: f.url, label: f.label })}
              aria-label={`${f.label} vergrößern`}
              className="relative block aspect-square w-full overflow-hidden rounded-ios-md border border-claimondo-border bg-claimondo-bg"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={f.url} alt={f.label} className="h-full w-full object-cover" />
              <ZustandsQualitaetsBadge
                prozent={f.prozent}
                hinweis={f.hinweis}
                className="absolute right-1 top-1"
              />
            </button>
            <figcaption
              className="truncate text-caption text-claimondo-ondo/70"
              title={f.label}
            >
              {f.label}
            </figcaption>
          </figure>
        ))}
      </div>
      <FotoLightbox bild={aktiv} onClose={() => setAktiv(null)} />
    </>
  )
}
