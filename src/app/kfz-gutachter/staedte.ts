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
  // Welle 2: weitere NRW-Großstädte
  {
    slug: 'essen',
    name: 'Essen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '45',
    bevoelkerung: '585 Tsd.',
    lat: 51.4556,
    lng: 7.0116,
    lokal: {
      landgericht: 'Landgericht Essen',
      amtsgericht: 'Amtsgericht Essen',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 12,
    h1Anker: 'in Essen',
  },
  {
    slug: 'bochum',
    name: 'Bochum',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '44',
    bevoelkerung: '365 Tsd.',
    lat: 51.4818,
    lng: 7.2162,
    lokal: {
      landgericht: 'Landgericht Bochum',
      amtsgericht: 'Amtsgericht Bochum',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 9,
    h1Anker: 'in Bochum',
  },
  {
    slug: 'bielefeld',
    name: 'Bielefeld',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '33',
    bevoelkerung: '335 Tsd.',
    lat: 52.0302,
    lng: 8.5325,
    lokal: {
      landgericht: 'Landgericht Bielefeld',
      amtsgericht: 'Amtsgericht Bielefeld',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 7,
    h1Anker: 'in Bielefeld',
  },
  {
    slug: 'wuppertal',
    name: 'Wuppertal',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '42',
    bevoelkerung: '355 Tsd.',
    lat: 51.2562,
    lng: 7.1508,
    lokal: {
      landgericht: 'Landgericht Wuppertal',
      amtsgericht: 'Amtsgericht Wuppertal',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 8,
    h1Anker: 'in Wuppertal',
  },
  {
    slug: 'moenchengladbach',
    name: 'Mönchengladbach',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '41',
    bevoelkerung: '260 Tsd.',
    lat: 51.1805,
    lng: 6.4428,
    lokal: {
      landgericht: 'Landgericht Mönchengladbach',
      amtsgericht: 'Amtsgericht Mönchengladbach',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 7,
    h1Anker: 'in Mönchengladbach',
  },
  {
    slug: 'oberhausen',
    name: 'Oberhausen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '46',
    bevoelkerung: '210 Tsd.',
    lat: 51.4963,
    lng: 6.8632,
    lokal: {
      landgericht: 'Landgericht Duisburg',
      amtsgericht: 'Amtsgericht Oberhausen',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 6,
    h1Anker: 'in Oberhausen',
  },
  {
    slug: 'leverkusen',
    name: 'Leverkusen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '51',
    bevoelkerung: '165 Tsd.',
    lat: 51.0303,
    lng: 6.9985,
    lokal: {
      landgericht: 'Landgericht Köln',
      amtsgericht: 'Amtsgericht Leverkusen',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '600–2.300 €',
    partnerSVs: 6,
    h1Anker: 'in Leverkusen',
  },
  {
    slug: 'paderborn',
    name: 'Paderborn',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '33',
    bevoelkerung: '155 Tsd.',
    lat: 51.7189,
    lng: 8.7575,
    lokal: {
      landgericht: 'Landgericht Paderborn',
      amtsgericht: 'Amtsgericht Paderborn',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 5,
    h1Anker: 'in Paderborn',
  },
  {
    slug: 'hagen',
    name: 'Hagen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '58',
    bevoelkerung: '190 Tsd.',
    lat: 51.3671,
    lng: 7.4633,
    lokal: {
      landgericht: 'Landgericht Hagen',
      amtsgericht: 'Amtsgericht Hagen',
      kammer: 'Rechtsanwaltskammer Hamm',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 5,
    h1Anker: 'in Hagen',
  },
  {
    slug: 'solingen',
    name: 'Solingen',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '42',
    bevoelkerung: '160 Tsd.',
    lat: 51.1657,
    lng: 7.0846,
    lokal: {
      landgericht: 'Landgericht Wuppertal',
      amtsgericht: 'Amtsgericht Solingen',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 5,
    h1Anker: 'in Solingen',
  },
  {
    slug: 'bergisch-gladbach',
    name: 'Bergisch Gladbach',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '51',
    bevoelkerung: '125 Tsd.',
    lat: 50.9856,
    lng: 7.1320,
    lokal: {
      landgericht: 'Landgericht Köln',
      amtsgericht: 'Amtsgericht Bergisch Gladbach',
      kammer: 'Rechtsanwaltskammer Köln',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 4,
    h1Anker: 'in Bergisch Gladbach',
  },
  {
    slug: 'remscheid',
    name: 'Remscheid',
    bundesland: 'Nordrhein-Westfalen',
    plzPrefix: '42',
    bevoelkerung: '110 Tsd.',
    lat: 51.1789,
    lng: 7.1925,
    lokal: {
      landgericht: 'Landgericht Wuppertal',
      amtsgericht: 'Amtsgericht Remscheid',
      kammer: 'Rechtsanwaltskammer Düsseldorf',
    },
    bvskHonorarSpanne: '550–2.200 €',
    partnerSVs: 4,
    h1Anker: 'in Remscheid',
  },
]

export function getStadtBySlug(slug: string): Stadt | null {
  return STAEDTE.find((s) => s.slug === slug) ?? null
}
