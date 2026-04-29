'use client'

// CMM-32: Render-Bild eines Fahrzeugs in der richtigen Lackfarbe via Imagin
// Studio. Fallback-Kette: Imagin-Render → Hersteller-Logo → CarIcon.

import Image from 'next/image'
import { CarIcon } from 'lucide-react'
import { buildImaginUrl, type LackfarbeCode } from '@/lib/fahrzeug/imagin'
import { useState } from 'react'

// Bekannte Marken → Clearbit-Logo-Domain
const BRAND_LOGO_DOMAINS: Record<string, string> = {
  audi:              'audi.com',
  bmw:               'bmw.com',
  mercedes:          'mercedes-benz.com',
  'mercedes-benz':   'mercedes-benz.com',
  volkswagen:        'volkswagen.com',
  vw:                'volkswagen.com',
  porsche:           'porsche.com',
  opel:              'opel.com',
  ford:              'ford.com',
  toyota:            'toyota.com',
  honda:             'honda.com',
  hyundai:           'hyundai.com',
  kia:               'kia.com',
  renault:           'renault.com',
  peugeot:           'peugeot.com',
  citroen:           'citroen.com',
  fiat:              'fiat.com',
  seat:              'seat.com',
  skoda:             'skoda.com',
  volvo:             'volvocars.com',
  mazda:             'mazda.com',
  nissan:            'nissan.com',
  mitsubishi:        'mitsubishi-motors.com',
  suzuki:            'suzuki.com',
  tesla:             'tesla.com',
  mini:              'mini.com',
  'land rover':      'landrover.com',
  jaguar:            'jaguar.com',
  'alfa romeo':      'alfaromeo.com',
  lexus:             'lexus.com',
  infiniti:          'infiniti.com',
  jeep:              'jeep.com',
  chrysler:          'chrysler.com',
  dodge:             'dodge.com',
  chevrolet:         'chevrolet.com',
  dacia:             'dacia.com',
  smart:             'smart.com',
  cupra:             'cupraofficial.com',
}

function getLogoUrl(hersteller: string): string | null {
  const key = hersteller.toLowerCase().trim()
  const domain = BRAND_LOGO_DOMAINS[key]
  if (!domain) return null
  return `https://logo.clearbit.com/${domain}`
}

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
  const [imaginFailed, setImaginFailed] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)

  const imaginUrl = buildImaginUrl({ hersteller, modell, lackfarbe, angle: 21 })
  const logoUrl = hersteller ? getLogoUrl(hersteller) : null
  const altText = alt ?? `${hersteller ?? 'Fahrzeug'} ${modell ?? ''}`.trim()
  const height = Math.round(width * 0.6)

  // Kein Hersteller — generischer Platzhalter
  if (!hersteller) {
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 text-claimondo-ondo ${className}`}
        style={{ width, height }}
      >
        <CarIcon className="w-8 h-8 opacity-50" />
      </div>
    )
  }

  // Imagin-Render (primär)
  if (imaginUrl && !imaginFailed) {
    return (
      <div className={`relative ${className}`} style={{ width, height }}>
        <Image
          src={imaginUrl}
          alt={altText}
          fill
          sizes={`${width}px`}
          unoptimized
          className="object-contain"
          onError={() => setImaginFailed(true)}
        />
      </div>
    )
  }

  // Hersteller-Logo (erster Fallback)
  if (logoUrl && !logoFailed) {
    const logoSize = Math.round(width * 0.4)
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 ${className}`}
        style={{ width, height }}
      >
        <Image
          src={logoUrl}
          alt={`${hersteller} Logo`}
          width={logoSize}
          height={logoSize}
          unoptimized
          className="object-contain opacity-70"
          onError={() => setLogoFailed(true)}
        />
      </div>
    )
  }

  // CarIcon (letzter Fallback)
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 text-claimondo-ondo ${className}`}
      style={{ width, height }}
    >
      <CarIcon className="w-8 h-8 opacity-50" />
    </div>
  )
}
