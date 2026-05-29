// Cluster-Konfiguration · DÜSSELDORF (Rheinland) — Klon des Wuppertal-Masters.
// Daten aus preview-complete.html (CLUSTERS.duesseldorf + RESIDENTS).

export interface City {
  slug: string
  name: string
  plz: string
  h1Sub: string
  residents: string
  lat: number
  lng: number
  main?: boolean
}

export interface Brennpunkt {
  name: string
  img: string
  desc: string
}

export interface ClusterConfig {
  key: string
  region: string
  domain: string
  theme: string
  themeColor: string
  imgPath: string
  phone: { display: string; tel: string; wa: string }
  landmark: { label: string; img: string }
  facts: { value: string; label: string; accent?: boolean }[]
  brennpunkte: Brennpunkt[]
  cities: City[]
}

export const CLUSTER: ClusterConfig = {
  key: 'duesseldorf',
  region: 'Rheinland',
  domain: 'kfz-unfallgutachter-duesseldorf.de',
  theme: 'rhein',
  themeColor: '#0B3D6E',
  imgPath: '/assets/img/duesseldorf/',
  phone: { display: '+49 1515 3608515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Rheinturm', img: 'stadt-duesseldorf.png' },
  facts: [
    { value: 'A3', label: 'Hauptachse' },
    { value: 'A46', label: 'Hauptachse' },
    { value: 'A57', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  brennpunkte: [
    { name: 'Berliner Allee', img: 'duesseldorf_berliner-allee.webp', desc: 'Dichter Innenstadtverkehr, viele Spurwechsel — häufig Auffahr- und Abbiegeunfälle.' },
    { name: 'Corneliusstraße', img: 'duesseldorf_corneliusstrasse.webp', desc: 'Stark befahrene Hauptachse mit Straßenbahn — regelmäßig Kollisionen.' },
    { name: 'Ernst-Reuter-Platz', img: 'duesseldorf_ernst-reuter-platz.webp', desc: 'Komplexer Knotenpunkt mit hoher Frequenz — Vorfahrts- und Radverkehrs-Unfälle.' },
  ],
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

export const MAIN_CITY: City = CLUSTER.cities.find((c) => c.main) ?? CLUSTER.cities[0]
export const CITY_SLUGS: string[] = CLUSTER.cities.map((c) => c.slug)
export const SPOKE_SLUGS: string[] = CLUSTER.cities.filter((c) => !c.main).map((c) => c.slug)

export function cityHref(city: City): string {
  return city.main ? '/' : `/lp/${city.slug}`
}
export function getCity(slug: string): City | undefined {
  return CLUSTER.cities.find((c) => c.slug === slug)
}
export function waText(city: City): string {
  return `Hallo, ich hatte einen Unfall in ${city.name} und brauche einen Gutachter.`
}
export function waHref(city: City): string {
  return `https://wa.me/${CLUSTER.phone.wa}?text=${encodeURIComponent(waText(city))}`
}
export function cityNamesList(): string {
  const names = CLUSTER.cities.map((c) => c.name)
  return names.slice(0, -1).join(', ') + ' und ' + names[names.length - 1]
}

/** Einzigartiger lokaler SEO-Absatz pro Stadt (gegen Doorway/Duplicate-Content). */
export const SEO_TEXT: Record<string, string> = {
  duesseldorf: 'Nach einem Verkehrsunfall in Düsseldorf (40210) zählt jede Stunde: Als unabhängiger Kfz-Gutachter vor Ort dokumentieren wir den Schaden zeitnah und neutral nach DAT- und BVSK-Standard. Die Landeshauptstadt im Herzen des Rheinlands ist über die A57, A52 und A46 erreichbar, und auch Anfragen aus den Nachbarorten Neuss und Meerbusch bearbeiten wir kurzfristig. War der Unfall unverschuldet, trägt die gegnerische Versicherung die Kosten des Gutachtens für Sie. Über unser Netzwerk vermitteln wir bei Bedarf zusätzlich einen Anwalt und einen Mietwagen.',
  neuss: 'Auf der linken Rheinseite gelegen, ist Neuss (41460) über die A57 und A46 gut angebunden und damit für unseren Kfz-Sachverständigen schnell erreichbar. Wir kommen zu Ihnen, begutachten das beschädigte Fahrzeug und erstellen ein unabhängiges Gutachten nach BVSK-Richtlinien. Nach einem unverschuldeten Unfall zahlt die Versicherung der Gegenseite, für Sie entstehen 0 Euro. Auch Einsätze in den benachbarten Städten Grevenbroich und Meerbusch koordinieren wir zügig. Bei Bedarf stellen wir über unser Netzwerk Kontakt zu einem Anwalt und einem Mietwagenangebot her.',
  hilden: 'Hilden (40721) liegt verkehrsgünstig im Kreis Mettmann am Autobahnkreuz von A3 und A46. Diese Knotenlage bringt viel Durchgangsverkehr mit sich, und genau hier sind wir als unabhängiger Kfz-Gutachter Hilden für Sie da: schnelle Vor-Ort-Begutachtung, neutrale Bewertung nach DAT- und BVSK-Standard und eine klare Dokumentation für die Schadensregulierung. Bei einem unverschuldeten Unfall übernimmt die gegnerische Versicherung die Gutachterkosten. Anfragen aus Erkrath und Langenfeld bedienen wir ebenso, und über unser Netzwerk vermitteln wir Anwalt sowie Mietwagen.',
  erkrath: 'Direkt östlich von Düsseldorf gelegen, profitiert Erkrath (40699) von der Anbindung an die A3 und die A46. Wenn Ihr Auto nach einem Unfall beschädigt wurde, prüfen wir es als unabhängige Kfz-Sachverständige vor Ort und halten Schadenhöhe sowie Wertminderung nach anerkannten Standards fest. Bei unverschuldeten Unfällen rechnen wir direkt mit der gegnerischen Versicherung ab, sodass für Sie keine Kosten anfallen. Wir sind auch in den Nachbarstädten Hilden und Ratingen tätig. Auf Wunsch organisieren wir über unser Netzwerk anwaltliche Unterstützung und einen Mietwagen.',
  langenfeld: 'Zwischen Düsseldorf und Köln im südlichen Rheinland gelegen, ist Langenfeld (40764) über die A3 und A542 angebunden. Als Kfz-Gutachter Langenfeld kommen wir kurzfristig zu Ihnen, begutachten das Unfallfahrzeug und erstellen ein unabhängiges, gerichtsfestes Gutachten nach DAT-Kalkulation. Nach einem unverschuldeten Unfall trägt die Versicherung des Verursachers sämtliche Kosten, für Sie bleibt es bei 0 Euro. Einsätze in Monheim und Hilden gehören ebenfalls zu unserem Gebiet. Bei Bedarf vermitteln wir über unser Netzwerk einen passenden Anwalt und einen Mietwagen.',
  monheim: 'Am Rhein zwischen Düsseldorf und Leverkusen liegt Monheim (40789), verkehrlich über die A59 und A542 erschlossen. Brauchen Sie nach einem Blechschaden eine neutrale Einschätzung, übernimmt das unser unabhängiger Kfz-Sachverständiger direkt vor Ort, inklusive Fotodokumentation und Bewertung nach BVSK-Standard. Ist die Schuldfrage zu Ihren Gunsten geklärt, zahlt die gegnerische Versicherung das Gutachten. Wir betreuen auch die angrenzenden Städte Langenfeld und Düsseldorf. Über unser Netzwerk stellen wir Ihnen auf Wunsch einen Anwalt sowie einen Mietwagen zur Seite.',
  ratingen: 'Nördlich von Düsseldorf im Kreis Mettmann gelegen, ist Ratingen (40878) über die A3, A44 und A52 hervorragend erreichbar. Diese Lage am Autobahndreieck sorgt für dichten Verkehr, und nach einem Unfall begutachten wir Ihr Fahrzeug als unabhängiger Kfz-Gutachter Ratingen schnell und neutral. Die Bewertung erfolgt nach DAT- und BVSK-Standard, das Ergebnis ist für die Regulierung verwertbar. Bei unverschuldeten Unfällen zahlt die Gegenseite. Auch in Meerbusch und Erkrath sind wir im Einsatz, und über unser Netzwerk vermitteln wir Anwalt und Mietwagen.',
  meerbusch: 'Meerbusch (40667) liegt linksrheinisch zwischen Düsseldorf und Neuss und ist über die A57 und A44 angebunden. Hatten Sie einen Verkehrsunfall, kommt unser unabhängiger Kfz-Sachverständiger zu Ihnen nach Hause oder in die Werkstatt und erstellt zeitnah ein neutrales Gutachten nach anerkannten Standards. Trifft Sie keine Schuld, übernimmt die Versicherung des Unfallgegners die Kosten vollständig. Wir sind ebenso in den Nachbarstädten Ratingen und Neuss unterwegs. Auf Wunsch organisieren wir über unser Netzwerk die passende anwaltliche Begleitung und einen Mietwagen.',
  grevenbroich: 'Im Rhein-Kreis Neuss am westlichen Rand des Rheinlands gelegen, ist Grevenbroich (41515) über die A540 und A46 erschlossen. Nach einem Unfall begutachten wir Ihr beschädigtes Fahrzeug als unabhängiger Kfz-Gutachter Grevenbroich direkt vor Ort und dokumentieren Reparaturkosten und Wertminderung nach DAT- und BVSK-Standard. War der Unfall unverschuldet, rechnen wir mit der gegnerischen Versicherung ab, für Sie entstehen 0 Euro. Wir betreuen auch Neuss und Langenfeld in der Umgebung. Bei Bedarf vermitteln wir über unser Netzwerk einen Anwalt und einen Mietwagen.',
}

export function seoTextFor(slug: string): string {
  return SEO_TEXT[slug] ?? ''
}
