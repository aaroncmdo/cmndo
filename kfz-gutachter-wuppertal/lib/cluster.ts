// Cluster-Konfiguration · WUPPERTAL (Bergisches Land) — der EINE Cluster dieses
// Projekts. Klone (Duesseldorf/Bonn) ersetzen nur diese Datei + globals.css
// Cluster-Vars + layout theme-color + public/assets/img/{cluster}/.
// Daten exakt aus preview-complete.html (CLUSTERS Z~2014 + RESIDENTS Z~2087).
// Korrektur ggü. Mock: "Sprockhövel"/"Sprockhöveler" (Mock-Typo "Sprockövel"
// behoben — UI-sichtbarer Stadtname, Umlaut-/Qualitaetsregel).

export interface City {
  slug: string
  name: string
  plz: string
  /** H1-Untertitel (SEO-Variation pro Stadt). */
  h1Sub: string
  /** Einwohner-Bezeichnung ("Wuppertaler") fuer Reviews-Headline. */
  residents: string
  /** Stadt-Zentrum-Koordinaten (LocalBusiness-geo + Map-Pin). */
  lat: number
  lng: number
  /** Hauptstadt des Clusters (Hub). */
  main?: boolean
}

export interface Brennpunkt {
  name: string
  /** Pfad relativ zu /assets/img/local/brennpunkte/ */
  img: string
  desc: string
}

export interface ClusterConfig {
  key: string
  region: string
  domain: string
  /** data-theme-Key aus dem Mock (hier nur dokumentarisch — :root traegt die Vars). */
  theme: string
  themeColor: string
  /** Basis-Pfad fuer cluster-spezifische Bilder. */
  imgPath: string
  phone: { display: string; tel: string; wa: string }
  /** Wahrzeichen-Hero (Einsatzgebiet). */
  landmark: { label: string; img: string }
  /** Verkehrs-Hauptachsen + Vor-Ort-Zeit (Facts-Grid). */
  facts: { value: string; label: string; accent?: boolean }[]
  /** Verkehrsschwerpunkte (Hauptstadt-Level, Phase 1). */
  brennpunkte: Brennpunkt[]
  cities: City[]
}

export const CLUSTER: ClusterConfig = {
  key: 'wuppertal',
  region: 'Bergisches Land',
  domain: 'kfz-unfallgutachter-wuppertal.de',
  theme: 'graphit',
  themeColor: '#2A2E33',
  imgPath: '/assets/img/wuppertal/',
  // Telefon einheitlich ueber alle Cluster (Handoff 00a). Weicht bewusst vom
  // Mock ab (Mock tel: 0221-Festnetz) — Aaron-Vorgabe: Mobil +49 1515 3608515.
  phone: { display: '+49 1515 3608515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Schwebebahn', img: 'stadt-wuppertal.png' },
  facts: [
    { value: 'A46', label: 'Hauptachse' },
    { value: 'A1', label: 'Hauptachse' },
    { value: 'B7', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  brennpunkte: [
    { name: 'Widukindstraße', img: 'wuppertal_widukindstrasse.webp', desc: 'Dichter Verkehr, unübersichtliche Kreuzungen — häufig Auffahrunfälle.' },
    { name: 'Hofkamp', img: 'wuppertal_hofkamp.webp', desc: 'Viel Durchgangsverkehr, Straßenbahn-Gleise — regelmäßig Kollisionen.' },
    { name: 'Döppersberg', img: 'wuppertal_doeppersberg.webp', desc: 'Knotenpunkt mit hoher Frequenz — Abbiege-Unfälle und Radverkehr.' },
  ],
  cities: [
    { slug: 'wuppertal',    name: 'Wuppertal',    plz: '42103', main: true, h1Sub: 'unabhängiger Sachverständiger',          residents: 'Wuppertaler',     lat: 51.2562, lng: 7.1508 },
    { slug: 'solingen',     name: 'Solingen',     plz: '42651',             h1Sub: 'Kfz-Sachverständiger Bergisches Land',     residents: 'Solinger',        lat: 51.1652, lng: 7.0671 },
    { slug: 'velbert',      name: 'Velbert',      plz: '42549',             h1Sub: 'Kfz-Sachverständiger Niederberg',          residents: 'Velberter',       lat: 51.3404, lng: 7.0436 },
    { slug: 'heiligenhaus', name: 'Heiligenhaus', plz: '42579',             h1Sub: 'unabhängiger Unfallgutachter',             residents: 'Heiligenhauser',  lat: 51.3258, lng: 6.9706 },
    { slug: 'wuelfrath',    name: 'Wülfrath',     plz: '42489',             h1Sub: 'Kfz-Sachverständiger Kreis Mettmann',      residents: 'Wülfrather',      lat: 51.2820, lng: 7.0386 },
    { slug: 'mettmann',     name: 'Mettmann',     plz: '40822',             h1Sub: 'Kfz-Sachverständiger Kreis Mettmann',      residents: 'Mettmanner',      lat: 51.2510, lng: 6.9750 },
    { slug: 'haan',         name: 'Haan',         plz: '42781',             h1Sub: 'unabhängiger Schadengutachter',            residents: 'Haaner',          lat: 51.1931, lng: 7.0125 },
    { slug: 'schwelm',      name: 'Schwelm',      plz: '58332',             h1Sub: 'Kfz-Sachverständiger Ennepe-Ruhr',         residents: 'Schwelmer',       lat: 51.2870, lng: 7.2940 },
    { slug: 'sprockhoevel', name: 'Sprockhövel',  plz: '45549',             h1Sub: 'Kfz-Sachverständiger Ennepe-Ruhr',         residents: 'Sprockhöveler',   lat: 51.3680, lng: 7.2440 },
    { slug: 'remscheid',    name: 'Remscheid',    plz: '42853',             h1Sub: 'unabhängiger Unfallgutachter',             residents: 'Remscheider',     lat: 51.1787, lng: 7.1897 },
    { slug: 'ennepetal',    name: 'Ennepetal',    plz: '58256',             h1Sub: 'Kfz-Sachverständiger Ennepe-Ruhr',         residents: 'Ennepetaler',     lat: 51.3000, lng: 7.3620 },
    { slug: 'hattingen',    name: 'Hattingen',    plz: '45525',             h1Sub: 'Kfz-Sachverständiger Ennepe-Ruhr',         residents: 'Hattinger',       lat: 51.3990, lng: 7.1860 },
  ],
}

/** Hauptstadt (Hub-Page /). */
export const MAIN_CITY: City = CLUSTER.cities.find((c) => c.main) ?? CLUSTER.cities[0]

/** Alle Slugs. */
export const CITY_SLUGS: string[] = CLUSTER.cities.map((c) => c.slug)

/** Spoke-Slugs (alle ausser Hauptstadt) — generateStaticParams. Die Hauptstadt
 *  IST der Hub "/" → kein dupliziertes /lp/{main}/ (SEO-Dedup, kein 404 weil
 *  Footer die Hauptstadt auf "/" verlinkt). */
export const SPOKE_SLUGS: string[] = CLUSTER.cities.filter((c) => !c.main).map((c) => c.slug)

/** Routing-Pfad einer Stadt (Hauptstadt → "/"). */
export function cityHref(city: City): string {
  return city.main ? '/' : `/lp/${city.slug}`
}

/** Stadt per Slug (oder undefined → 404). */
export function getCity(slug: string): City | undefined {
  return CLUSTER.cities.find((c) => c.slug === slug)
}

/** Vorausgefuellter WhatsApp-Text pro Stadt. */
export function waText(city: City): string {
  return `Hallo, ich hatte einen Unfall in ${city.name} und brauche einen Gutachter.`
}

/** Vollstaendiger wa.me-Link mit vorausgefuelltem Text. */
export function waHref(city: City): string {
  return `https://wa.me/${CLUSTER.phone.wa}?text=${encodeURIComponent(waText(city))}`
}

/** Komma-Liste aller Staedte (Servicegebiet-Text / areaServed). */
export function cityNamesList(): string {
  const names = CLUSTER.cities.map((c) => c.name)
  return names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1]
}
