// ============================================================================
// CLUSTER-KONFIG · WUPPERTAL (Bergisches Land)
// ============================================================================
// Re-Skin auf den Koeln-Endstand (08o-08q): Schema + Komponenten aus der
// Koeln-Vorlage, Inhalt/Farbe/Assets bleiben Wuppertal. Einzige Datei mit der
// Cluster-Identitaet (Staedte, Region, Brennpunkte, SEO).
// Theme-Farben: app/globals.css :root (Graphit + Signalrot). themeColor: layout.tsx.
// Bilder: public/assets/img/wuppertal/.
// ============================================================================

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
  /** Pfad relativ zu CLUSTER.imgPath */
  img: string
  desc: string
}

export interface ClusterConfig {
  key: string
  region: string
  /** Region im Dativ ("im Bergischen Land") fuer Ueber-uns-Copy. */
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
  key: 'wuppertal',
  region: 'Bergisches Land',
  regionDative: 'Bergischen Land',
  quellenAnker: 'Polizei-Jahresverkehrsbericht 2025',
  achsen: ['A46', 'A1', 'B7'],
  stadtteile: ['Elberfeld', 'Barmen', 'Heckinghausen', 'Vohwinkel', 'Cronenberg', 'Ronsdorf'],
  domain: 'kfz-unfallgutachter-wuppertal.de',
  theme: 'graphit', // Wuppertal: Graphit/Eisengrau + Signalrot — globals.css :root traegt die Vars
  themeColor: '#2A2E33',
  imgPath: '/assets/img/wuppertal/',
  logoExt: 'svg', // Wuppertal: logo-wuppertal-dark.svg vorhanden — TODO Aaron: logo-wuppertal-white.svg fehlt noch
  assetVersion: '1',
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.',
  teamImg: '/assets/img/wuppertal/team-wuppertal.webp?v=1',
  svName: 'Amet',
  svSurname: 'Egetürk', // Persona-Nachname (Amet Egetürk)
  phone: { display: '+49 1515 3608515', displayNational: '0151 5360 8515', tel: '+4915153608515', wa: '4915153608515' },
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
// rendert (lib/seoVorOrt). Wuppertal-Re-Skin: bestehende kurze Lokal-Texte 1:1
// erhalten, je Stadt in Intro-Absatz + Vor-Ort-Absatz (Nachbarorte) gesplittet.
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
  wuppertal: [
    { text: `Mitten im Bergischen Land gelegen, ist Wuppertal (42103) mit seinen engen Tallagen und dem dichten Verkehr entlang der A46 ein anspruchsvolles Pflaster für Autofahrer. Nach einem Unfall verschafft Ihnen ein unabhängiger Kfz-Gutachter in Wuppertal zügig Klarheit über den Schaden. Bei einem unverschuldeten Zusammenstoß übernimmt die gegnerische Versicherung in der Regel die Gutachterkosten, sodass für Sie 0 € bleiben. Wir begutachten Ihr Fahrzeug vor Ort und arbeiten nach BVSK-Standard.` },
    { vorort: true, text: `Auch im benachbarten Solingen und Remscheid sind wir kurzfristig erreichbar.` },
  ],
  solingen: [
    { text: `Die Klingenstadt Solingen (42651) liegt im Herzen des Bergischen Landes, zwischen Wuppertal und Remscheid. Wer hier nach einem Verkehrsunfall ein neutrales Schadensgutachten benötigt, sollte auf einen unabhängigen Sachverständigen setzen statt auf den Gutachter der Gegenseite. Als Kfz-Sachverständiger in Solingen dokumentieren wir den Schaden objektiv nach BVSK-Richtlinien und kommen für die Begutachtung zu Ihnen. War der Unfall unverschuldet, trägt die Haftpflicht des Verursachers die Kosten.` },
    { vorort: true, text: `Bei Bedarf vermitteln wir über unser Netzwerk einen passenden Anwalt sowie einen Mietwagen.` },
  ],
  velbert: [
    { text: `Velbert (42549) im nördlichen Bergischen Land ist als Schloss- und Beschlägestadt bekannt und über die A44 gut an das Ruhrgebiet angebunden. Kommt es im Berufsverkehr zu einem Blechschaden, ist eine schnelle, unabhängige Bewertung entscheidend für die Höhe Ihrer Entschädigung. Ein Kfz-Gutachter in Velbert ermittelt Reparaturkosten, Wertminderung und gegebenenfalls den Wiederbeschaffungswert nach anerkanntem Standard. Bei unverschuldetem Unfall rechnen wir direkt mit der gegnerischen Versicherung ab.` },
    { vorort: true, text: `Termine vereinbaren wir auch kurzfristig in Heiligenhaus oder Wülfrath.` },
  ],
  heiligenhaus: [
    { text: `Heiligenhaus (42579) liegt zwischen Velbert und dem Niederbergischen, eingebettet in die hügelige Landschaft des Bergischen Landes. Nach einem Verkehrsunfall lohnt es sich, den Schaden von einem unabhängigen Fachmann statt von der Versicherung des Unfallgegners bewerten zu lassen. Unser Kfz-Sachverständiger in Heiligenhaus erstellt ein neutrales Gutachten und führt die Begutachtung direkt bei Ihnen durch, ob zu Hause oder in der Werkstatt. Bei unverschuldetem Schaden zahlt die Gegenseite, für Sie entstehen 0 €.` },
    { vorort: true, text: `Anwalt und Mietwagen organisieren wir über unser Partnernetzwerk.` },
  ],
  wuelfrath: [
    { text: `Im Kreis Mettmann gelegen, ist Wülfrath (42489) eine ruhige Kalkstadt am Rand des Bergischen Landes. Doch auch hier passieren auf dem Weg nach Velbert oder Mettmann täglich Unfälle. Wer unverschuldet in einen Zusammenstoß gerät, hat das Recht, einen eigenen Gutachter zu beauftragen, dessen Kosten die gegnerische Versicherung trägt. Als unabhängiger Kfz-Gutachter in Wülfrath begutachten wir Ihr Fahrzeug zeitnah vor Ort und dokumentieren den Schaden nach BVSK-Standard.` },
    { vorort: true, text: `So sichern Sie sich eine faire Regulierung und behalten alle Ansprüche im Blick.` },
  ],
  mettmann: [
    { text: `Mettmann (40822), Kreisstadt im Neandertal westlich von Wuppertal, ist über die A3 und A44 stark mit dem Verkehr der Region verflochten. Nach einem Auffahrunfall oder Parkrempler brauchen Sie eine belastbare Schadensdokumentation, damit Ihnen kein Geld verloren geht. Ein unabhängiger Kfz-Sachverständiger in Mettmann nimmt den Schaden auf, ermittelt Reparaturkosten und Wertminderung und kommt dafür zu Ihnen. Bei unverschuldetem Unfall übernimmt die Haftpflicht des Verursachers die Gutachterkosten.` },
    { vorort: true, text: `Auf Wunsch stellen wir den Kontakt zu Anwalt und Mietwagen her, auch für Nachbarorte wie Haan.` },
  ],
  haan: [
    { text: `Haan (42781) liegt günstig zwischen Mettmann und Solingen, mit direkter Anbindung an die A46. Wer im dichten Pendlerverkehr unverschuldet einen Unfall erlebt, sollte den Schaden nicht von der Gegenseite kleinrechnen lassen. Unser unabhängiger Kfz-Gutachter in Haan erstellt ein neutrales Gutachten nach BVSK-Standard und führt die Begutachtung schnell vor Ort durch. Die Kosten trägt bei unverschuldetem Schaden die gegnerische Versicherung.` },
    { vorort: true, text: `Über unser Netzwerk vermitteln wir Ihnen bei Bedarf einen Fachanwalt für Verkehrsrecht sowie einen Ersatzwagen für die Reparaturzeit.` },
  ],
  schwelm: [
    { text: `Als Kreisstadt des Ennepe-Ruhr-Kreises liegt Schwelm (58332) am östlichen Übergang des Bergischen Landes, nahe dem Autobahnkreuz Wuppertal-Nord an der A1 und A46. Bei einem Verkehrsunfall ist eine unabhängige Begutachtung der erste Schritt zu einer fairen Entschädigung. Ein Kfz-Sachverständiger in Schwelm dokumentiert den Schaden objektiv und ermittelt alle ersatzfähigen Positionen. War der Unfall unverschuldet, müssen Sie nichts zahlen, das übernimmt die Versicherung des Verursachers.` },
    { vorort: true, text: `Wir kommen zur Begutachtung vor Ort und sind auch in Ennepetal und Sprockhövel schnell zur Stelle.` },
  ],
  sprockhoevel: [
    { text: `Sprockhövel (45549) erstreckt sich am Nordrand des Bergischen Landes im Ennepe-Ruhr-Kreis, zwischen Hattingen und Schwelm. Die ländliche Lage mit vielen Landstraßen birgt eigene Unfallrisiken, gerade bei Wildwechsel oder Glätte. Nach einem unverschuldeten Schaden haben Sie Anspruch auf ein eigenes, neutrales Gutachten, bezahlt von der gegnerischen Haftpflicht. Als unabhängiger Kfz-Gutachter in Sprockhövel begutachten wir Ihr Fahrzeug zeitnah direkt vor Ort und arbeiten nach BVSK-Standard.` },
    { vorort: true, text: `Auf Wunsch organisieren wir zusätzlich Anwalt und Mietwagen über unser Partnernetzwerk.` },
  ],
  remscheid: [
    { text: `Remscheid (42853), die Stadt der Werkzeuge, thront auf den Höhen des Bergischen Landes oberhalb von Wuppertal und Solingen. Die hügeligen, kurvenreichen Straßen fordern Fahrer und Fahrzeuge gleichermaßen. Wenn es kracht und Sie keine Schuld tragen, lohnt sich ein unabhängiger Kfz-Sachverständiger in Remscheid, dessen Honorar die gegnerische Versicherung trägt. Wir nehmen den Schaden vor Ort auf, ermitteln Reparaturkosten und Wertminderung und dokumentieren alles nach anerkanntem Standard.` },
    { vorort: true, text: `So bleiben Ihre Ansprüche gewahrt, und für Sie entstehen bei unverschuldetem Unfall keine Kosten.` },
  ],
  ennepetal: [
    { text: `Ennepetal (58256) liegt im Ennepe-Ruhr-Kreis am östlichen Saum des Bergischen Landes, bekannt für die Kluterthöhle und die Nähe zur A1. Passiert auf dem Arbeitsweg ein Unfall, zählt jede objektiv dokumentierte Schadensposition für Ihre Entschädigung. Ein unabhängiger Kfz-Gutachter in Ennepetal begutachtet Ihr Fahrzeug vor Ort und erstellt ein neutrales Gutachten nach BVSK-Richtlinien. Bei unverschuldetem Schaden rechnen wir direkt mit der Versicherung der Gegenseite ab, Sie zahlen 0 €.` },
    { vorort: true, text: `Termine sind auch im benachbarten Schwelm und Hattingen kurzfristig möglich.` },
  ],
  hattingen: [
    { text: `Hattingen (45525) mit seiner historischen Altstadt liegt am nördlichen Rand des Bergischen Landes an der Ruhr, gut erreichbar über die A43. Nach einem Verkehrsunfall sollten Sie den Schaden von einem neutralen Fachmann statt vom Versicherer des Unfallgegners bewerten lassen. Unser Kfz-Sachverständiger in Hattingen kommt zur Begutachtung zu Ihnen und ermittelt Reparaturkosten sowie eine mögliche Wertminderung nach BVSK-Standard. War der Unfall unverschuldet, trägt die Gegenseite die Kosten.` },
    { vorort: true, text: `Bei Bedarf vermitteln wir über unser Netzwerk einen Anwalt für Verkehrsrecht und einen Mietwagen.` },
  ],
}

export function seoBodyFor(slug: string): SeoAbsatz[] {
  return SEO_BODY[slug] ?? []
}

// Per-Stadt-metaHook (Lever 2): kurzer, unique lokaler Aufhaenger fuer die Meta-
// Description (seo.ts) statt des recycelten h1Sub -> killt near-duplicate-Snippets.
// Distilliert aus SEO_BODY, <=40 Z. Fehlt ein Slug -> Fallback auf city.h1Sub.
export const META_HOOKS: Record<string, string> = {
  wuppertal: 'Tallagen & dichter A46-Verkehr',
  solingen: 'Klingenstadt im Bergischen Land',
  velbert: 'Schloss-/Beschlägestadt an der A44',
  heiligenhaus: 'Niederberg-Lage bei Velbert',
  wuelfrath: 'Kalkstadt am Rand des Bergischen',
  mettmann: 'Kreisstadt im Neandertal, A3 & A44',
  haan: 'Pendlerort Mettmann/Solingen, A46',
  schwelm: 'Am Autobahnkreuz A1/A46',
  sprockhoevel: 'Landstraßen & Wildwechsel, Ennepe-Ruhr',
  remscheid: 'Werkzeugstadt, kurvenreiche Höhen',
  ennepetal: 'Kluterthöhle & A1-Nähe',
  hattingen: 'Historische Altstadt an der Ruhr, A43',
}
