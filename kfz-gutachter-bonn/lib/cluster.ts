// Cluster-Konfiguration · BONN (Rhein-Sieg) — Klon des Wuppertal-Masters.
// Daten aus preview-complete.html (CLUSTERS.bonn + RESIDENTS).

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
  key: 'bonn',
  region: 'Rhein-Sieg',
  domain: 'kfz-unfallgutachter-bonn.de',
  theme: 'nacht',
  themeColor: '#0F1014',
  imgPath: '/assets/img/bonn/',
  phone: { display: '+49 1515 3608515', tel: '+4915153608515', wa: '4915153608515' },
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
  bonn: 'Als ehemalige Bundesstadt am Rhein bündelt Bonn mit der PLZ 53111 ein dichtes Verkehrsaufkommen aus Berufspendlern, Behördenverkehr und Anschlüssen an die A565. Nach einem unverschuldeten Unfall lohnt sich ein unabhängiger Kfz-Gutachter Bonn, der das Schadensbild zeitnah vor Ort dokumentiert. Wir begutachten nach DAT- und BVSK-Standard, halten Wertminderung und Reparaturweg neutral fest und arbeiten unabhängig von der gegnerischen Versicherung. Trägt die Gegenseite die Schuld, übernimmt deren Haftpflicht das Honorar, sodass für Sie 0 € anfallen. Auch Sankt Augustin und Bornheim liegen in unserem Einzugsgebiet.',
  'sankt-augustin': 'Sankt Augustin (53757) reiht sich östlich von Bonn in den Rhein-Sieg-Kreis ein und ist über die A560 gut erschlossen. Wer hier nach einem Verkehrsunfall steht, braucht zuerst Klarheit über den tatsächlichen Schaden. Ein unabhängiger Kfz-Sachverständiger Sankt Augustin kommt zur Begutachtung zu Ihnen, erfasst Schadenumfang, Reparaturkosten und Wertminderung und erstellt ein Gutachten nach DAT- und BVSK-Vorgaben. Bei unverschuldetem Unfall rechnen wir direkt mit der gegnerischen Versicherung ab. Über unser Netzwerk vermitteln wir bei Bedarf einen Anwalt und einen Mietwagen. Siegburg und Troisdorf sind nur Minuten entfernt.',
  siegburg: 'Siegburg mit der PLZ 53721 ist das Verwaltungszentrum des Rhein-Sieg-Kreises und durch Bahn und A3 ein vielbefahrener Knotenpunkt. Genau dort passieren Blechschäden schnell. Statt sich auf die Einschätzung der Gegenseite zu verlassen, sichern Sie Ihre Ansprüche besser mit einem eigenen Kfz-Gutachter Siegburg. Wir kommen kurzfristig zur Vor-Ort-Begutachtung, dokumentieren den Schaden beweissicher und erstellen ein neutrales Gutachten nach DAT- und BVSK-Standard. War der Unfall unverschuldet, zahlt die gegnerische Haftpflicht das Sachverständigenhonorar. Auch in Sankt Augustin und Hennef sind wir für Sie unterwegs.',
  troisdorf: 'Im Norden des Rhein-Sieg-Kreises gelegen, verbindet Troisdorf (53840) über die A59 den Großraum Köln-Bonn mit dem Umland. Nach einem Unfall zählt zuerst eine ehrliche Schadensaufnahme: Welche Reparatur ist nötig, wie hoch ist die Wertminderung? Ein unabhängiger Kfz-Sachverständiger Troisdorf klärt das vor Ort und unabhängig von der Versicherung der Gegenseite. Das Gutachten folgt DAT- und BVSK-Standard und dient als belastbare Grundlage für Ihre Forderung. Bei unverschuldetem Unfall entstehen Ihnen keine Kosten, weil die gegnerische Haftpflicht zahlt. Siegburg und Hennef liegen in direkter Nachbarschaft.',
  koenigswinter: 'Königswinter (53639) liegt am rechten Rheinufer am Fuß des Siebengebirges und zieht neben Pendlern auch viel Ausflugsverkehr an. Gerade dort kommt es zu Auffahr- und Parkschäden. Damit Sie nach einem fremdverschuldeten Unfall nicht auf Kosten sitzen bleiben, dokumentiert ein unabhängiger Kfz-Gutachter Königswinter den Schaden direkt bei Ihnen. Wir bewerten Reparaturweg und Wertminderung neutral nach DAT- und BVSK-Standard und vermitteln über unser Netzwerk bei Bedarf Anwalt und Mietwagen. Die Begutachtung erfolgt zeitnah; das Honorar trägt bei unverschuldetem Unfall die gegnerische Versicherung. Bad Honnef und Bonn sind schnell erreicht.',
  'bad-honnef': 'Ganz im Süden des Rhein-Sieg-Kreises grenzt Bad Honnef (53604) an Rheinland-Pfalz und liegt verkehrsgünstig an der B42 entlang des Rheins. Wer hier in einen unverschuldeten Unfall gerät, sollte den Schaden nicht von der Gegenseite bewerten lassen. Ein unabhängiger Kfz-Sachverständiger Bad Honnef erstellt ein neutrales Gutachten nach DAT- und BVSK-Standard und sichert so Ihre Ansprüche. Wir kommen zur schnellen Vor-Ort-Begutachtung und rechnen das Honorar direkt mit der gegnerischen Haftpflicht ab, sodass für Sie 0 € bleiben. Königswinter ist der nächste Nachbar, Bonn nur eine kurze Fahrt entfernt.',
  hennef: 'Hennef an der Sieg (53773) erstreckt sich über zahlreiche Ortsteile und ist über die A560 und die Bahnstrecke ins Siegtal angebunden. Nach einem Verkehrsunfall ist die größte Sorge oft, ob die Reparatur fair bewertet wird. Hier hilft ein unabhängiger Kfz-Gutachter Hennef, der vor Ort den Schaden aufnimmt und ein Gutachten nach DAT- und BVSK-Standard erstellt, völlig unabhängig von der gegnerischen Versicherung. Bei unverschuldetem Unfall übernimmt deren Haftpflicht die Kosten. Über das Netzwerk organisieren wir bei Bedarf Anwalt und Mietwagen. Siegburg und Troisdorf gehören zum gleichen Einzugsgebiet.',
  bornheim: 'Bornheim (53332) liegt westlich des Rheins auf der Vorgebirgsterrasse zwischen Bonn und Köln und ist über die A555 angebunden. Passiert auf dem Weg zur Arbeit ein Auffahrunfall, sollten Sie den Schaden früh und beweissicher festhalten lassen. Ein unabhängiger Kfz-Sachverständiger Bornheim kommt dafür zu Ihnen, erfasst Reparaturkosten und Wertminderung und dokumentiert alles nach DAT- und BVSK-Standard. War der Unfall unverschuldet, trägt die gegnerische Versicherung das Honorar, für Sie fallen 0 € an. Bonn grenzt direkt an, und auch Rheinbach im Süden erreichen wir zügig für eine schnelle Vor-Ort-Begutachtung.',
  rheinbach: 'Am Rand der Voreifel gelegen, bildet Rheinbach (53359) den südwestlichen Ausläufer des Rhein-Sieg-Kreises und ist über die A61 mit dem Umland verbunden. Nach einem fremdverschuldeten Unfall lohnt sich ein eigenes, neutrales Schadensgutachten statt der Einschätzung der Gegenseite. Ein unabhängiger Kfz-Gutachter Rheinbach nimmt den Schaden vor Ort auf, bewertet Reparaturweg und Wertminderung nach DAT- und BVSK-Standard und schafft so die Grundlage für Ihre Forderung. Das Honorar zahlt bei unverschuldetem Unfall die gegnerische Haftpflicht. Über unser Netzwerk vermitteln wir Anwalt und Mietwagen; Bornheim und Bonn liegen im selben Einzugsgebiet.',
}

export function seoTextFor(slug: string): string {
  return SEO_TEXT[slug] ?? ''
}
