'use client'

// CMM-32: Fahrzeug-Render-Kaskade.
//   1) Imagin-Studio-Render (parametrisch + Lackfarbe + Baujahr) via
//      Server-Proxy. Demo-Customer ist gesperrt — funktioniert erst
//      mit Production-Customer-Key in NEXT_PUBLIC_IMAGIN_CUSTOMER.
//   2) SimpleIcons-CDN (Marken-Logos in Original-Brandfarben, kostenlos).
//   3) Clearbit-Logo-CDN als Sub-Fallback für Marken ohne SimpleIcons-
//      Eintrag (z.B. Opel, Dacia, Smart).
//   4) CarIcon als letzter Fallback.
//
// Aaron 2026-04-30: Wikipedia-Stage rausgenommen, brachte falsche
// Generationen / falsche Modelle bei Freitext-Eingaben. Marken-Logo
// ist ehrlicher und reicht für die Wiedererkennung.

import Image from 'next/image'
import { CarIcon } from 'lucide-react'
import { buildImaginProxyUrl, type LackfarbeCode } from '@/lib/fahrzeug/imagin'
import { useState } from 'react'

/** Hersteller-String → SimpleIcons-Slug. Bei null fallen wir auf
 *  Clearbit zurück (manche Marken haben keinen SimpleIcons-Eintrag). */
const SI_SLUG: Record<string, string | null> = {
  audi:              'audi',
  bmw:               'bmw',
  mercedes:          'mercedes',
  'mercedes-benz':   'mercedes',
  volkswagen:        'volkswagen',
  vw:                'volkswagen',
  porsche:           'porsche',
  ford:              'ford',
  toyota:            'toyota',
  honda:             'honda',
  hyundai:           'hyundai',
  kia:               'kia',
  renault:           'renault',
  peugeot:           'peugeot',
  citroen:           'citroen',
  fiat:              'fiat',
  seat:              'seat',
  skoda:             'skoda',
  cupra:             'cupra',
  volvo:             'volvo',
  mazda:             'mazda',
  nissan:            'nissan',
  mitsubishi:        'mitsubishi',
  suzuki:            'suzuki',
  tesla:             'tesla',
  mini:              'mini',
  'land rover':      'landrover',
  jaguar:            'jaguar',
  'alfa romeo':      'alfaromeo',
  lexus:             'lexus',
  infiniti:          'infiniti',
  jeep:              'jeep',
  chevrolet:         'chevrolet',
  ferrari:           'ferrari',
  maserati:          'maserati',
  // Marken ohne SimpleIcons-Eintrag → null → Clearbit
  opel:              null,
  smart:             null,
  dacia:             null,
  chrysler:          null,
  dodge:             null,
  subaru:            null,
}

const CLEARBIT_DOMAIN: Record<string, string> = {
  opel:    'opel.com',
  smart:   'smart.com',
  dacia:   'dacia.com',
  chrysler:'chrysler.com',
  dodge:   'dodge.com',
  subaru:  'subaru.com',
}

function lookupKey(hersteller: string): string {
  return hersteller.toLowerCase().trim()
}

type Props = {
  hersteller: string | null
  modell: string | null
  lackfarbe: LackfarbeCode | null
  baujahr?: number | string | null
  width?: number
  className?: string
  alt?: string
  /** Auf dunklem Hintergrund: Logo weiß, kein Grau-Placeholder */
  dark?: boolean
}

type Stage = 'imagin' | 'simpleicons' | 'clearbit' | 'icon'

export default function FahrzeugRenderImage({
  hersteller,
  modell,
  lackfarbe,
  baujahr,
  width = 200,
  className = '',
  alt,
  dark = false,
}: Props) {
  const [stage, setStage] = useState<Stage>('imagin')

  const altText = alt ?? `${hersteller ?? 'Fahrzeug'} ${modell ?? ''}`.trim()
  const height = Math.round(width * 0.6)

  if (!hersteller) {
    return (
      <div
        className={`flex items-center justify-center ${dark ? 'text-white/60' : 'rounded-xl bg-claimondo-border/30 text-claimondo-ondo'} ${className}`}
        style={{ width, height }}
      >
        <CarIcon className="w-8 h-8 opacity-50" />
      </div>
    )
  }

  const key = lookupKey(hersteller)
  const imaginUrl = buildImaginProxyUrl({ hersteller, modell, lackfarbe, baujahr })
  const siSlug = key in SI_SLUG ? SI_SLUG[key] : null
  // dark=true → weiß (für dunkle Hintergründe), sonst Claimondo-Navy im CI.
  const siColor = dark ? 'FFFFFF' : '0D1B3E'
  const siUrl = siSlug ? `https://cdn.simpleicons.org/${siSlug}/${siColor}` : null
  const clearbitDomain = CLEARBIT_DOMAIN[key] ?? null
  const clearbitUrl = clearbitDomain ? `https://logo.clearbit.com/${clearbitDomain}` : null

  function next(from: Stage) {
    if (from === 'imagin') setStage(siUrl ? 'simpleicons' : clearbitUrl ? 'clearbit' : 'icon')
    else if (from === 'simpleicons') setStage(clearbitUrl ? 'clearbit' : 'icon')
    else setStage('icon')
  }

  // Stage 1 — Imagin
  if (stage === 'imagin' && imaginUrl) {
    return (
      <div
        className={`relative rounded-xl overflow-hidden ${className}`}
        style={{ width, height }}
      >
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

  // Stage 2 — SimpleIcons (Marken-Logo in Claimondo-Navy, ohne Hintergrund)
  if (stage === 'simpleicons' && siUrl) {
    const logoSize = Math.round(width * 0.6)
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <Image
          src={siUrl}
          alt={`${hersteller} Logo`}
          width={logoSize}
          height={logoSize}
          unoptimized
          className="object-contain"
          onError={() => next('simpleicons')}
        />
      </div>
    )
  }

  // Stage 3 — Clearbit (für Marken ohne SimpleIcons-Eintrag) — ohne Hintergrund
  if (stage === 'clearbit' && clearbitUrl) {
    const logoSize = Math.round(width * 0.55)
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ width, height }}
      >
        <Image
          src={clearbitUrl}
          alt={`${hersteller} Logo`}
          width={logoSize}
          height={logoSize}
          unoptimized
          className="object-contain"
          onError={() => next('clearbit')}
        />
      </div>
    )
  }

  // Stage 4 — CarIcon
  return (
    <div
      className={`flex items-center justify-center ${dark ? 'text-white/60' : 'rounded-xl bg-claimondo-border/30 text-claimondo-ondo'} ${className}`}
      style={{ width, height }}
    >
      <CarIcon className="w-8 h-8 opacity-50" />
    </div>
  )
}
