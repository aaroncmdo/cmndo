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
  /** Imagin angle: 21 = front-driver-side ¾, 13 = side, 1 = front. Default 21. */
  angle?: number
  zoomType?: 'fullscreen' | 'cabin'
}

/** Baut die Imagin-URL. Returnt null wenn weder Hersteller noch Modell
 *  bekannt sind (kein nutzbares Asset).
 *
 *  WICHTIG: Der `demo`-Customer liefert für nicht-lizenzierte Marken
 *  HTTP 200 mit Header `X-Imaginstudio-Error: Access error` und einem
 *  Platzhalter-PNG zurück — das triggert `<img onError>` NICHT, das
 *  Frontend würde also einen leeren/roten Mantel anzeigen statt zum
 *  Logo-Fallback zu wechseln. Solange kein Production-Customer in
 *  `NEXT_PUBLIC_IMAGIN_CUSTOMER` gesetzt ist, skippen wir Imagin
 *  komplett und gehen direkt aufs Hersteller-Logo. */
export function buildImaginUrl({
  hersteller,
  modell,
  lackfarbe,
  angle = 21,
  zoomType = 'fullscreen',
}: ImaginParams): string | null {
  if (!hersteller?.trim()) return null
  if (CUSTOMER === 'demo') return null
  const params = new URLSearchParams({
    customer: CUSTOMER,
    make: hersteller.trim(),
    angle: String(angle),
    zoomType,
    countryCode: 'de',
  })
  if (modell?.trim()) params.set('modelFamily', modell.trim())
  if (lackfarbe) params.set('paintDescription', PAINT_MAP[lackfarbe])
  return `${IMAGIN_BASE}?${params.toString()}`
}
