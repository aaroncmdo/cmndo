// ============================================================================
// CLUSTER-KONFIG · DÜSSELDORF (Rheinland)
// ============================================================================
// Re-Skin auf den Köln-Endstand (08o–08q): Schema + Komponenten stammen aus der
// Köln-Vorlage, Inhalt/Farbe/Assets bleiben Düsseldorf. Dies ist die EINZIGE
// Datei mit der Cluster-Identität (Städte, Region, Brennpunkte, SEO).
// Theme-Farben: app/globals.css :root. themeColor: app/layout.tsx.
// Bilder: public/assets/img/duesseldorf/.
// ============================================================================

export interface City {
  slug: string
  name: string
  plz: string
  /** H1-Untertitel (SEO-Variation pro Stadt). */
  h1Sub: string
  /** Einwohner-Bezeichnung ("Düsseldorfer") fuer Reviews-Headline. */
  residents: string
  /** Stadt-Zentrum-Koordinaten (LocalBusiness-geo + Map-Pin). */
  lat: number
  lng: number
  /** Hauptstadt des Clusters (Hub). */
  main?: boolean
}

export interface Brennpunkt {
  name: string
  /** Pfad relativ zu CLUSTER.imgPath */
  img: string
  desc: string
}

export interface ClusterConfig {
  key: string
  region: string
  /** Region im Dativ ("im Rheinland") fuer Ueber-uns-Copy. */
  regionDative: string
  /** Quellen-Anker fuer Brennpunkt-Statistik (Einsatzgebiet-Disclaimer). */
  quellenAnker: string
  /** Hauptachsen (FAQ-Q2, cluster-spezifisch). */
  achsen: string[]
  /** Stadtteile der Hauptstadt (FAQ-Lokal-Card). */
  stadtteile: string[]
  domain: string
  /** data-theme-Key (dokumentarisch — :root in globals.css traegt die Vars). */
  theme: string
  themeColor: string
  /** Basis-Pfad fuer cluster-spezifische Bilder. */
  imgPath: string
  /** Dateiendung der Logo-Varianten logo-{key}-dark/-white. */
  logoExt: 'png' | 'svg'
  /** 08m A6 · Cache-Busting: bei INHALTS-Tausch eines Assets (gleicher Dateiname)
   *  hochzaehlen — haengt als ?v=… an Hero-/Logo-/Team-Referenzen (Komponenten +
   *  die beiden image-set-Vars in globals.css manuell mitziehen!). */
  assetVersion: string
  /** H1-Sub-Span im Hero (NUR Desktop lg:+, Action 0 P2). */
  h1SubSpan: string
  /** Team-Foto (Netzwerk-Mobile Team-Hero-Card). */
  teamImg: string
  /** Vorname des lokalen SV (CTA-Rolle + Ueber-uns). */
  svName: string
  /** Nachname des lokalen SV (Person-Schema / formale Nennung). */
  svSurname: string
  phone: {
    display: string
    /** National formatiertes CTA-Label — href/tel bleibt international. */
    displayNational: string
    tel: string
    wa: string
  }
  /** Wahrzeichen-Hero (Einsatzgebiet). */
  landmark: { label: string; img: string }
  /** Verkehrs-Hauptachsen + Vor-Ort-Zeit (Facts-Grid). */
  facts: { value: string; label: string; accent?: boolean }[]
  /** Verkehrsschwerpunkte (Hauptstadt-Level). */
  brennpunkte: Brennpunkt[]
  cities: City[]
}

export const CLUSTER: ClusterConfig = {
  key: 'duesseldorf',
  region: 'Rheinland',
  regionDative: 'Rheinland',
  quellenAnker: 'Polizei-Verkehrsbericht 2025',
  achsen: ['A46', 'A52', 'A57', 'A3'],
  stadtteile: ['Altstadt', 'Bilk', 'Oberkassel', 'Pempelfort', 'Gerresheim', 'Derendorf'],
  domain: 'kfz-unfallgutachter-duesseldorf.de',
  theme: 'rhein', // Düsseldorf-Cluster: Marineblau + Royal-Blue — globals.css :root traegt die Vars
  themeColor: '#0B3D6E', // Düsseldorf-Cluster (matched globals.css :root)
  imgPath: '/assets/img/duesseldorf/',
  logoExt: 'svg', // Düsseldorf: logo-duesseldorf-dark.svg vorhanden — TODO Aaron: logo-duesseldorf-white.svg fehlt noch (Header-transparent + Footer)
  assetVersion: '1',
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.',
  teamImg: '/assets/img/duesseldorf/team-duesseldorf.webp?v=1',
  svName: 'Tobias', // Düsseldorf-Cluster Persona (Vorname)
  svSurname: 'Vogt', // Persona-Nachname (Tobias Vogt)
  // Telefon einheitlich ueber alle Cluster (Aaron-Vorgabe Mobil).
  phone: { display: '+49 1515 3608515', displayNational: '0151 5360 8515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Rheinturm', img: 'stadt-duesseldorf.png' },
  facts: [
    { value: 'A3', label: 'Hauptachse' },
    { value: 'A46', label: 'Hauptachse' },
    { value: 'A57', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  // Verkehrsschwerpunkte Düsseldorf-Hub — lokal verankert (Quellen s. quellenAnker).
  brennpunkte: [
    { name: 'Berliner Allee', img: 'duesseldorf_berliner-allee.webp', desc: 'Dichter Innenstadtverkehr, viele Spurwechsel — häufig Auffahr- und Abbiegeunfälle.' },
    { name: 'Corneliusstraße', img: 'duesseldorf_corneliusstrasse.webp', desc: 'Stark befahrene Hauptachse mit Straßenbahn — regelmäßig Kollisionen.' },
    { name: 'Ernst-Reuter-Platz', img: 'duesseldorf_ernst-reuter-platz.webp', desc: 'Komplexer Knotenpunkt mit hoher Frequenz — Vorfahrts- und Radverkehrs-Unfälle.' },
  ],
  // Hub = Düsseldorf (main:true). Spokes = die uebrigen.
  cities: [
    { slug: 'duesseldorf',  name: 'Düsseldorf',  plz: '40210', main: true, h1Sub: 'unabhängiger Sachverständiger',          residents: 'Düsseldorfer',   lat: 51.2277, lng: 6.7735 },
    { slug: 'neuss',        name: 'Neuss',        plz: '41460',             h1Sub: 'Kfz-Sachverständiger Rhein-Kreis Neuss',   residents: 'Neusser',        lat: 51.1979, lng: 6.6855 },
    { slug: 'hilden',       name: 'Hilden',       plz: '40721',             h1Sub: 'Kfz-Sachverständiger Kreis Mettmann',      residents: 'Hildener',       lat: 51.1696, lng: 6.9392 },
    { slug: 'erkrath',      name: 'Erkrath',      plz: '40699',             h1Sub: 'unabhängiger Schadengutachter',            residents: 'Erkrather',      lat: 51.2230, lng: 6.9080 },
    { slug: 'langenfeld',   name: 'Langenfeld',   plz: '40764',             h1Sub: 'Kfz-Sachverständiger Rheinland',           residents: 'Langenfelder',   lat: 51.1093, lng: 6.9483 },
    { slug: 'monheim',      name: 'Monheim',      plz: '40789',             h1Sub: 'unabhängiger Unfallgutachter',             residents: 'Monheimer',      lat: 51.0915, lng: 6.8917 },
    { slug: 'ratingen',     name: 'Ratingen',     plz: '40878',             h1Sub: 'Kfz-Sachverständiger Kreis Mettmann',      residents: 'Ratinger',       lat: 51.2974, lng: 6.8492 },
    { slug: 'meerbusch',    name: 'Meerbusch',    plz: '40667',             h1Sub: 'unabhängiger Schadengutachter',            residents: 'Meerbuscher',    lat: 51.2560, lng: 6.6800 },
    { slug: 'grevenbroich', name: 'Grevenbroich', plz: '41515',             h1Sub: 'Kfz-Sachverständiger Rhein-Kreis Neuss',   residents: 'Grevenbroicher', lat: 51.0876, lng: 6.5860 },
  ],
}

/** Hauptstadt (Hub-Page /). */
export const MAIN_CITY: City = CLUSTER.cities.find((c) => c.main) ?? CLUSTER.cities[0]

/** Alle Slugs. */
export const CITY_SLUGS: string[] = CLUSTER.cities.map((c) => c.slug)

/** Spoke-Slugs (alle ausser Hauptstadt) — generateStaticParams. Die Hauptstadt
 *  IST der Hub "/" → kein dupliziertes /lp/{main}/ (SEO-Dedup). */
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

// ── SEO-Body (08o O6: strukturierte Absaetze statt Fliesstext) ───────────────
// H3s sind EDITORIAL an ihre Absaetze gebunden. `vorort: true` markiert den
// Absatz, der in der Einsatzgebiet-Lokalstrecke rendert (lib/seoVorOrt); `liste`
// rendert als kompakte Leistungs-Liste. Düsseldorf-Re-Skin: bestehende kurze
// Lokal-Texte 1:1 erhalten, je Stadt in Intro-Absatz + Vor-Ort-Absatz gesplittet.
export interface SeoAbsatz {
  /** Editorial gebundene Zwischenueberschrift — stellt die Frage, die der Absatz beantwortet. */
  h3?: string
  text: string
  /** Kompakte Leistungs-Liste nach dem Text. */
  liste?: string[]
  /** Rendert in der Einsatzgebiet-Lokalstrecke ("Vor Ort"), nicht im SeoBody. */
  vorort?: boolean
}

export const SEO_BODY: Record<string, SeoAbsatz[]> = {
  duesseldorf: [
    { text: `Nach einem Verkehrsunfall in Düsseldorf (40210) zählt jede Stunde: Als unabhängiger Kfz-Gutachter vor Ort dokumentieren wir den Schaden zeitnah und neutral nach BVSK-Standard. Die Landeshauptstadt im Herzen des Rheinlands ist über die A57, A52 und A46 erreichbar, und auch Anfragen aus den Nachbarorten Neuss und Meerbusch bearbeiten wir kurzfristig.` },
    { vorort: true, text: `War der Unfall unverschuldet, trägt die gegnerische Versicherung die Kosten des Gutachtens für Sie. Über unser Netzwerk vermitteln wir bei Bedarf zusätzlich einen Anwalt und einen Mietwagen.` },
  ],
  neuss: [
    { text: `Auf der linken Rheinseite gelegen, ist Neuss (41460) über die A57 und A46 gut angebunden und damit für unseren Kfz-Sachverständigen schnell erreichbar. Wir kommen zu Ihnen, begutachten das beschädigte Fahrzeug und erstellen ein unabhängiges Gutachten nach BVSK-Richtlinien.` },
    { vorort: true, text: `Nach einem unverschuldeten Unfall zahlt die Versicherung der Gegenseite, für Sie entstehen 0 Euro. Auch Einsätze in den benachbarten Städten Grevenbroich und Meerbusch koordinieren wir zügig. Bei Bedarf stellen wir über unser Netzwerk Kontakt zu einem Anwalt und einem Mietwagenangebot her.` },
  ],
  hilden: [
    { text: `Hilden (40721) liegt verkehrsgünstig im Kreis Mettmann am Autobahnkreuz von A3 und A46. Diese Knotenlage bringt viel Durchgangsverkehr mit sich, und genau hier sind wir als unabhängiger Kfz-Gutachter Hilden für Sie da: schnelle Vor-Ort-Begutachtung, neutrale Bewertung nach BVSK-Standard und eine klare Dokumentation für die Schadensregulierung.` },
    { vorort: true, text: `Bei einem unverschuldeten Unfall übernimmt die gegnerische Versicherung die Gutachterkosten. Anfragen aus Erkrath und Langenfeld bedienen wir ebenso, und über unser Netzwerk vermitteln wir Anwalt sowie Mietwagen.` },
  ],
  erkrath: [
    { text: `Direkt östlich von Düsseldorf gelegen, profitiert Erkrath (40699) von der Anbindung an die A3 und die A46. Wenn Ihr Auto nach einem Unfall beschädigt wurde, prüfen wir es als unabhängige Kfz-Sachverständige vor Ort und halten Schadenhöhe sowie Wertminderung nach anerkannten Standards fest.` },
    { vorort: true, text: `Bei unverschuldeten Unfällen rechnen wir direkt mit der gegnerischen Versicherung ab, sodass für Sie keine Kosten anfallen. Wir sind auch in den Nachbarstädten Hilden und Ratingen tätig. Auf Wunsch organisieren wir über unser Netzwerk anwaltliche Unterstützung und einen Mietwagen.` },
  ],
  langenfeld: [
    { text: `Zwischen Düsseldorf und Köln im südlichen Rheinland gelegen, ist Langenfeld (40764) über die A3 und A542 angebunden. Als Kfz-Gutachter Langenfeld kommen wir kurzfristig zu Ihnen, begutachten das Unfallfahrzeug und erstellen ein unabhängiges, gerichtsfestes Gutachten nach marktübliche Kalkulation.` },
    { vorort: true, text: `Nach einem unverschuldeten Unfall trägt die Versicherung des Verursachers sämtliche Kosten, für Sie bleibt es bei 0 Euro. Einsätze in Monheim und Hilden gehören ebenfalls zu unserem Gebiet. Bei Bedarf vermitteln wir über unser Netzwerk einen passenden Anwalt und einen Mietwagen.` },
  ],
  monheim: [
    { text: `Am Rhein zwischen Düsseldorf und Leverkusen liegt Monheim (40789), verkehrlich über die A59 und A542 erschlossen. Brauchen Sie nach einem Blechschaden eine neutrale Einschätzung, übernimmt das unser unabhängiger Kfz-Sachverständiger direkt vor Ort, inklusive Fotodokumentation und Bewertung nach BVSK-Standard.` },
    { vorort: true, text: `Ist die Schuldfrage zu Ihren Gunsten geklärt, zahlt die gegnerische Versicherung das Gutachten. Wir betreuen auch die angrenzenden Städte Langenfeld und Düsseldorf. Über unser Netzwerk stellen wir Ihnen auf Wunsch einen Anwalt sowie einen Mietwagen zur Seite.` },
  ],
  ratingen: [
    { text: `Nördlich von Düsseldorf im Kreis Mettmann gelegen, ist Ratingen (40878) über die A3, A44 und A52 hervorragend erreichbar. Diese Lage am Autobahndreieck sorgt für dichten Verkehr, und nach einem Unfall begutachten wir Ihr Fahrzeug als unabhängiger Kfz-Gutachter Ratingen schnell und neutral. Die Bewertung erfolgt nach BVSK-Standard, das Ergebnis ist für die Regulierung verwertbar.` },
    { vorort: true, text: `Bei unverschuldeten Unfällen zahlt die Gegenseite. Auch in Meerbusch und Erkrath sind wir im Einsatz, und über unser Netzwerk vermitteln wir Anwalt und Mietwagen.` },
  ],
  meerbusch: [
    { text: `Meerbusch (40667) liegt linksrheinisch zwischen Düsseldorf und Neuss und ist über die A57 und A44 angebunden. Hatten Sie einen Verkehrsunfall, kommt unser unabhängiger Kfz-Sachverständiger zu Ihnen nach Hause oder in die Werkstatt und erstellt zeitnah ein neutrales Gutachten nach anerkannten Standards.` },
    { vorort: true, text: `Trifft Sie keine Schuld, übernimmt die Versicherung des Unfallgegners die Kosten vollständig. Wir sind ebenso in den Nachbarstädten Ratingen und Neuss unterwegs. Auf Wunsch organisieren wir über unser Netzwerk die passende anwaltliche Begleitung und einen Mietwagen.` },
  ],
  grevenbroich: [
    { text: `Im Rhein-Kreis Neuss am westlichen Rand des Rheinlands gelegen, ist Grevenbroich (41515) über die A540 und A46 erschlossen. Nach einem Unfall begutachten wir Ihr beschädigtes Fahrzeug als unabhängiger Kfz-Gutachter Grevenbroich direkt vor Ort und dokumentieren Reparaturkosten und Wertminderung nach BVSK-Standard.` },
    { vorort: true, text: `War der Unfall unverschuldet, rechnen wir mit der gegnerischen Versicherung ab, für Sie entstehen 0 Euro. Wir betreuen auch Neuss und Langenfeld in der Umgebung. Bei Bedarf vermitteln wir über unser Netzwerk einen Anwalt und einen Mietwagen.` },
  ],
}

export function seoBodyFor(slug: string): SeoAbsatz[] {
  return SEO_BODY[slug] ?? []
}

// Per-Stadt-metaHook (Lever 2): kurzer, unique lokaler Aufhaenger fuer die Meta-
// Description (seo.ts) statt des recycelten h1Sub -> killt near-duplicate-Snippets.
// Distilliert aus SEO_BODY, <=40 Z. Fehlt ein Slug -> Fallback auf city.h1Sub.
export const META_HOOKS: Record<string, string> = {
  duesseldorf: 'Landeshauptstadt am Rhein, A57/A52/A46',
  neuss: 'Linksrheinisch im Rhein-Kreis, A57/A46',
  hilden: 'Autobahnkreuz A3/A46, Kreis Mettmann',
  erkrath: 'Neandertal-Rand, A3 & A46',
  langenfeld: 'Zwischen Düsseldorf & Köln, A3',
  monheim: 'Am Rhein zw. Düsseldorf & Leverkusen',
  ratingen: 'AD A3/A44/A52, Kreis Mettmann',
  meerbusch: 'Linksrheinisch zw. Düsseldorf & Neuss',
  grevenbroich: 'Rhein-Kreis-Westrand, A540 & A46',
}
