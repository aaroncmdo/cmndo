// Stadt-Daten für SEO-Stadt-Landingpages /kfz-gutachter/[stadt].
// Welle 1: 5 NRW-Städte als Template. Welle 2: 12 weitere NRW-Städte.
// Welle 3: 5 bundesweite Großstädte.

export type Stadt = {
  slug: string
  name: string
  bundesland: string
  plzPrefix: string
  bevoelkerung: string
  lat: number
  lng: number
  /** Spezifische lokale Anker — Gerichte, Anwaltskammer */
  lokal: {
    landgericht: string
    amtsgericht: string
    kammer: string
  }
  /** Honorar-Spannen nach BVSK-Honorartabelle für die Stadt */
  bvskHonorarSpanne: string
  /** Anzahl Partner-SVs in dieser Region */
  partnerSVs: number
  /** Heading-Suffix für H1 — manchmal nominativ, manchmal genitiv */
  h1Anker: string
}

export const STAEDTE: Stadt[] = [
  {
    slug: 'koeln',
    name: 'Köln',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '50–51',
    bevoelkerung: '1,1 Mio.',
    lat: 50.9413,
    lng: 6.9583,
    lokal: {
      landgericht: 'Landgericht Köln',
      amtsgericht: 'Amtsgericht Köln',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '650–2.400 €',
    partnerSVs: 23,
    h1Anker: 'in Köln',
  },
  {
    slug: 'duesseldorf',
    name: 'Düsseldorf',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '40',
    bevoelkerung: '630 Tsd.',
    lat: 51.2277,
    lng: 6.7735,
    lokal: {
      landgericht: 'Landgericht Düsseldorf',
      amtsgericht: 'Amtsgericht Düsseldorf',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '650–2.400 €',
    partnerSVs: 18,
    h1Anker: 'in Düsseldorf',
  },
  {
    slug: 'bonn',
    name: 'Bonn',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '53',
    bevoelkerung: '335 Tsd.',
    lat: 50.7374,
    lng: 7.0982,
    lokal: {
      landgericht: 'Landgericht Bonn',
      amtsgericht: 'Amtsgericht Bonn',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 11,
    h1Anker: 'in Bonn',
  },
  {
    slug: 'aachen',
    name: 'Aachen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '52',
    bevoelkerung: '250 Tsd.',
    lat: 50.7753,
    lng: 6.0839,
    lokal: {
      landgericht: 'Landgericht Aachen',
      amtsgericht: 'Amtsgericht Aachen',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 8,
    h1Anker: 'in Aachen',
  },
  {
    slug: 'dortmund',
    name: 'Dortmund',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '44',
    bevoelkerung: '590 Tsd.',
    lat: 51.5136,
    lng: 7.4653,
    lokal: {
      landgericht: 'Landgericht Dortmund',
      amtsgericht: 'Amtsgericht Dortmund',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 14,
    h1Anker: 'in Dortmund',
  },
]

export function getStadtBySlug(slug: string): Stadt | null {
  return STAEDTE.find((s) => s.slug === slug) ?? null
}
