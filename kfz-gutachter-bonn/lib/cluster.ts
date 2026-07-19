// ============================================================================
// CLUSTER-KONFIG · BONN (Rhein-Sieg)
// ============================================================================
// Re-Skin auf den Koeln-Endstand (08o-08q): Schema + Komponenten aus der
// Koeln-Vorlage, Inhalt/Farbe/Assets bleiben Bonn. Einzige Datei mit der
// Cluster-Identitaet. Theme-Farben: app/globals.css :root (Tinten-Schwarz +
// Antikgold). themeColor: layout.tsx. Bilder: public/assets/img/bonn/.
// ============================================================================

export interface City {
  slug: string
  name: string
  plz: string
  /** H1-Untertitel (SEO-Variation pro Stadt). */
  h1Sub: string
  /** Einwohner-Bezeichnung ("Bonner") fuer Reviews-Headline. */
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
  /** Region im Dativ ("im Rhein-Sieg-Kreis") fuer Ueber-uns-Copy. */
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
  /** 08m A6 · Cache-Busting: bei INHALTS-Tausch eines Assets (gleicher Dateiname) hochzaehlen. */
  assetVersion: string
  /** H1-Sub-Span im Hero (NUR Desktop lg:+). */
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
  key: 'bonn',
  region: 'Rhein-Sieg',
  regionDative: 'Rhein-Sieg-Kreis',
  quellenAnker: 'Polizei-Bonn-Verkehrsstatistik 2025',
  achsen: ['A565', 'A562', 'A59', 'B9', 'B56'],
  stadtteile: ['Bad Godesberg', 'Beuel', 'Hardtberg', 'Poppelsdorf', 'Bonn-Zentrum'],
  domain: 'kfz-unfallgutachter-bonn.de',
  theme: 'nacht', // Bonn: Tinten-Schwarz + Antikgold — globals.css :root traegt die Vars
  themeColor: '#0F1014',
  imgPath: '/assets/img/bonn/',
  logoExt: 'svg', // Bonn: logo-bonn-dark.svg vorhanden — TODO Aaron: logo-bonn-white.svg fehlt noch
  assetVersion: '1',
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.',
  teamImg: '/assets/img/bonn/team-bonn.webp?v=1',
  svName: 'Tobias',
  svSurname: 'Becker', // Persona-Nachname (Tobias Becker)
  phone: { display: '+49 1515 3608515', displayNational: '0151 5360 8515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Bonner Münster', img: 'stadt-bonn.png' },
  facts: [
    { value: 'A59', label: 'Hauptachse' },
    { value: 'A565', label: 'Hauptachse' },
    { value: 'A555', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  brennpunkte: [
    { name: 'Reuterstraße', img: 'bonn_reuterstrasse.webp', desc: 'Stark befahrene Innenstadtachse mit vielen Kreuzungen — erhöhtes Risiko für Auffahr- und Abbiegeunfälle.' },
    { name: 'Hochkreuzallee', img: 'bonn_hochkreuzallee.webp', desc: 'Vielspurige Hauptverkehrsstraße im Süden — dichter Berufsverkehr und häufige Spurwechsel.' },
    { name: 'Hermannstraße', img: 'bonn_hermannstrasse.webp', desc: 'Belebte Straße mit Rad- und Lieferverkehr — typische Park- und Abbiegekollisionen.' },
  ],
  cities: [
    { slug: 'bonn',           name: 'Bonn',           plz: '53111', main: true, h1Sub: 'unabhängiger Sachverständiger',          residents: 'Bonner',            lat: 50.7374, lng: 7.0982 },
    { slug: 'sankt-augustin', name: 'Sankt Augustin', plz: '53757',             h1Sub: 'Kfz-Sachverständiger Rhein-Sieg',          residents: 'Sankt Augustiner',  lat: 50.7700, lng: 7.1870 },
    { slug: 'siegburg',       name: 'Siegburg',       plz: '53721',             h1Sub: 'Kfz-Sachverständiger Rhein-Sieg',          residents: 'Siegburger',        lat: 50.7959, lng: 7.2070 },
    { slug: 'troisdorf',      name: 'Troisdorf',      plz: '53840',             h1Sub: 'unabhängiger Unfallgutachter',             residents: 'Troisdorfer',       lat: 50.8160, lng: 7.1560 },
    { slug: 'koenigswinter',  name: 'Königswinter',   plz: '53639',             h1Sub: 'Kfz-Sachverständiger Siebengebirge',       residents: 'Königswinterer',    lat: 50.6840, lng: 7.1880 },
    { slug: 'bad-honnef',     name: 'Bad Honnef',     plz: '53604',             h1Sub: 'Kfz-Sachverständiger Siebengebirge',       residents: 'Bad Honnefer',      lat: 50.6450, lng: 7.2270 },
    { slug: 'hennef',         name: 'Hennef',         plz: '53773',             h1Sub: 'Kfz-Sachverständiger Rhein-Sieg',          residents: 'Hennefer',          lat: 50.7730, lng: 7.2830 },
    { slug: 'bornheim',       name: 'Bornheim',       plz: '53332',             h1Sub: 'unabhängiger Schadengutachter',            residents: 'Bornheimer',        lat: 50.7600, lng: 6.9900 },
    { slug: 'rheinbach',      name: 'Rheinbach',      plz: '53359',             h1Sub: 'Kfz-Sachverständiger Voreifel',            residents: 'Rheinbacher',       lat: 50.6258, lng: 6.9490 },
    { slug: 'meckenheim',     name: 'Meckenheim',     plz: '53340',             h1Sub: 'Kfz-Sachverständiger Voreifel',            residents: 'Meckenheimer',      lat: 50.6256, lng: 7.0289 },
  ],
}

/** Hauptstadt (Hub-Page /). */
export const MAIN_CITY: City = CLUSTER.cities.find((c) => c.main) ?? CLUSTER.cities[0]

/** Alle Slugs. */
export const CITY_SLUGS: string[] = CLUSTER.cities.map((c) => c.slug)

/** Spoke-Slugs (alle ausser Hauptstadt) — generateStaticParams. */
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
// `vorort: true` markiert den Absatz, der in der Einsatzgebiet-Lokalstrecke
// rendert (lib/seoVorOrt). Bonn-Re-Skin: bestehende Lokal-Texte 1:1 erhalten,
// je Stadt in Intro-Absatz + Vor-Ort-Absatz (Nachbarorte) gesplittet.
export interface SeoAbsatz {
  /** Editorial gebundene Zwischenueberschrift. */
  h3?: string
  text: string
  /** Kompakte Leistungs-Liste nach dem Text. */
  liste?: string[]
  /** Rendert in der Einsatzgebiet-Lokalstrecke ("Vor Ort"), nicht im SeoBody. */
  vorort?: boolean
}

export const SEO_BODY: Record<string, SeoAbsatz[]> = {
  bonn: [
    { text: `Als ehemalige Bundesstadt am Rhein bündelt Bonn mit der PLZ 53111 ein dichtes Verkehrsaufkommen aus Berufspendlern, Behördenverkehr und Anschlüssen an die A565. Nach einem unverschuldeten Unfall lohnt sich ein unabhängiger Kfz-Gutachter Bonn, der das Schadensbild zeitnah vor Ort dokumentiert. Wir begutachten nach BVSK-Standard, halten Wertminderung und Reparaturweg neutral fest und arbeiten unabhängig von der gegnerischen Versicherung. Trägt die Gegenseite die Schuld, übernimmt deren Haftpflicht das Honorar, sodass für Sie 0 € anfallen.` },
    { vorort: true, text: `Auch Sankt Augustin und Bornheim liegen in unserem Einzugsgebiet.` },
  ],
  'sankt-augustin': [
    { text: `Sankt Augustin (53757) reiht sich östlich von Bonn in den Rhein-Sieg-Kreis ein und ist über die A560 gut erschlossen. Wer hier nach einem Verkehrsunfall steht, braucht zuerst Klarheit über den tatsächlichen Schaden. Ein unabhängiger Kfz-Sachverständiger Sankt Augustin kommt zur Begutachtung zu Ihnen, erfasst Schadenumfang, Reparaturkosten und Wertminderung und erstellt ein Gutachten nach BVSK-Vorgaben. Bei unverschuldetem Unfall rechnen wir direkt mit der gegnerischen Versicherung ab. Über unser Netzwerk vermitteln wir bei Bedarf einen Anwalt und einen Mietwagen.` },
    { vorort: true, text: `Siegburg und Troisdorf sind nur Minuten entfernt.` },
  ],
  siegburg: [
    { text: `Siegburg mit der PLZ 53721 ist das Verwaltungszentrum des Rhein-Sieg-Kreises und durch Bahn und A3 ein vielbefahrener Knotenpunkt. Genau dort passieren Blechschäden schnell. Statt sich auf die Einschätzung der Gegenseite zu verlassen, sichern Sie Ihre Ansprüche besser mit einem eigenen Kfz-Gutachter Siegburg. Wir kommen kurzfristig zur Vor-Ort-Begutachtung, dokumentieren den Schaden beweissicher und erstellen ein neutrales Gutachten nach BVSK-Standard. War der Unfall unverschuldet, zahlt die gegnerische Haftpflicht das Sachverständigenhonorar.` },
    { vorort: true, text: `Auch in Sankt Augustin und Hennef sind wir für Sie unterwegs.` },
  ],
  troisdorf: [
    { text: `Im Norden des Rhein-Sieg-Kreises gelegen, verbindet Troisdorf (53840) über die A59 den Großraum Köln-Bonn mit dem Umland. Nach einem Unfall zählt zuerst eine ehrliche Schadensaufnahme: Welche Reparatur ist nötig, wie hoch ist die Wertminderung? Ein unabhängiger Kfz-Sachverständiger Troisdorf klärt das vor Ort und unabhängig von der Versicherung der Gegenseite. Das Gutachten folgt BVSK-Standard und dient als belastbare Grundlage für Ihre Forderung. Bei unverschuldetem Unfall entstehen Ihnen keine Kosten, weil die gegnerische Haftpflicht zahlt.` },
    { vorort: true, text: `Siegburg und Hennef liegen in direkter Nachbarschaft.` },
  ],
  koenigswinter: [
    { text: `Königswinter (53639) liegt am rechten Rheinufer am Fuß des Siebengebirges und zieht neben Pendlern auch viel Ausflugsverkehr an. Gerade dort kommt es zu Auffahr- und Parkschäden. Damit Sie nach einem fremdverschuldeten Unfall nicht auf Kosten sitzen bleiben, dokumentiert ein unabhängiger Kfz-Gutachter Königswinter den Schaden direkt bei Ihnen. Wir bewerten Reparaturweg und Wertminderung neutral nach BVSK-Standard und vermitteln über unser Netzwerk bei Bedarf Anwalt und Mietwagen. Die Begutachtung erfolgt zeitnah; das Honorar trägt bei unverschuldetem Unfall die gegnerische Versicherung.` },
    { vorort: true, text: `Bad Honnef und Bonn sind schnell erreicht.` },
  ],
  'bad-honnef': [
    { text: `Ganz im Süden des Rhein-Sieg-Kreises grenzt Bad Honnef (53604) an Rheinland-Pfalz und liegt verkehrsgünstig an der B42 entlang des Rheins. Wer hier in einen unverschuldeten Unfall gerät, sollte den Schaden nicht von der Gegenseite bewerten lassen. Ein unabhängiger Kfz-Sachverständiger Bad Honnef erstellt ein neutrales Gutachten nach BVSK-Standard und sichert so Ihre Ansprüche. Wir kommen zur schnellen Vor-Ort-Begutachtung und rechnen das Honorar direkt mit der gegnerischen Haftpflicht ab, sodass für Sie 0 € bleiben.` },
    { vorort: true, text: `Königswinter ist der nächste Nachbar, Bonn nur eine kurze Fahrt entfernt.` },
  ],
  hennef: [
    { text: `Hennef an der Sieg (53773) erstreckt sich über zahlreiche Ortsteile und ist über die A560 und die Bahnstrecke ins Siegtal angebunden. Nach einem Verkehrsunfall ist die größte Sorge oft, ob die Reparatur fair bewertet wird. Hier hilft ein unabhängiger Kfz-Gutachter Hennef, der vor Ort den Schaden aufnimmt und ein Gutachten nach BVSK-Standard erstellt, völlig unabhängig von der gegnerischen Versicherung. Bei unverschuldetem Unfall übernimmt deren Haftpflicht die Kosten. Über das Netzwerk organisieren wir bei Bedarf Anwalt und Mietwagen.` },
    { vorort: true, text: `Siegburg und Troisdorf gehören zum gleichen Einzugsgebiet.` },
  ],
  bornheim: [
    { text: `Bornheim (53332) liegt westlich des Rheins auf der Vorgebirgsterrasse zwischen Bonn und Köln und ist über die A555 angebunden. Passiert auf dem Weg zur Arbeit ein Auffahrunfall, sollten Sie den Schaden früh und beweissicher festhalten lassen. Ein unabhängiger Kfz-Sachverständiger Bornheim kommt dafür zu Ihnen, erfasst Reparaturkosten und Wertminderung und dokumentiert alles nach BVSK-Standard. War der Unfall unverschuldet, trägt die gegnerische Versicherung das Honorar, für Sie fallen 0 € an.` },
    { vorort: true, text: `Bonn grenzt direkt an, und auch Rheinbach im Süden erreichen wir zügig für eine schnelle Vor-Ort-Begutachtung.` },
  ],
  rheinbach: [
    { text: `Am Rand der Voreifel gelegen, bildet Rheinbach (53359) den südwestlichen Ausläufer des Rhein-Sieg-Kreises und ist über die A61 mit dem Umland verbunden. Nach einem fremdverschuldeten Unfall lohnt sich ein eigenes, neutrales Schadensgutachten statt der Einschätzung der Gegenseite. Ein unabhängiger Kfz-Gutachter Rheinbach nimmt den Schaden vor Ort auf, bewertet Reparaturweg und Wertminderung nach BVSK-Standard und schafft so die Grundlage für Ihre Forderung. Das Honorar zahlt bei unverschuldetem Unfall die gegnerische Haftpflicht.` },
    { vorort: true, text: `Über unser Netzwerk vermitteln wir Anwalt und Mietwagen; Bornheim und Bonn liegen im selben Einzugsgebiet.` },
  ],
  meckenheim: [
    { text: `Meckenheim (53340) liegt in der Voreifel am südwestlichen Rand des Rhein-Sieg-Kreises und ist über das Autobahnkreuz Meckenheim direkt an A61 und A565 angebunden — eine vielbefahrene Pendlerachse Richtung Bonn und Köln. Wer hier in einen unverschuldeten Unfall gerät, sollte den Schaden nicht von der Gegenseite bewerten lassen. Ein unabhängiger Kfz-Sachverständiger Meckenheim kommt zur Vor-Ort-Begutachtung zu Ihnen, erfasst Reparaturkosten und Wertminderung und dokumentiert alles neutral nach BVSK-Standard. War der Unfall unverschuldet, trägt die gegnerische Haftpflicht das Honorar, für Sie bleiben 0 €. Über unser Netzwerk vermitteln wir bei Bedarf Anwalt und Mietwagen.` },
    { vorort: true, text: `Die Ortsteile Merl, Lüftelberg und Ersdorf sowie das benachbarte Rheinbach gehören ebenfalls zu unserem Einzugsgebiet.` },
  ],
}

export function seoBodyFor(slug: string): SeoAbsatz[] {
  return SEO_BODY[slug] ?? []
}

// Per-Stadt-metaHook (Lever 2): kurzer, unique lokaler Aufhaenger fuer die Meta-
// Description (seo.ts) statt des recycelten h1Sub -> killt near-duplicate-Snippets.
// Distilliert aus SEO_BODY, <=40 Z. Fehlt ein Slug -> Fallback auf city.h1Sub.
export const META_HOOKS: Record<string, string> = {
  bonn: 'Ehem. Bundeshauptstadt am Rhein, A565',
  'sankt-augustin': 'Rhein-Sieg östlich Bonn, A560',
  siegburg: 'Verwaltungszentrum Rhein-Sieg, A3',
  troisdorf: 'A59-Korridor Köln-Bonn, Rhein-Sieg',
  koenigswinter: 'Siebengebirge & Rhein-Ausflugsverkehr',
  'bad-honnef': 'Südlichster Rhein-Sieg-Ort, B42',
  hennef: 'An der Sieg, A560 & Siegtalbahn',
  bornheim: 'Vorgebirgsterrasse, A555 Bonn-Köln',
  rheinbach: 'Voreifel-Rand Rhein-Sieg, A61',
  meckenheim: 'A61/A565-Kreuz in der Voreifel',
}
