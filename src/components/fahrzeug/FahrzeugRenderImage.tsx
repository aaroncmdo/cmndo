'use client'

// CMM-32: 4-stufige Fallback-Kaskade für Fahrzeug-Vorschau:
//   1) Imagin-Studio-Render (parametrisch, mit Lackfarbe) via Server-Proxy
//      — der Proxy filtert den X-Imaginstudio-Error-Header raus, damit
//      onError zuverlässig feuert wenn kein echtes Asset verfügbar ist
//   2) Wikipedia-Thumbnail (über Server-Proxy mit OpenSearch-Lookup)
//      — kostenlos, deckt fast alle Modelle, aber keine Lackfarbe
//   3) Hersteller-Logo via Clearbit Logo CDN
//   4) Hersteller-Logo via Google-Favicon-CDN (immer-up Backup)
//   5) Generischer CarIcon (letzter Fallback)

import Image from 'next/image'
import { CarIcon } from 'lucide-react'
import {
  buildImaginProxyUrl,
  buildWikiProxyUrl,
  type LackfarbeCode,
} from '@/lib/fahrzeug/imagin'
import { useState } from 'react'

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

function getDomain(hersteller: string): string | null {
  const key = hersteller.toLowerCase().trim()
  return BRAND_LOGO_DOMAINS[key] ?? null
}

type Props = {
  hersteller: string | null
  modell: string | null
  lackfarbe: LackfarbeCode | null
  /** Erstzulassungs- oder Modelljahr — wird als modelYear an Imagin
   *  durchgereicht damit das jahrgenaue Asset zurückkommt (statt der
   *  jüngsten Generation). */
  baujahr?: number | string | null
  /** Pixel — Renderbreite. */
  width?: number
  /** Tailwind-Klassen am Wrapper. */
  className?: string
  /** Optionaler Alt-Text-Override. */
  alt?: string
}

type Stage = 'imagin' | 'wiki' | 'clearbit' | 'google' | 'icon'

export default function FahrzeugRenderImage({
  hersteller,
  modell,
  lackfarbe,
  baujahr,
  width = 200,
  className = '',
  alt,
}: Props) {
  const [stage, setStage] = useState<Stage>('imagin')

  const imaginUrl = buildImaginProxyUrl({ hersteller, modell, lackfarbe, baujahr })
  const wikiUrl = buildWikiProxyUrl({ hersteller, modell, baujahr })
  const domain = hersteller ? getDomain(hersteller) : null
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null
  const googleUrl = domain
    ? `https://www.google.com/s2/favicons?sz=128&domain=${domain}`
    : null

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

  function next(from: Stage) {
    if (from === 'imagin') setStage(wikiUrl ? 'wiki' : clearbitUrl ? 'clearbit' : googleUrl ? 'google' : 'icon')
    else if (from === 'wiki') setStage(clearbitUrl ? 'clearbit' : googleUrl ? 'google' : 'icon')
    else if (from === 'clearbit') setStage(googleUrl ? 'google' : 'icon')
    else setStage('icon')
  }

  // Stage 1 — Imagin
  if (stage === 'imagin' && imaginUrl) {
    return (
      <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ width, height }}>
        <Image
          src={imaginUrl}
          alt={altText}
          fill
          sizes={`${width}px`}
          unoptimized
          className="object-contain"
          onError={() => next('imagin')}
        />
      </div>
    )
  }

  // Stage 2 — Wikipedia
  if (stage === 'wiki' && wikiUrl) {
    return (
      <div className={`relative rounded-xl overflow-hidden ${className}`} style={{ width, height }}>
        <Image
          src={wikiUrl}
          alt={altText}
          fill
          sizes={`${width}px`}
          unoptimized
          className="object-contain"
          onError={() => next('wiki')}
        />
      </div>
    )
  }

  // Stage 3 — Clearbit-Logo
  if (stage === 'clearbit' && clearbitUrl) {
    const logoSize = Math.round(width * 0.4)
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 ${className}`}
        style={{ width, height }}
      >
        <Image
          src={clearbitUrl}
          alt={`${hersteller} Logo`}
          width={logoSize}
          height={logoSize}
          unoptimized
          className="object-contain opacity-80"
          onError={() => next('clearbit')}
        />
      </div>
    )
  }

  // Stage 4 — Google-Favicon
  if (stage === 'google' && googleUrl) {
    const logoSize = Math.round(width * 0.4)
    return (
      <div
        className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 ${className}`}
        style={{ width, height }}
      >
        <Image
          src={googleUrl}
          alt={`${hersteller} Logo`}
          width={logoSize}
          height={logoSize}
          unoptimized
          className="object-contain opacity-80"
          onError={() => next('google')}
        />
      </div>
    )
  }

  // Stage 5 — CarIcon
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-claimondo-border/30 text-claimondo-ondo ${className}`}
      style={{ width, height }}
    >
      <CarIcon className="w-8 h-8 opacity-50" />
    </div>
  )
}
