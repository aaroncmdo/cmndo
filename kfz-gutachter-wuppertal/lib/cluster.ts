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

/** Einzigartiger lokaler SEO-Absatz pro Stadt (gegen Doorway/Duplicate-Content).
 *  Faktisch sicher: echte Nachbarorte/PLZ/Autobahnen, keine erfundenen Stats. */
export const SEO_TEXT: Record<string, string> = {
  wuppertal: 'Mitten im Bergischen Land gelegen, ist Wuppertal (42103) mit seinen engen Tallagen und dem dichten Verkehr entlang der A46 ein anspruchsvolles Pflaster für Autofahrer. Nach einem Unfall verschafft Ihnen ein unabhängiger Kfz-Gutachter in Wuppertal zügig Klarheit über den Schaden. Bei einem unverschuldeten Zusammenstoß übernimmt die gegnerische Versicherung in der Regel die Gutachterkosten, sodass für Sie 0 € bleiben. Wir begutachten Ihr Fahrzeug vor Ort und arbeiten nach DAT- und BVSK-Standard. Auch im benachbarten Solingen und Remscheid sind wir kurzfristig erreichbar.',
  solingen: 'Die Klingenstadt Solingen (42651) liegt im Herzen des Bergischen Landes, zwischen Wuppertal und Remscheid. Wer hier nach einem Verkehrsunfall ein neutrales Schadensgutachten benötigt, sollte auf einen unabhängigen Sachverständigen setzen statt auf den Gutachter der Gegenseite. Als Kfz-Sachverständiger in Solingen dokumentieren wir den Schaden objektiv nach BVSK-Richtlinien und kommen für die Begutachtung zu Ihnen. War der Unfall unverschuldet, trägt die Haftpflicht des Verursachers die Kosten. Bei Bedarf vermitteln wir über unser Netzwerk einen passenden Anwalt sowie einen Mietwagen.',
  velbert: 'Velbert (42549) im nördlichen Bergischen Land ist als Schloss- und Beschlägestadt bekannt und über die A44 gut an das Ruhrgebiet angebunden. Kommt es im Berufsverkehr zu einem Blechschaden, ist eine schnelle, unabhängige Bewertung entscheidend für die Höhe Ihrer Entschädigung. Ein Kfz-Gutachter in Velbert ermittelt Reparaturkosten, Wertminderung und gegebenenfalls den Wiederbeschaffungswert nach anerkanntem Standard. Bei unverschuldetem Unfall rechnen wir direkt mit der gegnerischen Versicherung ab. Termine vereinbaren wir auch kurzfristig in Heiligenhaus oder Wülfrath.',
  heiligenhaus: 'Heiligenhaus (42579) liegt zwischen Velbert und dem Niederbergischen, eingebettet in die hügelige Landschaft des Bergischen Landes. Nach einem Verkehrsunfall lohnt es sich, den Schaden von einem unabhängigen Fachmann statt von der Versicherung des Unfallgegners bewerten zu lassen. Unser Kfz-Sachverständiger in Heiligenhaus erstellt ein neutrales Gutachten und führt die Begutachtung direkt bei Ihnen durch, ob zu Hause oder in der Werkstatt. Bei unverschuldetem Schaden zahlt die Gegenseite, für Sie entstehen 0 €. Anwalt und Mietwagen organisieren wir über unser Partnernetzwerk.',
  wuelfrath: 'Im Kreis Mettmann gelegen, ist Wülfrath (42489) eine ruhige Kalkstadt am Rand des Bergischen Landes. Doch auch hier passieren auf dem Weg nach Velbert oder Mettmann täglich Unfälle. Wer unverschuldet in einen Zusammenstoß gerät, hat das Recht, einen eigenen Gutachter zu beauftragen, dessen Kosten die gegnerische Versicherung trägt. Als unabhängiger Kfz-Gutachter in Wülfrath begutachten wir Ihr Fahrzeug zeitnah vor Ort und dokumentieren den Schaden nach DAT-Standard. So sichern Sie sich eine faire Regulierung und behalten alle Ansprüche im Blick.',
  mettmann: 'Mettmann (40822), Kreisstadt im Neandertal westlich von Wuppertal, ist über die A3 und A44 stark mit dem Verkehr der Region verflochten. Nach einem Auffahrunfall oder Parkrempler brauchen Sie eine belastbare Schadensdokumentation, damit Ihnen kein Geld verloren geht. Ein unabhängiger Kfz-Sachverständiger in Mettmann nimmt den Schaden auf, ermittelt Reparaturkosten und Wertminderung und kommt dafür zu Ihnen. Bei unverschuldetem Unfall übernimmt die Haftpflicht des Verursachers die Gutachterkosten. Auf Wunsch stellen wir den Kontakt zu Anwalt und Mietwagen her, auch für Nachbarorte wie Haan.',
  haan: 'Haan (42781) liegt günstig zwischen Mettmann und Solingen, mit direkter Anbindung an die A46. Wer im dichten Pendlerverkehr unverschuldet einen Unfall erlebt, sollte den Schaden nicht von der Gegenseite kleinrechnen lassen. Unser unabhängiger Kfz-Gutachter in Haan erstellt ein neutrales Gutachten nach BVSK-Standard und führt die Begutachtung schnell vor Ort durch. Die Kosten trägt bei unverschuldetem Schaden die gegnerische Versicherung. Über unser Netzwerk vermitteln wir Ihnen bei Bedarf einen Fachanwalt für Verkehrsrecht sowie einen Ersatzwagen für die Reparaturzeit.',
  schwelm: 'Als Kreisstadt des Ennepe-Ruhr-Kreises liegt Schwelm (58332) am östlichen Übergang des Bergischen Landes, nahe dem Autobahnkreuz Wuppertal-Nord an der A1 und A46. Bei einem Verkehrsunfall ist eine unabhängige Begutachtung der erste Schritt zu einer fairen Entschädigung. Ein Kfz-Sachverständiger in Schwelm dokumentiert den Schaden objektiv und ermittelt alle ersatzfähigen Positionen. War der Unfall unverschuldet, müssen Sie nichts zahlen, das übernimmt die Versicherung des Verursachers. Wir kommen zur Begutachtung vor Ort und sind auch in Ennepetal und Sprockhövel schnell zur Stelle.',
  sprockhoevel: 'Sprockhövel (45549) erstreckt sich am Nordrand des Bergischen Landes im Ennepe-Ruhr-Kreis, zwischen Hattingen und Schwelm. Die ländliche Lage mit vielen Landstraßen birgt eigene Unfallrisiken, gerade bei Wildwechsel oder Glätte. Nach einem unverschuldeten Schaden haben Sie Anspruch auf ein eigenes, neutrales Gutachten, bezahlt von der gegnerischen Haftpflicht. Als unabhängiger Kfz-Gutachter in Sprockhövel begutachten wir Ihr Fahrzeug zeitnah direkt vor Ort und arbeiten nach DAT- und BVSK-Standard. Auf Wunsch organisieren wir zusätzlich Anwalt und Mietwagen über unser Partnernetzwerk.',
  remscheid: 'Remscheid (42853), die Stadt der Werkzeuge, thront auf den Höhen des Bergischen Landes oberhalb von Wuppertal und Solingen. Die hügeligen, kurvenreichen Straßen fordern Fahrer und Fahrzeuge gleichermaßen. Wenn es kracht und Sie keine Schuld tragen, lohnt sich ein unabhängiger Kfz-Sachverständiger in Remscheid, dessen Honorar die gegnerische Versicherung trägt. Wir nehmen den Schaden vor Ort auf, ermitteln Reparaturkosten und Wertminderung und dokumentieren alles nach anerkanntem Standard. So bleiben Ihre Ansprüche gewahrt, und für Sie entstehen bei unverschuldetem Unfall keine Kosten.',
  ennepetal: 'Ennepetal (58256) liegt im Ennepe-Ruhr-Kreis am östlichen Saum des Bergischen Landes, bekannt für die Kluterthöhle und die Nähe zur A1. Passiert auf dem Arbeitsweg ein Unfall, zählt jede objektiv dokumentierte Schadensposition für Ihre Entschädigung. Ein unabhängiger Kfz-Gutachter in Ennepetal begutachtet Ihr Fahrzeug vor Ort und erstellt ein neutrales Gutachten nach BVSK-Richtlinien. Bei unverschuldetem Schaden rechnen wir direkt mit der Versicherung der Gegenseite ab, Sie zahlen 0 €. Termine sind auch im benachbarten Schwelm und Hattingen kurzfristig möglich.',
  hattingen: 'Hattingen (45525) mit seiner historischen Altstadt liegt am nördlichen Rand des Bergischen Landes an der Ruhr, gut erreichbar über die A43. Nach einem Verkehrsunfall sollten Sie den Schaden von einem neutralen Fachmann statt vom Versicherer des Unfallgegners bewerten lassen. Unser Kfz-Sachverständiger in Hattingen kommt zur Begutachtung zu Ihnen und ermittelt Reparaturkosten sowie eine mögliche Wertminderung nach DAT-Standard. War der Unfall unverschuldet, trägt die Gegenseite die Kosten. Bei Bedarf vermitteln wir über unser Netzwerk einen Anwalt für Verkehrsrecht und einen Mietwagen.',
}

export function seoTextFor(slug: string): string {
  return SEO_TEXT[slug] ?? ''
}
