'use client'

// CMM-32: Render-Bild eines Fahrzeugs in der richtigen Lackfarbe via Imagin
// Studio. Fallback auf einen schlanken Platzhalter wenn Hersteller/Modell
// fehlen oder Imagin keine Daten liefert.

import Image from 'next/image'
import { CarIcon } from 'lucide-react'
import { buildImaginUrl, type LackfarbeCode } from '@/lib/fahrzeug/imagin'

type Props = {
  hersteller: string | null
  modell: string | null
  lackfarbe: LackfarbeCode | null
  /** Pixel — Imagin liefert hochaufgelöste PNGs, das `width` steuert
   *  die Render-Pixel-Breite. */
  width?: number
  /** Tailwind-Klassen am Wrapper. */
  className?: string
  /** Optionaler Alt-Text-Override. */
  alt?: string
}

export default function FahrzeugRenderImage({
  hersteller,
  modell,
  lackfarbe,
  width = 200,
  className = '',
  alt,
}: Props) {
  const url = buildImaginUrl({ hersteller, modell, lackfarbe, angle: 21 })

  if (!url) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 text-claimondo-ondo ${className}`}
        style={{ width, height: Math.round(width * 0.6) }}
      >
        <CarIcon className="w-8 h-8 opacity-50" />
      </div>
    )
  }

  const altText = alt ?? `${hersteller ?? 'Fahrzeug'} ${modell ?? ''}`.trim()
  return (
    <div className={`relative ${className}`} style={{ width, height: Math.round(width * 0.6) }}>
      <Image
        src={url}
        alt={altText}
        fill
        sizes={`${width}px`}
        unoptimized
        className="object-contain"
      />
    </div>
  )
}
