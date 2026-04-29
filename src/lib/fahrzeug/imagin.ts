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

/** Mapping unsere Codes → Imagin paintIds. Generische Imagin-IDs decken
 *  die meisten Hersteller ab; bei Bedarf spaeter pro Marke ueberschreiben. */
const PAINT_MAP: Record<LackfarbeCode, string> = {
  schwarz:  'pspc0001',  // generic black
  weiss:    'pspc0002',  // generic white
  silber:   'pspc0004',  // generic silver
  grau:     'pspc0005',  // generic grey
  blau:     'pspc0008',  // generic blue
  rot:      'pspc0006',  // generic red
  gruen:    'pspc0009',  // generic green
  gelb:     'pspc0007',  // generic yellow
  orange:   'pspc0010',  // generic orange
  braun:    'pspc0011',  // generic brown
  beige:    'pspc0003',  // generic beige
  sonstige: 'pspc0004',  // fallback silber
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
 *  bekannt sind (kein nutzbares Asset). Imagin selbst macht graceful
 *  fallback auf generische Renderings wenn das exakte Modell fehlt. */
export function buildImaginUrl({
  hersteller,
  modell,
  lackfarbe,
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
  if (lackfarbe) params.set('paintId', PAINT_MAP[lackfarbe])
  return `${IMAGIN_BASE}?${params.toString()}`
}
