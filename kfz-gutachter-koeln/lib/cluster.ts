// ============================================================================
// CLUSTER-VORLAGE · KÖLN (Rheinland)  —  Abgabe für Nicolas (09.06.2026)
// ============================================================================
// Das ist die EINZIGE Datei, in der die Cluster-Identität lebt. Alle Komponenten,
// SEO, Hub (/) und Spokes (/lp/<slug>) werden aus dieser Datei generiert.
//
// NICOLAS — DU FÜLLST DEN INHALT. Die Struktur steht. Such nach `TODO Nicolas`.
// Pro neuem Cluster nur 4 Stellen anpassen (Details in HANDOFF.md):
//   1) diese Datei (lib/cluster.ts)  — Städte, Region, Brennpunkte, SEO-Texte
//   2) app/globals.css  — :root Cluster-Vars (Theme-Farben)
//   3) app/layout.tsx   — themeColor (muss zu globals.css passen)
//   4) public/assets/img/koeln/  — echte Bilder (ersetzen die Platzhalter)
//
// Bilder rendern lokal als PLATZHALTER (grau, beschriftet) — echte Assets liefert
// Aaron beim Paste-back nach. Die Bild-DATEINAMEN unten sind verbindlich (die
// Komponenten erwarten genau diese Pfade) — beim Tauschen die Namen beibehalten.
// ============================================================================

export interface City {
  slug: string
  name: string
  plz: string
  /** H1-Untertitel (SEO-Variation pro Stadt). */
  h1Sub: string
  /** Einwohner-Bezeichnung ("Kölner") fuer Reviews-Headline. */
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
  /** Dateiendung der Logo-Varianten logo-{key}-dark/-white (BRIEF 08d: Aachen hat echte Vektor-SVGs, Koeln PNG). */
  logoExt: 'png' | 'svg'
  /** 08m A6 · Cache-Busting: bei INHALTS-Tausch eines Assets (gleicher Dateiname)
   *  hochzaehlen — haengt als ?v=… an Hero-/Logo-/Team-Referenzen (Komponenten +
   *  die beiden image-set-Vars in globals.css manuell mitziehen!). */
  assetVersion: string
  /** H1-Sub-Span im Hero (NUR Desktop lg:+, Action 0 P2). Copy FINAL von Aaron 10.06. — Code formuliert nichts selbst. */
  h1SubSpan: string
  /** Team-Foto (Netzwerk-Mobile Team-Hero-Card). */
  teamImg: string
  /** Vorname des lokalen SV (CTA-Rolle + Ueber-uns). */
  svName: string
  /** Nachname des lokalen SV (Person-Schema / formale Nennung). */
  svSurname: string
  phone: {
    display: string
    /** National formatiertes CTA-Label (Mock Z.4295, 08e A2) — href/tel bleibt international. */
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
  key: 'koeln',
  region: 'Rheinland',
  regionDative: 'Rheinland',
  quellenAnker: 'Verkehrsbericht der Polizei Köln 2024 + ADAC Stau-Statistik 2025',
  achsen: ['A1', 'A3', 'A4', 'A57'], // TODO Nicolas: relevante Achsen bestaetigen
  stadtteile: ['Innenstadt', 'Ehrenfeld', 'Nippes', 'Mülheim', 'Lindenthal', 'Kalk', 'Porz', 'Chorweiler'],
  domain: 'kfz-unfallgutachter-koeln.de',
  theme: 'graphit', // Köln-Cluster: Graphit/Anthrazit — globals.css :root traegt die Vars
  themeColor: '#2A2E33', // Köln-Cluster: graphit (matched globals.css :root --petrol / Brand-Primary)
  imgPath: '/assets/img/koeln/',
  logoExt: 'png',
  assetVersion: '2', // 08m: q90-Heros + neue 08h-Assets
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.', // 08n N1: Geo-Schwanz raus (Aaron)
  teamImg: '/assets/img/koeln/team-koeln.webp?v=2',
  svName: 'Stefan', // Köln-Cluster Persona (Vorname — CTA/Ueber-uns) — Aaron-Vorgabe 2026-06-09
  svSurname: 'Wagner', // Köln-Cluster Persona (Nachname — Person-Schema) — Aaron-Vorgabe 2026-06-09
  // Telefon einheitlich ueber alle Cluster (Aaron-Vorgabe Mobil). Bei eigener Nummer hier aendern.
  phone: { display: '+49 1515 3608515', displayNational: '0151 5360 8515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Kölner Dom', img: 'stadt-koeln.png' }, // TODO Nicolas: Wahrzeichen-Bild
  facts: [
    { value: 'A1', label: 'Hauptachse' },
    { value: 'A3', label: 'Hauptachse' },
    { value: 'A4', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  // Verkehrsschwerpunkte Köln-Hub — lokal verankert, keine erfundenen Stats (Quellen s. quellenAnker).
  brennpunkte: [
    {
      name: 'Kölner Ring',
      img: 'koeln_ring.webp',
      desc: 'Der Kölner Autobahnring (A 1, A 3, A 4) ist eine der meistbefahrenen Strecken in NRW. Besonders das Heumarer Dreieck (A 3/A 4) und das Kreuz Köln-West (A 1/A 4) zählen zu den staureichsten Knotenpunkten Deutschlands. Auffahrunfälle bei Stop-and-Go und Spurwechsel-Kollisionen prägen das Schadensbild. Wir sind bei Bedarf binnen 60 Minuten vor Ort.',
    },
    {
      name: 'Zoobrücke',
      img: 'koeln_zoobruecke.webp',
      desc: 'Die Zoobrücke verbindet Riehl mit Deutz und ist eine der wichtigsten Rhein-Querungen für den Berufsverkehr. Bei Sanierungsarbeiten oder Hochwasser wird die Brücke regelmäßig eingeschränkt — Umleitungen über die Mülheimer und Severinsbrücke führen zu Stau und Auffahrunfällen. Schäden am Anhängerbetrieb oder Aufprallschäden aus dem stockenden Verkehr begutachten wir vor Ort in Deutz oder Riehl.',
    },
    {
      name: 'Barbarossaplatz',
      img: 'koeln_barbarossaplatz.webp',
      desc: 'Der Barbarossaplatz ist einer der zentralen Verkehrsknotenpunkte der Kölner Innenstadt — KVB-Linien, Bus, Rad- und Autoverkehr treffen hier auf engstem Raum. Häufig kommt es zu Tür-Öffner-Schäden, Park-Rempler und Kollisionen mit dem ÖPNV. Wir kennen die Schadenslage in den umliegenden Vierteln Neustadt-Süd, Rathenauplatz und Zülpicher Viertel.',
    },
  ],
  // Hub = Köln (main:true). Spokes = die uebrigen. TODO Nicolas: Stadt-Liste finalisieren
  // (echte Nachbarorte mit PLZ/Koordinaten; h1Sub als SEO-Variation pro Stadt).
  cities: [
    { slug: 'koeln',             name: 'Köln',              plz: '50667', main: true, h1Sub: 'unabhängiger Sachverständiger',                  residents: 'Kölner',             lat: 50.9375, lng: 6.9603 },
    { slug: 'leverkusen',        name: 'Leverkusen',        plz: '51373',             h1Sub: 'Kfz-Sachverständiger Rheinland',                  residents: 'Leverkusener',       lat: 51.0459, lng: 6.9853 },
    { slug: 'bergisch-gladbach', name: 'Bergisch Gladbach', plz: '51465',             h1Sub: 'Kfz-Sachverständiger Rheinisch-Bergischer Kreis', residents: 'Bergisch Gladbacher', lat: 50.9925, lng: 7.1283 },
    { slug: 'huerth',            name: 'Hürth',             plz: '50354',             h1Sub: 'unabhängiger Unfallgutachter',                    residents: 'Hürther',            lat: 50.8773, lng: 6.8763 },
    { slug: 'frechen',           name: 'Frechen',           plz: '50226',             h1Sub: 'Kfz-Sachverständiger Rhein-Erft-Kreis',           residents: 'Frechener',          lat: 50.9105, lng: 6.8125 },
    { slug: 'pulheim',           name: 'Pulheim',           plz: '50259',             h1Sub: 'Kfz-Sachverständiger Rhein-Erft-Kreis',           residents: 'Pulheimer',          lat: 50.9999, lng: 6.8038 },
    { slug: 'bruehl',            name: 'Brühl',             plz: '50321',             h1Sub: 'unabhängiger Schadengutachter',                   residents: 'Brühler',            lat: 50.8268, lng: 6.9056 },
    { slug: 'wesseling',         name: 'Wesseling',         plz: '50389',             h1Sub: 'Kfz-Sachverständiger Rhein-Erft-Kreis',           residents: 'Wesselinger',        lat: 50.8289, lng: 6.9747 },
    { slug: 'kerpen',            name: 'Kerpen',            plz: '50171',             h1Sub: 'Kfz-Sachverständiger Rhein-Erft-Kreis',           residents: 'Kerpener',           lat: 50.8703, lng: 6.6962 },
    { slug: 'erftstadt',         name: 'Erftstadt',         plz: '50374',             h1Sub: 'Kfz-Sachverständiger Rhein-Erft-Kreis',           residents: 'Erftstädter',        lat: 50.8154, lng: 6.7686 },
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

// TODO Nicolas: pro Stadt einen EINZIGARTIGEN lokalen SEO-Absatz (gegen Duplicate-/
// Doorway-Content) — echte Nachbarorte, PLZ, Autobahnen; KEINE erfundenen Statistiken.
// Muster + Tonfall: siehe Wuppertal-Cluster (5-6 Saetze, lokal verankert). Die Platzhalter
// unten rendern bereits, damit der Local-Build vollstaendig aussieht.
// ── SEO-Body (08o O6: strukturierte Absaetze statt Fliesstext) ───────────────
// H3s sind EDITORIAL an ihre Absaetze gebunden (kein Trigger-Katalog mehr —
// Fehlgriff-Klasse N9/O6). `vorort: true` markiert den Absatz, der in der
// Einsatzgebiet-Lokalstrecke rendert (lib/seoVorOrt); `liste` rendert als
// kompakte Leistungs-Liste. Lokale Fakten (Strassen, Bruecken, Stadtteile)
// sind der Ranking-Kern — beim Straffen unangetastet.
export interface SeoAbsatz {
  /** Editorial gebundene Zwischenueberschrift — stellt die Frage, die der Absatz beantwortet. */
  h3?: string
  text: string
  /** Kompakte Leistungs-Liste nach dem Text. */
  liste?: string[]
  /** Rendert in der Einsatzgebiet-Lokalstrecke ("Vor Ort"), nicht im SeoBody. */
  vorort?: boolean
}

// Leistungs-Kern (identisch je Stadt — die Uniqueness tragen die lokalen Absaetze).
const LEISTUNGS_LISTE = [
  'Lackmessung & Strukturschäden-Prüfung',
  'Foto- und Maß-Dokumentation',
  'Reparaturkosten nach marktübliche Kalkulation',
  'Wertminderung (merkantiler Minderwert)',
  'Restwert nach belastbaren Marktdaten',
  'Gutachten binnen 48 Stunden',
]

export const SEO_BODY: Record<string, SeoAbsatz[]> = {
  koeln: [
    { text: `Ein Unfall in Köln passiert schnell — am Heumarer Dreieck, auf der Zoobrücke, im Stop-and-Go auf der A 1. Wenn Sie unverschuldet beteiligt sind, brauchen Sie einen neutralen Kfz-Gutachter, der gerichtsfest dokumentiert. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten bei Ihnen — in Ehrenfeld, Nippes, Mülheim oder Porz. 0 € für Sie: Die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Köln denkt in Stadtteilen — und jeder hat seine eigene Schadensdynamik. In der Innenstadt um Barbarossaplatz und Rudolfplatz und im Belgischen Viertel dominieren Park-Rempler, Tür-Öffner-Schäden und Konflikte mit KVB-Trams. Auf den Ringen und am Heumarer Dreieck sind es Auffahrunfälle aus zähem Verkehr, in Lindenthal, Sülz und Klettenberg Schäden vor Schulen und Kitas, in Mülheim und Kalk Lieferverkehr auf engen Achsen. Unsere Sachverständigen kennen diese Strecken aus dem Tagesgeschäft.` },
    { h3: 'Woran erkennen Sie einen guten Kfz-Gutachter in Köln?', text: `An drei Dingen: Neutralität, Geschwindigkeit, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard — das Gutachten geht binnen 48 Stunden an Sie, Ihre Kanzlei oder direkt an die gegnerische Versicherung. Zum Standard gehören:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es in Köln am häufigsten?', text: `Der Kölner Autobahnring mit A 1, A 3 und A 4 zählt zu den staureichsten Strecken in NRW — das Heumarer Dreieck und das Kreuz Köln-West sind klassische Auffahrunfall-Stellen. Zoobrücke, Mülheimer Brücke und Severinsbrücke werden zu Engstellen, sobald Sanierungen oder Hochwasser den Verkehr ausbremsen. An Innenstadt-Knoten wie Barbarossaplatz und Friesenplatz treffen Auto, Fahrrad und Tram aufeinander — hier braucht es ein genaues Schadensbild, damit die Haftung sauber zugeordnet wird.` },
    { h3: 'Was tun, wenn die Versicherung kürzt?', text: `Kürzt die Versicherung des Unfallverursachers Ihre Schadenshöhe, haben Sie das Recht auf ein Gegengutachten — auch das übernimmt die Versicherung. Wir und das Claimondo-Partnernetzwerk prüfen den Erstbericht und dokumentieren strittige Positionen: bei Karosserieschäden ebenso wie bei Wertminderung junger Fahrzeuge, Hagel- und Totalschäden.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie — das ist Ihr Recht nach BGH-Rechtsprechung. Wir arbeiten mit Werkstätten in ganz Köln zusammen, vom freien Karosseriefachbetrieb in Mülheim bis zur Markenwerkstatt in Lindenthal, und vermitteln auf Wunsch einen Betrieb, der mit dem gerichtsfesten Gutachten abrechnet — ohne Vorgaben der gegnerischen Versicherung.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Sie melden sich telefonisch oder über WhatsApp. 2) Der Sachverständige dokumentiert vor Ort. 3) Sie erhalten das Gutachten binnen 48 Stunden — die Regulierung läuft parallel, auf Wunsch mit Anwalt, Werkstatt und Mietwagen aus dem Netzwerk. Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Köln — neutral, gerichtsfest, schnell vor Ort. Rufen Sie an oder schreiben Sie über WhatsApp: In 5 Minuten ist geklärt, ob ein Sachverständiger sinnvoll ist und wie es weitergeht.` },
  ],
  leverkusen: [
    { text: `Leverkusen — Bayer-Stadt am Rhein, geprägt vom Chempark Wiesdorf, der BayArena und der berüchtigten A 1 Leverkusener Brücke. Die A 3 quillt im Berufsverkehr über, das Bayer-Kreuz (A 1/A 3/A 59) zählt zu den staureichsten Stellen in NRW. Unser Kfz-Gutachter ist meist binnen 60 Minuten in Wiesdorf, Opladen, Schlebusch, Steinbüchel oder Hitdorf. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Leverkusens Stadtteile bringen ihre eigene Schadensdynamik mit: Wiesdorf mit dem Chempark hat hohen Industrie- und Pendlerverkehr — Auffahrunfälle und Spurwechsel-Kollisionen prägen das Bild. In Opladen, dem historischen Bahnhofs-Zentrum, dominieren Park-Rempler und Fußgänger-Konflikte. In Schlebusch steigt das Unfallrisiko an BayArena-Spieltagen spürbar. Steinbüchel, Lützenkirchen und Hitdorf am Rhein sind Wohngebiete mit Tür-Öffner-Schäden und Vorfahrt-Konflikten vor Kindergärten und Schulen.` },
    { h3: 'Welche Rechte haben Sie nach einem unverschuldeten Unfall?', text: `Sie wählen den Kfz-Gutachter selbst — nicht die gegnerische Versicherung. Wir arbeiten nach BVSK-Standard und dokumentieren gerichtsfest, von der Bumper-Delle bis zum Strukturschaden:`, liste: LEISTUNGS_LISTE },
    { h3: 'Leverkusener Brücke und Bayer-Kreuz: Warum gerade hier?', text: `Die jahrelange Sanierung der A 1 Leverkusener Brücke und die Lkw-Sperrung haben den Verkehr verändert — mit spürbar mehr Auffahrunfällen und Stop-and-Go-Kollisionen auf den Umleitungsstrecken. Am Bayer-Kreuz sind es die engen Verflechtungen zwischen A 1 und A 59, an denen Spurwechsel regelmäßig schiefgehen. Der Sachverständige kennt beide Strecken und kommt direkt.` },
    { h3: 'Warum nicht der Gutachter der Versicherung?', text: `Der von der gegnerischen Versicherung beauftragte Gutachter arbeitet in deren Auftrag — nicht in Ihrem. Sie haben das Recht auf einen unabhängigen Sachverständigen, der ausschließlich für Sie dokumentiert. Kürzt die Versicherung, erstellen wir auf Wunsch ein Gegengutachten — auch das wird übernommen, inklusive Vermittlung von Anwalt, Mietwagen und Werkstatt.` },
    { h3: 'Welche Werkstatt darf reparieren?', text: `Die, die Sie wählen — freier Fachbetrieb in Wiesdorf, Markenwerkstatt in Opladen oder Karosseriespezialist in Schlebusch. Wir vermitteln verlässliche Partner in der Region; das gerichtsfeste Gutachten ist die Abrechnungsbasis.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Leverkusen — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, ob ein Sachverständiger sinnvoll ist und wie es weitergeht.` },
  ],
  'bergisch-gladbach': [
    { text: `Bergisch Gladbach ist mit 111.000 Einwohnern die größte Stadt im Rheinisch-Bergischen Kreis — und ein unterschätzter Schadens-Hotspot: A 4 Bensberg Richtung Olpe, A 3 Königsforst Richtung Köln, dazu Wildunfälle am Übergang ins Bergische Land. Unser Kfz-Gutachter ist meist binnen 60 Minuten in Bensberg, Refrath, Schildgen, Heidkamp, Hand oder Sand. 0 € für Sie — die gegnerische Versicherung trägt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Die Stadtteile haben ihren eigenen Schadens-Charakter: Bensberg mit Schloss und Altstadtgassen ist Park-Rempler-Schwerpunkt, Refrath hat mit BTC-Forschungsstandort und A 4-Anschluss hohen Pendlerverkehr. Schildgen und Heidkamp sind ruhigere Wohnlagen, aber Pendlerorte. Hand, Sand und Asselborn liegen am Übergang ins Bergische Land — hier sind Wildunfälle in der Dämmerung deutlich häufiger, als viele denken.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, lokale Erfahrung, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard und dokumentieren unabhängig:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wildunfall im Bergischen: Was muss dokumentiert werden?', text: `Zwischen Sand und dem Königsforst sind Wildunfälle häufig — und die Abwicklung steht und fällt mit der Schadensspur: Wildhärchen, Blutspuren, Aufprallpunkt und Lackabrieb müssen sauber aufgenommen werden, damit Haftpflicht- oder Teilkaskoabwicklung durchlaufen. Auch an den A 4-Anschlussstellen Bensberg und Refrath — Auffahrunfall-Hotspots im Berufsverkehr Richtung Köln — gilt: Sie haben das Recht auf einen eigenen Sachverständigen, nicht den der gegnerischen Versicherung.` },
    { h3: 'Totalschaden oder 130-Prozent-Reparatur?', text: `Bei älteren Fahrzeugen wird es kritisch, wenn die Reparaturkosten den Wiederbeschaffungswert übersteigen — dann entscheidet sich, ob fiktive Abrechnung oder die 130-Prozent-Regelung möglich ist. Der Sachverständige kennt die Rechtsprechung und dokumentiert so, dass Sie alle Optionen behalten; bei Wertminderung junger Fahrzeuge zählt die saubere Berechnung.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie — freier Fachbetrieb oder Markenwerkstatt, das ist Ihr Recht. Wir vermitteln verlässliche Partner in Bensberg, Refrath oder Heidkamp, ohne Bindung an die Empfehlung der Versicherung.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Der Sachverständige kommt vor Ort, alle Stadtteile inklusive Bensberg und Refrath. 3) Gutachten in 48 Stunden — die Versicherungsabwicklung läuft parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Bergisch Gladbach — neutral, gerichtsfest, schnell vor Ort. Rufen Sie an oder schreiben Sie über WhatsApp, und wir klären in 5 Minuten, wie es weitergeht.` },
  ],
  pulheim: [
    { text: `Pulheim, nordwestlich von Köln, ist Pendlerstadt par excellence: A 1 Pulheim-Brauweiler, A 57 Köln-Krefeld und B 59 Aachener Straße bringen täglich Tausende nach Köln und Bergheim. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Pulheim-Mitte, Brauweiler, Stommeln, Sinnersdorf oder Geyen. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Fünf Stadtteile, fünf Schadens-Profile: Pulheim-Mitte als Verwaltungs- und Einkaufskern hat Park-Rempler am Marktplatz, Brauweiler mit der Abtei ist touristisch geprägt und zugleich A 1-Pendlergebiet. Stommeln ist Wohngebiet mit Bahnhof; Sinnersdorf und Geyen sind ländlicher — von Wildunfällen bis zu Staus auf der B 59 reicht dort das Spektrum. Am Industriepark Pulheim-Bornheim wächst der Flotten- und Berufsverkehr seit Jahren.` },
    { h3: 'Welche Rechte haben Sie bei der Gutachter-Wahl?', text: `Sie wählen den Sachverständigen selbst — nicht die gegnerische Versicherung. Wir arbeiten nach BVSK-Standard, ausschließlich in Ihrem Interesse:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo passiert es in Pulheim am häufigsten?', text: `An der A 1-Anbindung Brauweiler kreuzen sich Pendler aus Bergheim und Köln — klassische Auffahrunfälle im Stop-and-Go. Dazu kommen Park-Rempler vor der Abtei Brauweiler an starken Wochenenden und Tür-Öffner-Schäden vor Kindergärten und Schulen im Wohngebiet Stommeln-Pesch. Kürzt die Versicherung, erstellen wir auf Wunsch ein Gegengutachten — ebenfalls auf Kosten der Gegenseite.` },
    { h3: 'Mietwagen und Nutzungsausfall: Was steht Ihnen zu?', text: `Während der Reparaturzeit haben Sie Anspruch auf einen gleichwertigen Mietwagen oder Nutzungsausfallentschädigung — und auch die Anwaltskosten trägt die gegnerische Versicherung. Wir und das Claimondo-Partnernetzwerk regeln beides mit, inklusive Verkehrsrechtsanwalt aus dem Netzwerk.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Der Sachverständige kennt verlässliche Partner in Pulheim-Mitte, Brauweiler und Stommeln — vom Karosseriefachbetrieb bis zur Lackiererei. Die Werkstatt rechnet auf Basis des Gutachtens ab, die Reparatur erfolgt fachgerecht nach BVSK-Standard.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Pulheim — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  bruehl: [
    { text: `Brühl hat zwei Gesichter: das UNESCO-Welterbe Schloss Augustusburg mit gediegenem Stadtkern — und das Phantasialand mit über 5 Millionen Besuchern pro Jahr. Dazu die A 553 Richtung Köln-Süden und die A 555 Richtung Bonn. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Brühl-Mitte, Vochem, Pingsdorf, Heide oder Schwadorf. 0 € für Sie — die gegnerische Versicherung trägt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Brühls Schadensdynamik heißt Tourismus: An starken Wochenenden steigen die Park-Rempler am Phantasialand-Parkplatz deutlich, ebenso die Schäden in den engen Altstadtgassen rund ums Schloss, wo Auswärtige rangieren. Pingsdorf im Süden ist ein eigenes Kapitel — Anhänger-, Wohnmobil- und Anfahrtsschäden auf den Parkplätzen gehören dort zu den häufigsten Anfragen.` },
    { h3: 'Was leistet das Gutachten?', text: `Wir arbeiten nach BVSK-Standard und dokumentieren gerichtsfest — auf Wunsch übernimmt der Verkehrsrechtsanwalt aus dem Claimondo-Netzwerk das komplette Abwicklungsmandat:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Brühl?', text: `Die A 553 ist als Hauptzubringer nach Köln-Süden im Berufsverkehr regelmäßig Stop-and-Go — klassische Auffahrunfall-Strecke. Auf der A 555 Richtung Bonn häufen sich Spurwechsel-Kollisionen in Sanierungsphasen, innerstädtisch trägt die B 51 Bonner Straße den Pendlerverkehr zwischen Köln und Bonn.` },
    { h3: 'Park-Rempler mit Fahrerflucht: Welche Optionen bleiben?', text: `Gerade am Phantasialand-Parkplatz kommt es vor, dass der Verursacher nicht greifbar ist — dann geht es um Vollkasko oder Verkehrsopferhilfe. Der Sachverständige dokumentiert mit klarer Foto-Spur so, dass alle Optionen offen bleiben; stellt sich die eigene Vollkasko quer, hilft ein Gegengutachten.` },
    { h3: 'Unfall mit ausländischer Beteiligung — was nun?', text: `Im Phantasialand-Verkehr nicht selten: Über die Grüne Karte und den Zentralruf der Autoversicherer lässt sich der Schaden auch mit nicht-deutschen Beteiligten abwickeln. Wir und das Claimondo-Netzwerk kennen die Wege und übernehmen die Abwicklung mit ausländischen Versicherern.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie — Markenwerkstatt oder freier Fachbetrieb. Wir vermitteln verlässliche Karosserie- und Lackbetriebe in Brühl-Mitte, Vochem oder Pingsdorf; das gerichtsfeste Gutachten ist die Abrechnungsbasis.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Telefon oder WhatsApp. 2) Der Sachverständige kommt vor Ort, alle Stadtteile inklusive Pingsdorf und Heide. 3) Gutachten in 48 Stunden — Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Brühl — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  frechen: [
    { text: `Frechen, westlich von Köln direkt an der A 4, ist seit Jahrhunderten Steinzeug- und Keramikstadt — und Pendlerstadt mit Anschluss an Köln und Aachen. Ob A 4 bei Frechen-Königsdorf, B 264 Aachener Straße oder Industriepark: Unser Kfz-Gutachter ist meist binnen 60 Minuten bei Ihnen. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Vier Stadtteile, vier Profile: Frechen-Mitte hat Park-Rempler am Marktplatz und an der Hauptstraße, Königsdorf im Nordosten ist Wohn- und Gewerbe-Mix mit direkter A 4-Anbindung und klassischem Berufsverkehr-Schaden. Habbelrath und Bachem sind ländlicher, von Industrieparks durchsetzt — dort kommen Flotten- und Lkw-Schäden hinzu.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, lokale Erfahrung, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo passiert es rund um Frechen?', text: `Die A 4 Frechen-Königsdorf ist Hauptzubringer nach Köln und Aachen — hohes Pendleraufkommen, klassisches Auffahrunfall-Profil im Berufsverkehr. Die B 264 Aachener Straße trägt den Lieferverkehr durch die Innenstadt, im Industriepark Frechen-Königsdorf dominieren Logistikverkehr, Streifschäden und Lkw-Pkw-Konflikte. Kürzt die Versicherung die Reparaturkosten, erstellen wir ein Gegengutachten — auch das übernimmt die Gegenseite.` },
    { h3: 'Firmen- und Flottenfahrzeuge: Was ist anders?', text: `Die Keramik-Industrie hat viele Flottenbetriebe etabliert. Bei Firmenfahrzeugen dokumentieren wir so, dass Firmenversicherung und gegnerische Haftpflicht sauber abrechnen können — bei Mietfahrzeugen ist die Dokumentation besonders wichtig, sonst drohen Nachverhandlungen.` },
    { h3: 'Totalschaden: Welche Abrechnung lohnt sich?', text: `Fiktive Abrechnung auf Gutachten-Basis, Reparatur nach 130-Prozent-Regelung oder Wiederbeschaffungswert-Auszahlung — was sinnvoll ist, hängt von Fahrzeugalter, Restwert und Ihren Plänen ab. Wir und das Claimondo-Netzwerk besprechen die Optionen, damit Sie nicht in die schlechteste gedrängt werden.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Der Sachverständige kennt verlässliche Partner in Frechen-Mitte, Königsdorf und Habbelrath — vom freien Karosseriefachbetrieb bis zur Markenwerkstatt. Die Werkstatt rechnet auf Basis des Gutachtens ab.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Königsdorf und Habbelrath. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 €.` },
    { text: `Kfz-Gutachter Frechen — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  huerth: [
    { text: `Hürth ist Studio-Stadt — in den MMC Studios entstehen „Wer wird Millionär?" und zahlreiche TV-Produktionen — und zugleich Wohnvorort mit dem A 1/A 4-Kreuz Köln-West, einem der staureichsten Knotenpunkte der Region. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Hürth-Mitte, Hermülheim, Efferen, Sielsdorf oder Berrenrath. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Fünf Stadtteile, unterschiedliche Schadenslagen: Hürth-Mitte als Einkaufszentrum hat Innenstadt-Rempler, Hermülheim — als Geburtsort von Michael Schumacher bekannt — liegt nah an den Studios mit Promi- und Publikumsverkehr. Efferen, Sielsdorf und Berrenrath sind Wohn- und Industriegebiete mit hohem Pendleraufkommen.` },
    { h3: 'Was gehört in ein gerichtsfestes Gutachten?', text: `Wir arbeiten nach BVSK-Standard und dokumentieren vollständig:`, liste: LEISTUNGS_LISTE },
    { h3: 'Kreuz Köln-West: Warum so unfallträchtig?', text: `Wo A 1 und A 4 zusammenkommen, gehört der Stau zum Alltag — Auffahrunfälle im Stop-and-Go und Spurwechsel-Kollisionen kurzentschlossener Pendler sind klassisch. Die A 553 ist südlicher Zubringer, die B 264 Luxemburger Straße trägt den Lieferverkehr durch die Stadt. Versucht die Versicherung danach, die Reparaturkosten über günstigere Werkstätten zu drücken: Sie haben das Recht auf eine Werkstatt Ihrer Wahl — der Sachverständige dokumentiert so, dass das nicht ausgehebelt werden kann.` },
    { h3: 'Studio- und Produktionsfahrzeuge: Was ist zu beachten?', text: `Die MMC Studios bringen Produktionscrews, Sprinter und Versorger-Fahrzeuge in die Stadt. Wer mit einem Studiowagen in einen Unfall verwickelt wird, braucht eine Dokumentation, die auch bei Firmenversicherungen sauber durchläuft — unsere Sachverständigen kennen die Anforderungen.` },
    { h3: 'Wer zahlt den Anwalt?', text: `Bei unverschuldetem Unfall die gegnerische Versicherung — wie Gutachter und Mietwagen. Wir und das Claimondo-Partnernetzwerk vermitteln einen Verkehrsrechtsanwalt aus der Region, der den Fall von der Schadensmeldung bis zur Auszahlung abwickelt.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir vermitteln verlässliche Partner in Hürth-Mitte, Hermülheim oder Efferen — Sie sind nicht an die Empfehlung der Versicherung gebunden.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Hermülheim und Efferen. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 €.` },
    { text: `Kfz-Gutachter Hürth — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  wesseling: [
    { text: `Wesseling zwischen Köln und Bonn ist Chemie-Industriestadt: Shell-Raffinerie, Evonik und LyondellBasell ziehen täglich Tausende Pendler und Lieferverkehr an. Ob B 9 Bonner Straße, A 555 oder Industrie-Quartier — unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Wesseling-Mitte, Berzdorf, Urfeld oder Keldenich. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Wesselings Verkehrslage ist besonders: Die Chemie-Industrie produziert hohen Lieferverkehr mit Tanklastzügen und Sondertransporten, die A 555 zwischen Köln und Bonn ist Pendlerstrecke mit Stop-and-Go im Berufsverkehr, und auf der B 9 Bonner Straße dominieren Innenstadt-Rempler und Spurwechsel-Konflikte — besonders an der Kreuzung Eichholzer Straße und den Industriegebiet-Ausfahrten.` },
    { h3: 'Welche Rechte haben Sie bei der Gutachter-Wahl?', text: `Sie wählen den Sachverständigen selbst — nicht die gegnerische Versicherung. Wir arbeiten nach BVSK-Standard und dokumentieren gerichtsfest:`, liste: LEISTUNGS_LISTE },
    { h3: 'Lkw-Streifschaden: Wer haftet?', text: `Bei Streifschäden durch Lkw-Spurwechsel oder Kollisionen mit Tanklastzügen stellt sich oft die Frage, ob Industrieunternehmen, Spedition oder Fahrer haftet. Wir dokumentieren so, dass die Haftungs-Zuordnung belegbar ist — und berechnen die Wertminderung korrekt, die bei jüngeren Fahrzeugen nach Lkw-Streifschäden besonders hoch ausfallen kann.` },
    { h3: 'Schaden durch verlorenes Ladegut — wer zahlt?', text: `Wer auf der A 555 in ausgelaufene Flüssigkeit oder ein verlorenes Teil gerät, hat Anspruch gegen den Verursacher beziehungsweise die Spedition. Wir dokumentieren so, dass deren Haftpflichtversicherung sauber abrechnen kann — auch bei Sondertransport-Beteiligung kennt das Claimondo-Netzwerk die Wege.` },
    { h3: 'Totalschaden: Welche Optionen gibt es?', text: `Reparatur nach 130-Prozent-Regelung, fiktive Abrechnung auf Gutachten-Basis oder Wiederbeschaffungswert-Auszahlung — abhängig von Fahrzeugalter, Restwert und Ihren Plänen. Wir und der Verkehrsrechtsanwalt aus dem Claimondo-Netzwerk besprechen die Optionen mit Ihnen.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir vermitteln verlässliche Karosserie- und Lackbetriebe in Wesseling-Mitte und Berzdorf — vom freien Fachbetrieb bis zur Markenwerkstatt.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Urfeld und Keldenich. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 €.` },
    { text: `Kfz-Gutachter Wesseling — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  kerpen: [
    { text: `Kerpen im Rhein-Erft-Kreis kennt jeder für zwei Dinge: den Tagebau Hambach und Michael Schumacher. Verkehrlich ist die Stadt mit A 4, A 61 und B 264 Aachener Straße eng vernetzt — wer Köln oder Aachen erreichen will, fährt durch oder vorbei. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Kerpen-Mitte, Horrem, Sindorf, Türnich oder Brüggen. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Fünf Stadtteile, eigene Dynamik: Kerpen-Mitte hat klassische Innenstadt-Rempler, Horrem als Bahnhofs-Stadtteil hohes Pendleraufkommen Richtung Köln. Sindorf ist Wohngebiet, Türnich ländlich-industriell mit A 4-Anschluss — und Brüggen liegt nahe am Tagebau Hambach, wo Schwerlastverkehr von RWE und Bagger-Versorgern ins Spiel kommt.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, Geschwindigkeit, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es in Kerpen am häufigsten?', text: `Die A 4 Kerpen-Türnich ist Hauptzubringer nach Köln und Aachen — klassisches Pendler-Auffahrunfall-Profil, auch mit versteckten Schäden in Heckblech und Kofferraumboden. Auf der A 61 häufen sich Wochenend-Schäden durch Reiserückkehrer, die B 264 trägt den Innenstadtverkehr. Eine Besonderheit: Der Tagebau Hambach erzeugt Schwerlastverkehr Richtung Niederaußem und Neurath — bei Streifschäden durch Bagger-Versorger oder Kies-Lkws belegt eine saubere Foto-Spur, wer auf welcher Spur fuhr.` },
    { h3: 'Firmenfahrzeug beteiligt: Wer haftet?', text: `Ob Firma oder Fahrer haftet, klärt die saubere Aufnahme von Schadensspur und Beteiligten-Daten — wir adressieren die Haftpflichtversicherung der Firma korrekt. Die Anwaltsabwicklung übernimmt das Claimondo-Partnernetzwerk, auch das kostenfrei.` },
    { h3: 'Wertminderung: Warum kürzen Versicherungen so gern?', text: `Bei jüngeren Fahrzeugen ist der merkantile Minderwert nach einem Auffahrunfall oft höher, als die Versicherung zugestehen möchte. Wir dokumentieren Schaden und Minderwert so, dass nicht einfach gekürzt werden kann — und falls doch, erstellen wir ein Gegengutachten auf Kosten der Gegenseite.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Der Sachverständige kennt verlässliche Partner in Kerpen-Mitte, Horrem und Sindorf — vom freien Karosseriefachbetrieb bis zur Markenwerkstatt. Die Werkstatt rechnet auf Basis des Gutachtens ab.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Horrem und Sindorf. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 €.` },
    { text: `Kfz-Gutachter Kerpen — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  erftstadt: [
    { text: `Erftstadt im Rhein-Erft-Kreis liegt südwestlich von Köln, wo die Erft die Börde durchzieht — eine polyzentrische Stadt aus 15 Stadtteilen, vom historischen Lechenich mit Burg und Stadtmauer bis zum Verwaltungssitz Liblar. Verkehrlich treffen A 1 und A 61 am Autobahnkreuz Bliesheim im Stadtgebiet aufeinander, dazu die B 265 Luxemburger Straße Richtung Köln. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Liblar, Lechenich, Bliesheim, Kierdorf oder Gymnich. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Erftstadts Stadtteile bringen je eigene Schadensdynamik mit: Liblar als Verwaltungs- und Bahnhofs-Stadtteil hat hohes Pendleraufkommen Richtung Köln mit Park- und Berufsverkehr-Remplern. Lechenich im Osten mit enger historischer Altstadt ist Schwerpunkt für Abbiege- und Rangierschäden. Bliesheim im Süden liegt direkt am Autobahnkreuz — Auffahrunfälle aus dem Stau. Kierdorf und Köttingen im Norden sind wohngeprägt, Gymnich im Westen mit seinem Schloss eher ländlich mit Landstraßen-Profil.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, Geschwindigkeit, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard und ausschließlich in Ihrem Interesse:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es in Erftstadt am häufigsten?', text: `Das Autobahnkreuz Bliesheim verbindet die A 1 Richtung Köln mit der A 61 Richtung Koblenz — klassisches Pendler-Auffahrunfall-Profil im Berufsverkehr, oft mit versteckten Schäden in Heckblech und Kofferraumboden. Die B 265 Luxemburger Straße trägt den Pendlerverkehr nach Köln-Süd und Hürth; in Lechenich und Liblar sind es die engen Ortsdurchfahrten mit Streif- und Abbiegeschäden. Wer Richtung Kerpen oder Brühl pendelt, kennt die Landstraßen über Erp und Friesheim.` },
    { h3: 'Was tun, wenn die Versicherung kürzt?', text: `Nach einem unverschuldeten Unfall haben Sie das Recht auf einen eigenen, neutralen Sachverständigen — nicht den Prüfer der gegnerischen Versicherung. Kürzt sie die Schadenshöhe, erstellen wir auf Wunsch ein Gegengutachten, das ebenfalls die Gegenseite trägt; gerade bei jüngeren Fahrzeugen zählt die saubere Berechnung des merkantilen Minderwerts.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie — freier Fachbetrieb oder Markenwerkstatt, das ist Ihr Recht. Wir vermitteln verlässliche Partner in Liblar, Lechenich und im benachbarten Hürth; das gerichtsfeste Gutachten ist die Abrechnungsbasis.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Lechenich und Bliesheim. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 €.` },
    { text: `Kfz-Gutachter Erftstadt — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
}

export function seoBodyFor(slug: string): SeoAbsatz[] {
  return SEO_BODY[slug] ?? []
}

// Per-Stadt-metaHook (Lever 2): kurzer, unique lokaler Aufhaenger fuer die Meta-
// Description (seo.ts) statt des recycelten h1Sub -> killt near-duplicate-Snippets.
// Distilliert aus SEO_BODY, <=40 Z. Fehlt ein Slug -> Fallback auf city.h1Sub.
export const META_HOOKS: Record<string, string> = {
  koeln: 'A1/A3/A4-Ring & Heumarer Dreieck',
  leverkusen: 'Bayer-Kreuz & gesperrte A1-Brücke',
  'bergisch-gladbach': 'A4 Bensberg & Wildunfälle im Bergischen',
  huerth: 'A1/A4-Kreuz Köln-West & MMC Studios',
  frechen: 'A4 Königsdorf & Keramikstadt',
  pulheim: 'A1 Brauweiler & A57-Pendlerstadt',
  bruehl: 'Phantasialand & Schloss Augustusburg',
  wesseling: 'Shell-Raffinerie & A555-Chemie',
  kerpen: 'A4/A61 & Tagebau Hambach',
  erftstadt: 'AK Bliesheim A1/A61, 15 Stadtteile',
}
