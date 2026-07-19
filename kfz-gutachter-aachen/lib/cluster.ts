// ============================================================================
// CLUSTER-VORLAGE · AACHEN (Städteregion Aachen)  —  Abgabe für Nicolas (09.06.2026)
// ============================================================================
// Das ist die EINZIGE Datei, in der die Cluster-Identität lebt. Alle Komponenten,
// SEO, Hub (/) und Spokes (/lp/<slug>) werden aus dieser Datei generiert.
//
// NICOLAS — DU FÜLLST DEN INHALT. Die Struktur steht. Such nach `TODO Nicolas`.
// Pro neuem Cluster nur 4 Stellen anpassen (Details in HANDOFF.md):
//   1) diese Datei (lib/cluster.ts)  — Städte, Region, Brennpunkte, SEO-Texte
//   2) app/globals.css  — :root Cluster-Vars (Theme-Farben)
//   3) app/layout.tsx   — themeColor (muss zu globals.css passen)
//   4) public/assets/img/aachen/  — echte Bilder (ersetzen die Platzhalter)
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
  /** Einwohner-Bezeichnung ("Aachener") fuer Reviews-Headline. */
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
  /** Region im Dativ ("im Aachener Raum") fuer Ueber-uns-Copy. */
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
  /** Fachliche Spezialisierung (Differenzierungs-Anker, Person-Schema knowsAbout). */
  svSpezialitaet: string
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
  key: 'aachen',
  region: 'Städteregion Aachen',
  regionDative: 'Aachener Raum', // ergibt "im Aachener Raum" — TODO Nicolas: ggf. anpassen
  quellenAnker: 'Polizeibericht Aachen 2024 + ADAC Stau-Statistik 2025',
  achsen: ['A4', 'A44', 'A544'], // TODO Nicolas: relevante Achsen bestaetigen
  stadtteile: ['Mitte', 'Brand', 'Eilendorf', 'Haaren', 'Laurensberg', 'Richterich', 'Kornelimünster'],
  domain: 'kfz-unfallgutachter-aachen.de',
  theme: 'patina', // Aachen-Cluster v2: Dom-Patina + Kupfer — globals.css :root traegt die Vars
  themeColor: '#234F46', // Aachen-Cluster: Patina-Grün (matched globals.css :root --petrol / Brand-Primary)
  imgPath: '/assets/img/aachen/',
  logoExt: 'svg',
  assetVersion: '2', // 08m: q90-Heros + neue 08h-Assets + dilate-Logos
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.', // 08n N1: Geo-Schwanz raus (Aaron)
  teamImg: '/assets/img/aachen/team-aachen.webp?v=2',
  svName: 'Markus', // Aachen-Cluster Persona (Vorname — CTA/Ueber-uns) — Aaron-Vorgabe 2026-06-09
  svSurname: 'Lennartz', // Aachen-Cluster Persona (Nachname — Person-Schema) — Aaron-Vorgabe 2026-06-09
  svSpezialitaet: 'Hochwasser-2021-Sachverständigung + BVSK-Standard', // Differenzierung (Düren/Eschweiler/Stolberg)
  // Telefon einheitlich ueber alle Cluster (Aaron-Vorgabe Mobil). Bei eigener Nummer hier aendern.
  phone: { display: '+49 1515 3608515', displayNational: '0151 5360 8515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Aachener Dom', img: 'stadt-aachen.png' }, // TODO Nicolas: Wahrzeichen-Bild
  facts: [
    { value: 'A4', label: 'Hauptachse' },
    { value: 'A44', label: 'Hauptachse' },
    { value: 'A544', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  // Verkehrsschwerpunkte Aachen-Hub — lokal verankert, keine erfundenen Stats (Quellen s. quellenAnker).
  brennpunkte: [
    {
      name: 'Aachener Kreuz',
      img: 'aachen_kreuz.webp',
      desc: 'Das Aachener Kreuz (A 4 / A 44) ist eine der wichtigsten Drehscheiben im Westen NRWs — täglich kreuzen sich hier Pendlerströme aus Köln, Maastricht und Lüttich. Stop-and-Go im Berufsverkehr und Spurwechsel-Manöver sind die häufigsten Unfallursachen. Markus ist binnen 60 Minuten vor Ort.',
    },
    {
      name: 'Adalbertstraße',
      img: 'aachen_adalbertstrasse.webp',
      desc: 'Die Adalbertstraße zählt zu den meistbefahrenen Innenstadtachsen Aachens — Fußgängerzonen-Übergang, Tram-Linien und Lieferverkehr treffen aufeinander. Tür-Öffner-Schäden, Park-Rempler und Vorfahrt-Konflikte prägen das Schadensbild. Wir kennen die Sondersituationen rund um den Markt und die Pontstraße.',
    },
    {
      name: 'Europaplatz',
      img: 'aachen_europaplatz.webp',
      desc: 'Der Europaplatz liegt am Übergang zur belgisch-niederländischen Grenzregion und ist Drehscheibe für grenzüberschreitenden Verkehr. Versicherungstechnisch besonders: Schäden mit ausländischen Beteiligten erfordern Spezialkenntnis. Markus arbeitet seit Jahren mit BE/NL-Versicherern und kennt die Regulierungswege.',
    },
  ],
  // Hub = Aachen (main:true). Düren = Power-Spoke (170 Vol/mo, +182% YoY) direkt nach dem Hub.
  // h1Sub = SEO-Variation + cluster-spezifische Anker (Hochwasser-2021, A4/Veldener, NL-Grenze).
  cities: [
    { slug: 'aachen',       name: 'Aachen',       plz: '52062', main: true, h1Sub: 'unabhängiger Sachverständiger für Aachen + Region',             residents: 'Aachener',       lat: 50.7753, lng: 6.0839 },
    // === POWER-SPOKE: Düren (170 Vol/mo, +182% YoY) ===
    { slug: 'dueren',       name: 'Düren',        plz: '52349',             h1Sub: 'Düren-Spezialist seit 2020 — A 4 + Veldener Straße in 60 Minuten', residents: 'Dürener',        lat: 50.8047, lng: 6.4936 },
    // === Spokes (Städteregion + Kreis Düren) ===
    { slug: 'alsdorf',      name: 'Alsdorf',      plz: '52477',             h1Sub: 'Kfz-Sachverständiger Städteregion Aachen',                        residents: 'Alsdorfer',      lat: 50.8769, lng: 6.1611 },
    { slug: 'wuerselen',    name: 'Würselen',     plz: '52146',             h1Sub: 'unabhängiger Unfallgutachter',                                    residents: 'Würselener',     lat: 50.8197, lng: 6.1322 },
    { slug: 'baesweiler',   name: 'Baesweiler',   plz: '52499',             h1Sub: 'Sachverständiger Städteregion + NL-Grenze',                       residents: 'Baesweiler',     lat: 50.9089, lng: 6.1894 },
    { slug: 'eschweiler',   name: 'Eschweiler',   plz: '52249',             h1Sub: 'Hochwasser-2021-Erfahrung — Eschweiler + Inde-Region',            residents: 'Eschweiler',     lat: 50.8181, lng: 6.2731 },
    { slug: 'juelich',      name: 'Jülich',       plz: '52428',             h1Sub: 'unabhängiger Kfz-Sachverständiger',                               residents: 'Jülicher',       lat: 50.9239, lng: 6.3625 },
    { slug: 'stolberg',     name: 'Stolberg',     plz: '52222',             h1Sub: 'Hochwasser-2021-Spezialist + Sachverständiger',                   residents: 'Stolberger',     lat: 50.7706, lng: 6.2289 },
    { slug: 'herzogenrath', name: 'Herzogenrath', plz: '52134',             h1Sub: 'Sachverständiger Grenzregion DE/NL',                              residents: 'Herzogenrather', lat: 50.8694, lng: 6.0936 },
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
  aachen: [
    { text: `Aachen ist Krönungsstadt, Grenzstadt und Pendlerstadt zugleich. Wer am Aachener Kreuz auf der A 4, auf der Adenauerallee oder rund um Dom und Markt unverschuldet in einen Unfall gerät, braucht einen Sachverständigen, der die Region kennt und gerichtsfest dokumentiert. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten bei Ihnen — von Aachen-Mitte über das Frankenberger Viertel, Forst, Haaren und Eilendorf bis Brand, Laurensberg und Richterich. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Aachens Verkehrslage ist besonders: Das Dreiländereck bringt täglich Tausende Grenzpendler. Auf der A 4 zwischen Aachener Kreuz und belgischer Grenze sind Auffahrunfälle im Berufsverkehr klassisch, die A 44 bündelt Pendler aus Alsdorf, Würselen und Jülich. Innerstädtisch trägt die Adenauerallee den Verkehr vom Hauptbahnhof Richtung Dom — mit hohem Liefer- und Busverkehr.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl in Aachen an?', text: `Neutralität, lokale Erfahrung, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard — die Regulierung läuft parallel mit dem Claimondo-Partnernetzwerk:`, liste: LEISTUNGS_LISTE },
    { h3: 'Unfall mit Belgiern oder Niederländern: Wie läuft die Regulierung?', text: `Über die Grüne Karte und den Zentralruf der Autoversicherer. Wir arbeiten seit Jahren mit BE- und NL-Versicherungen zusammen — kommt der Unfallverursacher aus Lüttich, Maastricht oder Kerkrade, läuft die Abwicklung sauber über die internationalen Standards.` },
    { h3: 'Wasser- und Hochwasserschäden: Wer hilft?', text: `Unser Sachverständiger war 2021 nach dem Hochwasser im Indetal — in Eschweiler, Stolberg und Düren — über Monate mit Totalschäden und Wassergutachten beschäftigt. Bei Sturzfluten, Wasserschäden oder Hochwasser-Folgekosten zählt genau diese Praxis: Teilkaskoabwicklung und Wiederbeschaffungswert-Ermittlung sind versicherungstechnisch ein eigenes Kapitel.` },
    { h3: 'Wo kracht es in Aachen am häufigsten?', text: `Das Aachener Kreuz (A 4/A 44) gehört zu den wichtigsten Drehscheiben im Westen NRWs — Stop-and-Go und Spurwechsel Richtung Köln, Belgien und Mönchengladbach. Die Anschlussstelle Aachen-Mitte ist oft staureich, innerstädtisch sind Adalbertstraße und Pontstraße enge Achsen mit Tram-Verkehr und Park-Konflikten, der Europaplatz ist Drehscheibe des Grenzverkehrs.` },
    { h3: 'Was tun, wenn die Versicherung kürzt?', text: `Sie haben das Recht auf einen unabhängigen Sachverständigen Ihrer Wahl — nicht den der gegnerischen Versicherung. Setzt diese die Reparaturkosten zu niedrig an oder verweigert die Wertminderung, erstellen wir auf Wunsch ein Gegengutachten; auch das wird nach BGH-Rechtsprechung übernommen.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir kennen verlässliche Karosserie- und Lackbetriebe von Aachen-Mitte über Burtscheid bis Brand und Eilendorf — ohne Bindung an die Empfehlung der Versicherung. Das gerichtsfeste Gutachten ist die Abrechnungsbasis.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Telefon oder WhatsApp. 2) Der Sachverständige kommt vor Ort, alle Stadtteile. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Aachen — neutral, gerichtsfest, schnell vor Ort. Rufen Sie an oder schreiben Sie über WhatsApp, und wir klären in 5 Minuten, wie es weitergeht.` },
  ],
  dueren: [
    { text: `Düren ist die Industriestadt im Westen NRWs — Papier, Maschinenbau, Logistik — und mit A 4-Anschluss und B 56 eine der wichtigsten Drehscheiben zwischen Köln und Aachen. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Düren-Mitte, Birkesdorf, Gürzenich, Lendersdorf, Niederau oder Rölsdorf. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Dürens Profil ist verkehrsreich: Die A 4-Anschlussstelle ist seit Jahren staureich und im Berufsverkehr Richtung Köln und Aachen ein klassischer Auffahrunfall-Hotspot — auch Düren-Süd, wo Pendler aus Niederzier und Inden einsteigen. Die B 56 Aachener Landstraße trägt den Lieferverkehr durch die Stadt, die B 264 Köln-Düren-Aachen ist die Alternativroute mit eigenem Stau-Profil.` },
    { h3: 'Was unterscheidet den modernen Ansatz?', text: `Die Veldener Straße ist seit Jahrzehnten Heimat traditioneller Sachverständigenbüros — wir respektieren das und bieten bewusst etwas anderes: Sofort-Erreichbarkeit über WhatsApp, schnelle Vor-Ort-Aufnahme und das komplette Claimondo-Partnernetzwerk mit Verkehrsrechtsanwalt, Werkstatt-Vermittlung und Mietwagenservice. Die Basis bleibt klassisch — gerichtsfeste Dokumentation nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Hochwasser 2021: Was bedeutet das bis heute?', text: `Das Indetal-Hochwasser traf Düren mit voller Wucht — Unser Sachverständiger war über Monate mit Hochwasser-Gutachten beschäftigt, in Birkesdorf, Gürzenich, am Industriegebiet Distelrath und in Lendersdorf. Wer heute mit Hochwasser-Folgekosten zu tun hat, profitiert von dieser Praxis: Die Teilkaskoabwicklung bei Wassertotalschäden ist ein eigenes Kapitel.` },
    { h3: 'Wo passiert es in Düren am häufigsten?', text: `Die A 4-Anschlussstelle ist Hotspot Nummer 1 — Auffahrunfälle im Stop-and-Go, Spurwechsel beim Ausfahren. Die B 56 als Stadtdurchquerung mischt Bus-, Fahrrad- und Pkw-Verkehr, Schoellerstraße und Aachener Straße haben hohes Park-Aufkommen, und im Industriegebiet Distelrath kommen Lkw und Sondertransporte hinzu.` },
    { h3: 'Wertminderung: Warum wird so oft gekürzt?', text: `Bei jüngeren Fahrzeugen ist der merkantile Minderwert nach einem Auffahrunfall oft höher, als die Versicherung zugestehen möchte — und versteckte Schäden in Heckblech und Kofferraumboden bleiben ohne strukturierte Prüfung unentdeckt. Wir dokumentieren so, dass nicht einfach gekürzt werden kann; falls doch, erstellen wir ein Gegengutachten auf Kosten der Gegenseite.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Der Sachverständige kennt Karosserie- und Lackbetriebe in Düren-Mitte, Birkesdorf und am Industriegebiet — vom freien Fachbetrieb bis zur Markenwerkstatt. Die Werkstatt rechnet auf Basis des Gutachtens ab.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Düren — modern, digital, gerichtsfest. Wir klären in 5 Minuten am Telefon, ob ein Sachverständiger sinnvoll ist und wie es weitergeht.` },
  ],
  alsdorf: [
    { text: `Alsdorf, nordöstlich von Aachen, war Jahrzehnte vom Steinkohle-Bergbau geprägt und ist heute Wohn- und Logistikstadt — über die A 44 mit Aachen verbunden, über die L 240 mit dem Mariadorf-Industriegebiet. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Alsdorf-Mitte, Schaufenberg, Hoengen oder Mariadorf. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Vier Stadtteile, eigene Profile: Alsdorf-Mitte mit der Annakirche hat klassische Innenstadt-Dynamik mit Park-Remplern, Schaufenberg ist Wohngebiet, Hoengen im Westen pendlerorientiert. Mariadorf im Osten ist Industriegebiet — dort kommen Flotten- und Logistik-Schäden hinzu.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, lokale Erfahrung, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard — die Regulierung läuft parallel mit dem Claimondo-Partnernetzwerk:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Alsdorf?', text: `Die A 44-Anschlussstelle Alsdorf ist Hauptzubringer Richtung Aachen und Mönchengladbach — Auffahrunfälle im Stop-and-Go des Berufsverkehrs sind klassisch. Die L 240 trägt Lkw- und Flottenverkehr ins Mariadorf-Industriegebiet, die B 264 Industriestraße den Schwerlastverkehr. Bei Flottenfahrzeugen dokumentieren wir so, dass Firmenversicherung und gegnerische Haftpflicht sauber abrechnen können.` },
    { h3: 'Unfall mit ausländischer Beteiligung — was nun?', text: `Niederländische und belgische Pendler gehören in der Region zum Alltag. Über die Grüne Karte und den Zentralruf der Autoversicherer wird der Schaden auch mit nicht-deutschen Beteiligten abgewickelt — Wir und das Claimondo-Netzwerk kennen die Wege.` },
    { h3: 'Wertminderung: Was steht Ihnen zu?', text: `Bei jüngeren Fahrzeugen führt ein Auffahrunfall zu merkantilem Minderwert — einer dauerhaften Wertreduzierung trotz fachgerechter Reparatur. Versicherungen zahlen sie selten freiwillig; wir berechnen sie sauber und dokumentieren so, dass die Gegenseite sie auch zahlen muss.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir kennen verlässliche Karosseriefachbetriebe und Lackierereien in Alsdorf-Mitte und Mariadorf — ohne Bindung an die Empfehlung der gegnerischen Versicherung.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Alsdorf — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  wuerselen: [
    { text: `Würselen, direkt nordöstlich von Aachen, ist klassische Pendlerstadt mit Bildungs- und Wohnschwerpunkt — über A 44 und A 4 eng mit Aachen und Köln verbunden, die L 12 Aachener Straße trägt den Verkehr durch die Stadt. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Würselen-Mitte, Bardenberg oder Broichweiden. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Drei Stadtteile, drei Profile: Würselen-Mitte hat mit der Kaiserstraße Innenstadt-Rempler und Konflikte mit Bus- und Fahrradverkehr, Bardenberg ist Wohngebiet mit Park-Remplern an Schulen und Kitas. Broichweiden im Osten ist ländlicher — mit Pendlerschäden und Wildunfall-Risiko Richtung Bergisches Land.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, lokale Erfahrung, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Würselen?', text: `Die A 44-Anschlussstelle Würselen ist der direkte Aachen-Verbinder — klassische Auffahrunfall-Strecke im Berufsverkehr, ebenso die staureiche A 4 Würselen-West Richtung Köln. Innerörtlich mischt die L 12 Aachener Straße Pkw, Bus und Fahrrad; in Schulnähe in Würselen-Mitte und Bardenberg sind auch Schüler- und Bus-Beteiligungen nicht selten. Bei jüngeren Fahrzeugen zählt nach dem Heckschaden die saubere Wertminderungs-Berechnung.` },
    { h3: 'Wer zahlt den Anwalt?', text: `Bei unverschuldetem Unfall die gegnerische Versicherung — wie Gutachter und Mietwagen. Wir und das Claimondo-Partnernetzwerk vermitteln einen Verkehrsrechtsanwalt aus der Region, der den Fall von der Schadensmeldung bis zur Auszahlung abwickelt.` },
    { h3: 'Unfall mit Niederländern aus Heerlen oder Kerkrade?', text: `In der Region häufig — und klar geregelt: Wir arbeiten seit Jahren mit BE- und NL-Versicherungen zusammen, die Abwicklung läuft über die internationalen Wege.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie — das ist Ihr Recht nach BGH-Rechtsprechung. Wir kennen Karosserie- und Lackbetriebe in Würselen-Mitte und Bardenberg, vom freien Fachbetrieb bis zur Markenwerkstatt.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Würselen — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  baesweiler: [
    { text: `Baesweiler, nördlich von Aachen in unmittelbarer Grenznähe zu den Niederlanden, ist Pendlerstadt mit eigenen Logistik- und Industriestandorten — angebunden über B 57 und L 240, dazu täglicher grenzüberschreitender Verkehr. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Baesweiler-Mitte, Setterich oder Oidtweiler. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Drei Stadtteile, eigene Profile: Baesweiler-Mitte hat Innenstadt-Rempler, Setterich ist Wohngebiet, Oidtweiler ländlicher mit Pendlerverkehr Richtung Niederlande. Die Bergbau-Vergangenheit prägt das Industrieprofil bis heute — Logistik und Wohnstadt im Wechsel.` },
    { h3: 'Grenzüberschreitender Unfall: Wer reguliert?', text: `Hier zählt Erfahrung mit niederländischen Versicherungen: Wir kennen die Regulierungswege über die Grüne Karte und den Zentralruf der Autoversicherer. Ob der Verursacher aus Geilenkirchen, Heinsberg, Kerkrade oder Heerlen kommt — die Abwicklung läuft über die internationalen Standards, das BVSK-Gutachten ist EU-weit anerkannt.` },
    { h3: 'Was gehört zum Gutachten?', text: `Die Standard-Disziplin nach BVSK-Standard — die Regulierung läuft parallel mit dem Claimondo-Partnernetzwerk:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Baesweiler?', text: `Die B 57 Aachener Straße ist die Nord-Süd-Hauptachse mit Pendlerverkehr Richtung Aachen und Heinsberg, die L 240 Industriestraße trägt den Schwerlastverkehr. Durch die Grenznähe sind niederländische Fahrzeuge im Stadtbild häufig — ein Auffahrunfall mit NL-Beteiligung auf der B 57 ist der typische Fall: Wir dokumentieren nach deutschen Standards, der Zentralruf leitet den Schaden mit klaren Fristen an die niederländische Haftpflicht weiter.` },
    { h3: 'Müssen Sie den Gutachter der NL-Versicherung nehmen?', text: `Nein. Auch bei ausländischen Beteiligten gilt Ihr Recht auf einen eigenen, unabhängigen Sachverständigen — wir arbeiten ausschließlich in Ihrem Interesse, grenzüberschreitend.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Der Sachverständige kennt verlässliche Karosserie- und Lackbetriebe in Baesweiler-Mitte und Setterich — vom freien Fachbetrieb bis zur Markenwerkstatt.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Setterich. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel — auch bei grenzüberschreitenden Schäden. 0 € für Sie.` },
    { text: `Kfz-Gutachter Baesweiler — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  eschweiler: [
    { text: `Eschweiler ist mit rund 56.000 Einwohnern eine der größten Städte im Aachen-Cluster — und hat eine bewegte Schadens-Geschichte: Das Hochwasser 2021 traf das Indetal mit voller Wucht, mit hunderten Totalschäden durch Wasser, Schlamm und Geröll. Unser Sachverständiger war damals über Monate vor Ort im Einsatz. Ob klassischer Auffahrunfall oder Wasserschaden mit komplizierter Abwicklung: 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Vier Stadtteile, eigene Dynamik: Eschweiler-Mitte hat mit der Indestraße klassische Innenstadt-Schäden, Weisweiler als Kraftwerk-Stadtteil Industrieverkehr und Sondertransporte. Dürwiß und Nothberg sind Wohngebiete mit Pendlerschwerpunkt.` },
    { h3: 'Hochwasser und Starkregen: Warum zählt Erfahrung?', text: `Das Hochwasser 2021 hat eine eigene versicherungstechnische Komplexität geschaffen — Wassertotalschäden bei Teilkasko, Beweisführung über Schlamm- und Geröll-Spuren, Folgeschäden an Elektronik. Unsere Sachverständigen haben damals eine Vielzahl solcher Gutachten erstellt und kennen die Regulierungswege; bei Starkregen-Ereignissen, die weiterhin auftreten, zahlt sich genau das aus.` },
    { h3: 'Was gehört zum Gutachten?', text: `Die Standard-Disziplin nach BVSK-Standard — die Regulierung läuft parallel mit dem Claimondo-Partnernetzwerk:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Eschweiler?', text: `Die A 4-Anschlussstelle Eschweiler ist Hauptzubringer mit hohem Pendleraufkommen Richtung Aachen und Köln — Stop-and-Go im Berufsverkehr ist klassisch. Die Indestraße mischt als Stadtdurchquerung Pkw, Bus und Fahrrad, die Hauptstraße ist Schwerpunkt für Innenstadt-Rempler.` },
    { h3: 'Wasserschaden nach Starkregen: Wie wird reguliert?', text: `Fahrzeug auf überfluteter Straße, Wasser im Motor- oder Innenraum, drohende Elektronik-Folgeschäden: Wir dokumentieren die Wassereinwirkung mit Foto-Belegen, Pegelständen und Schadensspuren — so reguliert die Teilkasko oder (bei Verkehrsverursachung) die gegnerische Haftpflicht sauber, inklusive belastbarem Wiederbeschaffungswert bei Totalschäden. Kürzt die Versicherung, erstellen wir ein Gegengutachten.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir kennen Karosserie-, Lack- und Elektronik-Fachbetriebe in Eschweiler-Mitte und Weisweiler — auch Spezialwerkstätten für Wassertotalschäden mit Trocknungs- und Diagnose-Erfahrung sind im Netzwerk vermittelbar.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Weisweiler. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Gutachter Eschweiler — gerichtsfest, schnell vor Ort, mit Hochwasser-Praxis seit 2021. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  juelich: [
    { text: `Jülich ist Forschungs- und Geschichts-Stadt: Das Forschungszentrum Jülich zählt zu den größten interdisziplinären Forschungseinrichtungen Europas, Zitadelle und Hexenturm prägen das Stadtbild. Verkehrlich verbinden A 44 und B 56 die Stadt mit Aachen und Düren. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Jülich-Mitte, Stetternich, Selgersdorf oder Koslar. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Vier Stadtteile, eigene Dynamik: Jülich-Mitte mit der Zitadelle hat Innenstadt-Rempler, Stetternich ist Forschungszentrum-Stadtteil mit internationalem Berufspendlerverkehr. Selgersdorf und Koslar sind Wohngebiete mit Pendlerprofil.` },
    { h3: 'Worauf kommt es bei der Gutachter-Wahl an?', text: `Neutralität, lokale Erfahrung, gerichtsfeste Dokumentation. Wir arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Jülich?', text: `Die A 44-Anschlussstelle Jülich ist Hauptzubringer Richtung Aachen mit Forschungs- und Pendlerverkehr — typische Auffahrunfall-Strecke im Berufsverkehr. Die B 56 Aachener Landstraße trägt den Lieferverkehr Richtung Düren und Aachen, die L 241 verbindet als Pendlerstrecke beide Städte.` },
    { h3: 'Internationale Beteiligte: Wie läuft die Abwicklung?', text: `Die Mitarbeiter des Forschungszentrums kommen aus aller Welt — und die Nähe zu den Niederlanden und Belgien bringt zusätzlich grenzüberschreitende Fälle. Wir arbeiten auch mit nicht-deutschen Versicherungen und kennen die internationalen Regulierungswege.` },
    { h3: 'Wertminderung: Warum kürzen Versicherungen so gern?', text: `Bei jüngeren Fahrzeugen ist der merkantile Minderwert oft höher, als die Versicherung freiwillig zugesteht. Wir dokumentieren so, dass nicht einfach gekürzt werden kann — falls doch, erstellen wir ein Gegengutachten auf Kosten der Gegenseite. Und bei Wasser- oder Hochwasser-Bezug, der im Indetal seit 2021 immer wieder vorkommt, bringen wir die spezifische Gutachten-Praxis mit.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir kennen verlässliche Karosserie- und Lackbetriebe in Jülich-Mitte, Stetternich und Selgersdorf und vermitteln auf Wunsch.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Forschungszentrum-Umfeld. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 €.` },
    { text: `Kfz-Gutachter Jülich — neutral, gerichtsfest, schnell vor Ort. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  stolberg: [
    { text: `Stolberg ist mit rund 57.000 Einwohnern eine der größten Städte im Aachen-Cluster — und teilt mit Eschweiler die Hochwasser-Geschichte: 2021 traf es vor allem die Vichtbach- und Indetal-Lage, mit hunderten Schäden und Wassergutachten. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Stolberg-Mitte, Atsch, Münsterbusch oder Vicht. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Vier Stadtteile, eigene Profile: Stolberg-Mitte mit Altstadt und Burg ist Touristen-Schwerpunkt — Park-Rempler in den engen Gassen sind klassisch. Atsch ist Industriegebiet mit Buntmetall-Vergangenheit und Logistik-Schäden, Münsterbusch Wohngebiet, Vicht im Süden Eifel-Vorland mit Wildunfall-Risiko.` },
    { h3: 'Hochwasser-Region: Was heißt das für Gutachten?', text: `Unser Sachverständiger war 2021 monatelang in der Vichtbach- und Indetal-Region im Einsatz — Wassertotalschäden, Elektronik-Folgeschäden, Beweisführung über Schlamm- und Geröll-Spuren, dokumentiert nach BVSK-Standard. Diese Praxis zählt bis heute:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Stolberg?', text: `Die A 4-Anschlussstelle Stolberg ist der zentrale Zubringer Richtung Aachen und Köln — klassisches Auffahrunfall-Profil im Berufsverkehr. Die B 258 trägt als Hauptstraße den Pendler- und Lieferverkehr durch die Stadt, die L 238 verbindet Richtung Eschweiler, und in den engen Altstadtgassen rund um die Burg häufen sich Park-Konflikte.` },
    { h3: 'Wasserschaden, Auffahrunfall oder Wildunfall — wie wird dokumentiert?', text: `Je nach Schadensart: bei Wasserschäden mit Pegelstand-Belegen und Schadensspuren, bei Auffahrunfällen mit Strukturschäden-Prüfung und Wertminderungs-Berechnung, bei Wildunfällen in Vicht mit Wildhärchen- und Aufprall-Dokumentation für die Teilkasko.` },
    { h3: 'Hochwasser-Folgeschäden Jahre später: Geht da noch was?', text: `Oft ja — wenn Korrosions- oder Elektronik-Folgeschäden erst später sichtbar werden, können sie unter Umständen noch reguliert werden. Es gelten klare Beweisregeln; wir dokumentieren so, dass die Versicherung sauber reguliert.` },
    { h3: 'Gutachter oder Sachverständiger — gibt es einen Unterschied?', text: `Nein — die rechtliche Stellung ist identisch. Ob Sie nach „Kfz-Gutachter Stolberg" oder „Kfz-Sachverständiger Stolberg" suchen: Das Gutachten ist gerichtsfest und folgt dem BVSK-Standard.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Der Sachverständige kennt verlässliche Karosserie- und Lackbetriebe in Stolberg-Mitte und Atsch — auch Spezialwerkstätten für Wassertotalschäden mit Trocknungs- und Elektronik-Diagnose sind im Netzwerk vermittelbar.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Atsch und Vicht. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel. 0 € für Sie.` },
    { text: `Kfz-Sachverständiger Stolberg — gerichtsfest, schnell vor Ort, mit Hochwasser-Praxis seit 2021. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
  herzogenrath: [
    { text: `Herzogenrath ist die Grenzstadt par excellence — mit Kerkrade praktisch zusammengewachsen, prägt der grenzüberschreitende Verkehr die Stadt wie kein anderes Element. Ob A 4-Anschlussstelle, B 57 Roermonder Straße oder Stadtkern an der Burg Rode: Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Herzogenrath-Mitte, Kohlscheid oder Merkstein. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.` },
    { vorort: true, text: `Drei Stadtteile, eigene Dynamik: Herzogenrath-Mitte mit der Burg Rode hat klassische Innenstadt-Rempler, Kohlscheid ist Wohngebiet — und Merkstein liegt direkt an der niederländischen Grenze mit entsprechend hohem grenzüberschreitendem Verkehr.` },
    { h3: 'Grenzüberschreitender Unfall: Wer reguliert?', text: `Hier zählt Erfahrung mit niederländischen Versicherungen: Wir kennen die Regulierungswege über die Grüne Karte und den Zentralruf der Autoversicherer. Ob der Verursacher aus Kerkrade, Heerlen oder Maastricht kommt — die Abwicklung läuft über die internationalen Standards.` },
    { h3: 'Was gehört zum Gutachten?', text: `Die Standard-Disziplin nach BVSK-Standard — die Regulierung läuft parallel mit dem Claimondo-Partnernetzwerk:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es rund um Herzogenrath?', text: `Die A 4-Anschlussstelle Herzogenrath ist Hauptzubringer Richtung Köln und Aachen — Auffahrunfälle im Stop-and-Go sind klassisch. Die B 57 Roermonder Straße trägt den Verkehr Richtung Niederlande und ist entsprechend unfallträchtig; im Stadtkern sind die engen Gassen an der Burg Schwerpunkt für Rempler. Der typische Fall: Auffahrunfall mit niederländischer Beteiligung — wir dokumentieren nach deutschen Standards, der Zentralruf leitet mit klaren Fristen an die NL-Haftpflicht weiter.` },
    { h3: 'Müssen Sie den Gutachter der NL-Versicherung nehmen?', text: `Nein — das Recht auf einen eigenen, unabhängigen Sachverständigen gilt nach EU-Standard auch bei ausländischen Beteiligten. Wir dokumentieren so, dass die Versicherung sauber reguliert — egal ob deutsch oder niederländisch.` },
    { h3: 'Was bekommen Sie zusätzlich?', text: `Schnelle Vor-Ort-Aufnahme, Gutachten in 48 Stunden und die Versicherungsabwicklung über das Claimondo-Partnernetzwerk inklusive Anwalt und Mietwagen — alles kostenfrei für Sie.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie. Wir kennen verlässliche Karosserie- und Lackbetriebe in Herzogenrath-Mitte und Kohlscheid — vom freien Fachbetrieb bis zur Markenwerkstatt.` },
    { h3: 'Wie läuft es ab?', text: `Drei Schritte: 1) Anruf oder WhatsApp. 2) Vor-Ort-Termin binnen 60 Minuten, alle Stadtteile inklusive Merkstein. 3) Gutachten in 48 Stunden, Versicherungsabwicklung parallel — auch bei niederländischer Beteiligung. 0 € für Sie.` },
    { text: `Kfz-Gutachter Herzogenrath — neutral, gerichtsfest, schnell vor Ort, auch bei Grenzschäden. Wir klären in 5 Minuten am Telefon, wie es weitergeht.` },
  ],
}

export function seoBodyFor(slug: string): SeoAbsatz[] {
  return SEO_BODY[slug] ?? []
}

// Per-Stadt-metaHook (Lever 2): kurzer, unique lokaler Aufhaenger fuer die Meta-
// Description (seo.ts) statt des recycelten h1Sub -> killt near-duplicate-Snippets.
// Distilliert aus SEO_BODY, <=40 Z. Fehlt ein Slug -> Fallback auf city.h1Sub.
export const META_HOOKS: Record<string, string> = {
  aachen: 'Dreiländereck DE/NL/BE & Aachener Kreuz',
  dueren: 'Rur-Industriestadt an der A4',
  alsdorf: 'Ex-Bergbaustadt & A44-Logistikachse',
  wuerselen: 'A44/A4-Pendlerstadt im Aachener Norden',
  baesweiler: 'NL-Grenznähe & B57-Pendlerachse',
  eschweiler: 'Indetal-Hochwasser 2021 & A4',
  juelich: 'Forschungszentrum & A44/B56-Kreuz',
  stolberg: 'Vichtbach-Hochwasser & A4-Eifelrand',
  herzogenrath: 'Grenzstadt DE/NL & B57 Roermonder',
}
