// CMM-32: Imagin-Studio-Render-URL-Helper. Liefert Bilder von Fahrzeugen
// in der gewuenschten Lackfarbe. Demo-Customer ist gratis (Wasserzeichen),
// Production-Lizenz wird spaeter ausgetauscht via env IMAGIN_CUSTOMER.
//
// Doku: https://www.imagin.studio/library/api
// Endpoint:
//   https://cdn.imagin.studio/getimage
//     ?customer=demo
//     &make=BMW
//     &modelFamily=320
//     &paintId=imagin-blue-pearl
//     &angle=21
//     &zoomType=fullscreen
//     &countryCode=de

const IMAGIN_BASE = 'https://cdn.imagin.studio/getimage'
const CUSTOMER = process.env.NEXT_PUBLIC_IMAGIN_CUSTOMER ?? 'demo'

export type LackfarbeCode =
  | 'schwarz'
  | 'weiss'
  | 'silber'
  | 'grau'
  | 'blau'
  | 'rot'
  | 'gruen'
  | 'gelb'
  | 'orange'
  | 'braun'
  | 'beige'
  | 'sonstige'

/** Mapping unsere Codes → Imagin paintDescription (Plain-English).
 *  paintDescription ist robuster als paintId weil Imagin damit dann das
 *  passende Hersteller-spezifische Asset wählt. */
const PAINT_MAP: Record<LackfarbeCode, string> = {
  schwarz:  'black',
  weiss:    'white',
  silber:   'silver',
  grau:     'grey',
  blau:     'blue',
  rot:      'red',
  gruen:    'green',
  gelb:     'yellow',
  orange:   'orange',
  braun:    'brown',
  beige:    'beige',
  sonstige: 'silver',
}

export const LACKFARBE_LABEL: Record<LackfarbeCode, string> = {
  schwarz:  'Schwarz',
  weiss:    'Weiß',
  silber:   'Silber',
  grau:     'Grau',
  blau:     'Blau',
  rot:      'Rot',
  gruen:    'Grün',
  gelb:     'Gelb',
  orange:   'Orange',
  braun:    'Braun',
  beige:    'Beige',
  sonstige: 'Sonstige',
}

export const LACKFARBE_OPTIONS: { value: LackfarbeCode; label: string }[] =
  (Object.keys(LACKFARBE_LABEL) as LackfarbeCode[]).map((value) => ({
    value,
    label: LACKFARBE_LABEL[value],
  }))

export type ImaginParams = {
  hersteller: string | null
  modell: string | null
  lackfarbe: LackfarbeCode | null
  /** Erstzulassungs- bzw. Modelljahr (vierstellig, z.B. 2019).
   *  Wenn übergeben, schickt der Imagin-Endpoint das modell-jahrgenaue
   *  Asset zurück (nicht den aktuellen Generations-Default). */
  baujahr?: number | string | null
  /** Imagin angle: 21 = front-driver-side ¾, 13 = side, 1 = front. Default 21. */
  angle?: number
  zoomType?: 'fullscreen' | 'cabin'
}

/** Baut die Imagin-Direkt-URL. Returnt null wenn kein Hersteller bekannt
 *  ist. Wird ausschließlich vom Proxy-Route `/api/fahrzeug/imagin`
 *  konsumiert — der filtert den `X-Imaginstudio-Error`-Header raus,
 *  damit `<img onError>` im Browser zuverlässig feuert. Das Frontend
 *  ruft NICHT diese URL direkt auf. */
export function buildImaginUrl({
  hersteller,
  modell,
  lackfarbe,
  baujahr,
  angle = 21,
  zoomType = 'fullscreen',
}: ImaginParams): string | null {
  if (!hersteller?.trim()) return null
  const params = new URLSearchParams({
    customer: CUSTOMER,
    make: hersteller.trim(),
    angle: String(angle),
    zoomType,
    countryCode: 'de',
  })
  if (modell?.trim()) params.set('modelFamily', modell.trim())
  if (lackfarbe) params.set('paintDescription', PAINT_MAP[lackfarbe])
  if (baujahr != null) {
    const yr = String(baujahr).match(/\d{4}/)?.[0]
    if (yr) params.set('modelYear', yr)
  }
  return `${IMAGIN_BASE}?${params.toString()}`
}

/** Browser-seitige URL — geht durch unseren Proxy. */
export function buildImaginProxyUrl({
  hersteller,
  modell,
  lackfarbe,
  baujahr,
  angle,
}: {
  hersteller: string | null
  modell: string | null
  lackfarbe: LackfarbeCode | null
  baujahr?: number | string | null
  /** Imagin angle: 21 = front-driver-side ¾ (Default), 13 = Seite, 1 = Front. */
  angle?: number
}): string | null {
  if (!hersteller?.trim()) return null
  const params = new URLSearchParams({ make: hersteller.trim() })
  if (modell?.trim()) params.set('model', modell.trim())
  if (lackfarbe) params.set('paint', lackfarbe)
  if (baujahr != null) {
    const yr = String(baujahr).match(/\d{4}/)?.[0]
    if (yr) params.set('year', yr)
  }
  if (angle != null) params.set('angle', String(angle))
  return `/api/fahrzeug/imagin?${params.toString()}`
}

/** Wikipedia-Proxy für Auto-Thumbnails (zweite Fallback-Stufe). */
export function buildWikiProxyUrl({
  hersteller,
  modell,
  baujahr,
}: {
  hersteller: string | null
  modell: string | null
  baujahr?: number | string | null
}): string | null {
  if (!hersteller?.trim()) return null
  const params = new URLSearchParams({ make: hersteller.trim() })
  if (modell?.trim()) params.set('model', modell.trim())
  if (baujahr != null) {
    const yr = String(baujahr).match(/\d{4}/)?.[0]
    if (yr) params.set('year', yr)
  }
  return `/api/fahrzeug/wiki?${params.toString()}`
}
