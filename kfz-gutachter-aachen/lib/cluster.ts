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
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach DAT-Standard.', // 08n N1: Geo-Schwanz raus (Aaron)
  teamImg: '/assets/img/aachen/team-aachen.webp?v=2',
  svName: 'Markus', // Aachen-Cluster Persona (Vorname — CTA/Ueber-uns) — Aaron-Vorgabe 2026-06-09
  svSurname: 'Lennartz', // Aachen-Cluster Persona (Nachname — Person-Schema) — Aaron-Vorgabe 2026-06-09
  svSpezialitaet: 'Hochwasser-2021-Sachverständigung + DAT-Standard', // Differenzierung (Düren/Eschweiler/Stolberg)
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
export const SEO_TEXT: Record<string, string> = {
  aachen: `Aachen ist Krönungsstadt, Grenzstadt und Pendlerstadt zugleich. Wer hier in
einen unverschuldeten Unfall verwickelt wird — am Aachener Kreuz auf der A 4,
auf der Adenauerallee am Bahnhof oder in der Innenstadt rund um Dom und Markt
— braucht einen Sachverständigen, der die Region kennt und gerichtsfest
dokumentiert. Markus Lennartz, Kfz-Sachverständiger aus Aachen-Burtscheid,
ist meist binnen 60 Minuten bei Ihnen — egal ob Sie in Aachen-Mitte,
Frankenberger Viertel, Forst, Haaren, Eilendorf, Brand, Laurensberg oder
Richterich stehen. 0 € für Sie — die gegnerische Versicherung übernimmt die
Honorarkosten nach §249 BGB.

Aachen hat eine besondere Verkehrslage: Die Stadt liegt im Dreiländereck
Deutschland-Belgien-Niederlande, mit täglich tausenden Grenzpendlern und
einer eigenen Schadensdynamik. Auf der A 4 zwischen Aachener Kreuz und der
belgischen Grenze sind Auffahrunfälle im Berufsverkehr klassisch. Die A 44
verbindet Richtung Mönchengladbach und Düsseldorf — Knotenpunkt für
Pendler aus Alsdorf, Würselen und Jülich. Innerstädtisch dominiert die
Adenauerallee als Hauptverkehrsachse vom Hauptbahnhof Richtung Dom, mit
hohem Lieferverkehr und Bus-Verkehr.

Wer in Aachen einen Kfz-Gutachter sucht, sollte auf drei Dinge achten:
Neutralität, lokale Erfahrung und gerichtsfeste Dokumentation. Markus
arbeitet nach DAT- und BVSK-Standard, dokumentiert mit Lackmessgerät und
strukturierter Foto-Aufnahme, prüft Strukturschäden und ermittelt
Reparaturkosten, Wertminderung und Restwert nach belastbaren Marktdaten.
Das Gutachten liegt binnen 48 Stunden bei Ihnen, die Versicherungsregulierung
läuft parallel mit dem Claimondo-Partnernetzwerk.

Eine Besonderheit der Region: Schäden mit ausländischen Beteiligten — Belgier,
Niederländer, EU-Pendler. Hier braucht es Erfahrung im Umgang mit
ausländischen Versicherern, mit der Grünen Karte und dem Zentralruf der
Autoversicherer. Markus arbeitet seit Jahren mit BE- und NL-Versicherungen
zusammen und kennt die Regulierungswege. Wenn der Unfallverursacher aus
Lüttich, Maastricht oder Kerkrade kommt, ist das kein Problem — die
Schadensabwicklung läuft sauber über die internationalen Standards.

Aachen hat aber noch eine andere Besonderheit, die für die Schadens-Bewertung
wichtig ist: Markus Lennartz war als Sachverständiger 2021 nach dem
Hochwasser im Indetal — in Eschweiler, Stolberg und Düren — über Monate
mit Totalschäden und Wassergutachten beschäftigt. Wer in der Region nach
einer Sturzflut, einem Wasserschaden oder einem Unfall mit Hochwasser-
Folgekosten einen Gutachter braucht, ist bei ihm richtig. Hochwasser-Schäden
sind versicherungstechnisch ein eigenes Kapitel — hier zählt Erfahrung mit
Teilkaskoabwicklung und Wiederbeschaffungswert-Ermittlung.

Verkehrsschwerpunkte rund um Aachen: Das Aachener Kreuz (A 4 / A 44) ist
einer der wichtigsten Drehscheiben im Westen NRWs. Stop-and-Go im
Berufsverkehr, Spurwechsel-Manöver Richtung Köln, Belgien und
Mönchengladbach. Die A 4 Anschlussstelle Aachen-Mitte ist Hauptzubringer
in die Stadt, oft staureich. Innerstädtisch sind die Adalbertstraße und
die Pontstraße enge Achsen mit Tram-Verkehr und Park-Konflikten — typische
Innenstadt-Schadensorte. Der Europaplatz ist Drehscheibe für grenzüberschreitenden
Verkehr und entsprechend unfallträchtig.

Was viele Aachener nicht wissen: Sie haben das Recht auf einen unabhängigen
Sachverständigen Ihrer Wahl — nicht den, den die gegnerische Versicherung
schickt. Markus arbeitet ausschließlich in Ihrem Interesse und dokumentiert
so, dass die Versicherung sauber reguliert. Falls sie kürzt — etwa
Reparaturkosten zu niedrig ansetzt oder Wertminderung verweigert —, erstellen
wir auf Wunsch ein Gegengutachten. Auch das wird von der gegnerischen
Versicherung übernommen, nach BGH-Rechtsprechung.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche Karosserie- und
Lackbetriebe in der Region — von Aachen-Mitte über Burtscheid bis nach Brand
und Eilendorf. Sie sind nicht verpflichtet, die Werkstatt zu nehmen, die die
gegnerische Versicherung Ihnen empfiehlt. Auch hier gilt: gerichtsfestes
Gutachten als Basis, Werkstatt nach Ihrer Wahl.

Drei Schritte für die Schadensregulierung: 1) Sie melden sich telefonisch
oder über WhatsApp. 2) Markus kommt vor Ort, alle Stadtteile abgedeckt. 3)
Gutachten in 48 Stunden, Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Aachen — neutral, gerichtsfest, schnell vor Ort. Markus
Lennartz ist Ihr Ansprechpartner. Rufen Sie an oder schreiben Sie über
WhatsApp, und wir klären in 5 Minuten, wie es weitergeht.`,
  dueren: `Düren ist die Industriestadt im Westen Nordrhein-Westfalens — Papier,
Maschinenbau, Logistik prägen seit Jahrzehnten das Stadtbild. Verkehrslich
ist Düren mit der A 4-Anschlussstelle und der B 56 eine der wichtigsten
Drehscheiben zwischen Köln und Aachen. Wer hier in einen unverschuldeten
Unfall verwickelt wird, hat einen klaren Ansprechpartner: Markus Lennartz,
Kfz-Sachverständiger aus Aachen-Burtscheid, ist meist binnen 60 Minuten in
Düren-Mitte, Birkesdorf, Gürzenich, Lendersdorf, Niederau oder Rölsdorf. 0 €
für Sie — die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.

Düren hat ein verkehrsreiches Profil: Die A 4-Anschlussstelle Düren ist seit
Jahren staureich und besonders im Berufsverkehr Richtung Köln und Aachen
ein klassischer Auffahrunfall-Hotspot. Auch die A 4 Düren-Süd ist
betroffen — Pendler aus Niederzier und Inden steigen hier ein. Die B 56
durch die Stadt — die Aachener Landstraße — ist innerstädtische
Hauptverkehrsachse mit hohem Lieferverkehr. Die B 264 Köln-Düren-Aachen ist
alternative Hauptverbindung, mit eigenem Stau-Profil.

Eine Besonderheit von Düren: Die Veldener Straße im Industriegebiet ist seit
Jahrzehnten Heimat traditioneller Sachverständigenbüros. Wir respektieren das
— und bieten gleichzeitig etwas anderes: einen modernen, digitalen Ansatz
mit Sofort-Erreichbarkeit über WhatsApp, schneller Vor-Ort-Aufnahme und
Gutachten-Lieferung in 48 Stunden. Markus arbeitet nach DAT- und
BVSK-Standard, ist als Sachverständiger gerichtsfest und dokumentiert
strukturiert mit Lackmessgerät, Foto- und Maß-Aufnahme. Plus: das gesamte
Claimondo-Partnernetzwerk mit Verkehrsrechtsanwalt, Werkstatt-Vermittlung
und Mietwagenservice.

Düren ist eine besondere Region in der Schadens-Geschichte: 2021 traf das
Hochwasser im Indetal die Stadt mit voller Wucht. Hunderte Totalschäden,
Wassertotalschäden, Beschädigungen durch Schlamm und Geröll. Markus war damals
über Monate mit Hochwasser-Gutachten beschäftigt — in Birkesdorf, Gürzenich,
am Industriegebiet Distelrath und in Lendersdorf. Wer in der Region
versicherungstechnisch mit Hochwasser-Folgekosten zu tun hat oder einen
Sachverständigen mit dieser Erfahrung sucht, ist bei ihm richtig. Die
Teilkaskoabwicklung bei Wassertotalschäden ist ein eigenes Kapitel — Markus
kennt die Regulierungswege.

Verkehrsschwerpunkte in Düren: Die A 4-Anschlussstelle ist Hotspot Nr. 1.
Auffahrunfälle bei Stop-and-Go, Spurwechsel-Manöver beim Ausfahren — klassische
Profile. Die B 56 als Stadtdurchquerung ist innerstädtische
Hauptverkehrsachse mit Bus-, Fahrrad- und Pkw-Mischverkehr. Die Schoellerstraße
und die Aachener Straße sind innerstädtische Achsen mit hohem Park-Aufkommen.
Im Industriegebiet Distelrath kommt Logistik-Verkehr hinzu, Lkw und
Sondertransporte — eigene Schadens-Profile.

Ein typischer Schadenstyp in Düren: Auffahrunfall an der A 4-Anschlussstelle
im Berufsverkehr Richtung Köln. Markus dokumentiert den Heckschaden
strukturiert, prüft auch versteckte Schäden im Heckblech und Kofferraumboden,
ermittelt Wertminderung nach Marktdaten. Bei jüngeren Fahrzeugen ist die
Wertminderung oft höher als die Versicherung zugestehen möchte. Markus
dokumentiert so, dass die Versicherung nicht einfach kürzen kann.

Was viele Dürener nicht wissen: Sie haben das Recht auf einen unabhängigen
Sachverständigen Ihrer Wahl. Die gegnerische Versicherung schickt manchmal
schnell einen eigenen Gutachter — der arbeitet aber für die Versicherung,
nicht für Sie. Markus ist Ihr Sachverständiger, ausschließlich in Ihrem
Interesse. Plus: bei Bedarf erstellen wir auf Wunsch ein Gegengutachten,
wenn die gegnerische Versicherung die Schadenshöhe kürzt. Auch das wird
übernommen.

Werkstattwahl in Düren bleibt Ihr Recht. Markus kennt Karosserie- und
Lackbetriebe in Düren-Mitte, Birkesdorf und am Industriegebiet — vom freien
Fachbetrieb bis zur Markenwerkstatt. Wenn Sie keine eigene Werkstatt haben,
vermittelt er gerne. Die Werkstatt rechnet auf Basis des Gutachtens ab. Sie
behalten die Wahl.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten in Düren, alle Stadtteile abgedeckt. 3) Gutachten in 48 Stunden,
Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Düren — modern, digital, gerichtsfest. Markus Lennartz ist
Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, ob ein
Sachverständiger sinnvoll ist und wie es weitergeht.`,
  alsdorf: `Alsdorf, nordöstlich von Aachen, war über Jahrzehnte vom Steinkohle-Bergbau
geprägt und hat sich nach dem Strukturwandel zur Wohn- und Logistikstadt
entwickelt. Verkehrlich ist Alsdorf über die A 44 mit Aachen und über die
L 240 mit dem Mariadorf-Industriegebiet gut angebunden. Wer hier in einen
unverschuldeten Unfall geraten ist, hat einen klaren Ansprechpartner:
Markus Lennartz, Kfz-Sachverständiger aus Aachen-Burtscheid, ist meist
binnen 60 Minuten bei Ihnen in Alsdorf-Mitte, Schaufenberg, Hoengen oder
Mariadorf. 0 € für Sie — die gegnerische Versicherung übernimmt die
Honorarkosten nach §249 BGB.

Alsdorf hat vier Stadtteile mit jeweils eigener Schadens-Identität.
Alsdorf-Mitte ist Verwaltungs- und Einkaufszentrum mit der Annakirche,
klassische Innenstadt-Dynamik mit Park-Remplern und Innenstadt-Konflikten.
Schaufenberg ist Wohngebiet, Hoengen liegt westlich und ist klassisch
Pendler-orientiert. Mariadorf im Osten ist Industriegebiet — hier kommen
Flotten- und Logistik-Schäden hinzu.

Wer in Alsdorf einen Kfz-Sachverständigen braucht, sollte auf drei Dinge
achten: Neutralität, lokale Erfahrung und gerichtsfeste Dokumentation.
Markus arbeitet nach DAT- und BVSK-Standard, dokumentiert mit Lackmessgerät
und Foto-Setup, prüft Strukturschäden und ermittelt Wertminderung und
Restwert nach belastbaren Marktdaten. Das Gutachten ist binnen 48 Stunden
bei Ihnen — die Versicherungsregulierung läuft parallel mit dem
Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Alsdorf: Die A 44 Anschlussstelle Alsdorf ist
Hauptzubringer Richtung Aachen und Mönchengladbach — entsprechend hoher
Pendlerverkehr im Berufsverkehr. Auffahrunfälle bei Stop-and-Go sind
klassisch. Die L 240 verbindet Richtung Mariadorf-Industriegebiet, mit
Lkw- und Flottenverkehr. Die B 264 Industriestraße ist Achsen für
Schwerlastverkehr — eigene Schadens-Profile.

Ein typischer Schadenstyp in Alsdorf: Auffahrunfall an der A 44
Anschlussstelle im Berufsverkehr Richtung Aachen. Markus dokumentiert den
Heckschaden strukturiert, prüft Strukturschäden im Heckblech und ermittelt
Wertminderung nach Marktdaten. Bei Flottenfahrzeugen aus dem
Mariadorf-Industriegebiet kommt die Frage hinzu, wie Firmenversicherung und
gegnerische Haftpflicht zusammenspielen — Markus dokumentiert so, dass
beide Seiten sauber abrechnen können.

Was viele Alsdorfer nicht wissen: Auch bei Schäden durch ausländische
Beteiligte — und in der Region kommen niederländische und belgische
Pendler vor — gibt es klare Regulierungsabläufe. Über die Grüne Karte und
den Zentralruf der Autoversicherer kann der Schaden auch bei nicht-deutschen
Beteiligten abgewickelt werden. Markus und das Claimondo-Netzwerk kennen die
Wege und übernehmen die Abwicklung.

Ein weiterer Punkt, der gerade nach Auffahrunfällen wichtig ist: Die
Wertminderung. Bei jüngeren Fahrzeugen kann ein Auffahrunfall zu einem
merkantilen Minderwert führen — also einer dauerhaften Wertreduzierung,
auch nach fachgerechter Reparatur. Versicherungen zahlen diese Wertminderung
oft nicht freiwillig. Markus berechnet sie sauber und dokumentiert so, dass
die gegnerische Versicherung sie auch zahlen muss.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche
Karosseriefachbetriebe und Lackiererien in Alsdorf-Mitte und Mariadorf —
vom freien Betrieb bis zur Markenwerkstatt. Wenn Sie keine eigene Werkstatt
haben, vermittelt er gerne. Sie sind nicht verpflichtet, die Werkstatt zu
nehmen, die die gegnerische Versicherung empfiehlt.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten in Alsdorf, alle Stadtteile abgedeckt. 3) Gutachten in 48 Stunden,
Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Alsdorf — neutral, gerichtsfest, schnell vor Ort. Markus
Lennartz ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  wuerselen: `Würselen liegt direkt nordöstlich von Aachen und ist klassische
Pendlerstadt mit Bildungs- und Wohnschwerpunkt. Über die A 44 und die A 4
ist die Stadt eng mit Aachen und Köln verbunden, die L 12 als Aachener
Straße ist innerstädtische Hauptverkehrsachse. Wer hier in einen
unverschuldeten Unfall verwickelt wird, hat einen klaren Ansprechpartner:
Markus Lennartz, Kfz-Sachverständiger aus Aachen-Burtscheid, ist meist binnen
60 Minuten bei Ihnen in Würselen-Mitte, Bardenberg oder Broichweiden. 0 €
für Sie — die gegnerische Versicherung übernimmt die Honorarkosten nach
§249 BGB.

Würselen hat drei größere Stadtteile mit unterschiedlicher Schadens-Dynamik.
Würselen-Mitte ist Verwaltungs- und Einkaufszentrum mit der Kaiserstraße als
Hauptachse — hier dominieren Innenstadt-Rempler und Konflikte mit Bus- und
Fahrradverkehr. Bardenberg westlich ist Wohngebiet mit eigener
Identität — klassische Wohnschäden, Park-Rempler an Schulen und Kitas.
Broichweiden östlich ist ländlicher geprägt, mit höherem Anteil an
Pendlerschäden und Wildunfällen Richtung Bergisches Land.

Wer in Würselen einen Kfz-Gutachter sucht, sollte auf drei Dinge achten:
Neutralität, lokale Erfahrung und gerichtsfeste Dokumentation. Markus
arbeitet nach DAT- und BVSK-Standard, dokumentiert strukturiert mit
Lackmessgerät und Foto-Aufnahme, prüft Strukturschäden und ermittelt
Reparaturkosten, Wertminderung und Restwert nach belastbaren Marktdaten.
Das Gutachten liegt binnen 48 Stunden bei Ihnen — die Versicherungsregulierung
läuft parallel mit dem Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Würselen: Die A 44 Anschlussstelle Würselen
ist direkter Aachen-Verbinder mit hohem Pendlerverkehr im Berufsverkehr —
klassische Auffahrunfall-Strecke. Die A 4 Anschlussstelle Würselen-West
verbindet Richtung Köln und ist ebenfalls staureich. Innerörtlich ist die
L 12 Aachener Straße Hauptverkehrsachse mit Mischverkehr aus Pkw, Bus und
Fahrrad.

Ein typischer Schadenstyp in Würselen: Auffahrunfall an der A 44 im
Berufsverkehr nach Aachen. Markus dokumentiert den Heckschaden strukturiert,
prüft Strukturschäden und ermittelt Wertminderung. Bei jüngeren Fahrzeugen
ist der merkantile Minderwert oft höher, als die Versicherung freiwillig
zugesteht — hier zählt die saubere Berechnung. Auch Schäden mit Bildungsbus-
oder Schüler-Beteiligung sind in Würselen nicht selten, gerade in Schulnähe
in Würselen-Mitte und Bardenberg.

Was viele Würselener nicht wissen: Auch die Anwaltskosten übernimmt die
gegnerische Versicherung bei unverschuldetem Unfall. Sie zahlen 0 € für
Gutachter, Anwalt, Mietwagen und Mietwagenkostenversicherung. Markus und das
Claimondo-Partnernetzwerk vermitteln einen Verkehrsrechtsanwalt aus der
Region, der den Fall sauber abwickelt — von der Schadensmeldung bis zur
Auszahlung. Sie behalten den Überblick, ohne den Aufwand zu haben.

Bei Schäden mit ausländischen Beteiligten — Niederländer aus Heerlen und
Kerkrade sind in der Region häufig — gibt es klare Regulierungswege.
Markus arbeitet seit Jahren mit BE- und NL-Versicherungen zusammen und kennt
die Standards. Wenn der Unfallverursacher aus dem Ausland kommt, ist das
kein Problem — die Schadensabwicklung läuft über die internationalen Wege.

Werkstattwahl bleibt Ihr Recht. Markus kennt Karosserie- und Lackbetriebe in
Würselen-Mitte und Bardenberg — vom freien Fachbetrieb bis zur
Markenwerkstatt. Wenn Sie keine eigene Werkstatt haben, vermittelt er
gerne. Sie sind nicht verpflichtet, die Werkstatt zu nehmen, die die
gegnerische Versicherung empfiehlt — das ist Ihr Recht nach BGH-Rechtsprechung.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten in Würselen, alle Stadtteile abgedeckt. 3) Gutachten in 48 Stunden,
Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Würselen — neutral, gerichtsfest, schnell vor Ort. Markus
Lennartz ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  baesweiler: `Baesweiler liegt nördlich von Aachen in unmittelbarer Grenznähe zu den
Niederlanden und ist klassische Pendlerstadt mit eigenen
Logistik- und Industriestandorten. Verkehrlich ist die Stadt über die B 57
und die L 240 angebunden, dazu kommt die Nähe zur niederländischen Grenze
und damit täglicher grenzüberschreitender Verkehr. Wer hier in einen
unverschuldeten Unfall verwickelt wird, hat einen klaren Ansprechpartner:
Markus Lennartz, Kfz-Sachverständiger aus Aachen-Burtscheid, ist meist binnen
60 Minuten bei Ihnen in Baesweiler-Mitte, Setterich oder Oidtweiler. 0 € für
Sie — die gegnerische Versicherung übernimmt die Honorarkosten nach §249 BGB.

Baesweiler hat drei Stadtteile mit jeweils eigener Schadens-Identität.
Baesweiler-Mitte ist Verwaltungs- und Einkaufszentrum, hier dominieren
Innenstadt-Rempler. Setterich südlich ist Wohngebiet, Oidtweiler westlich
ist ländlicher geprägt mit Pendlerverkehr Richtung Niederlande. Die ehemalige
Bergbau-Vergangenheit hat das Industrieprofil der Stadt bis heute geprägt —
Logistik und Wohnstadt im Wechsel.

Wer in Baesweiler einen Kfz-Sachverständigen braucht, sollte auf eines
besonders achten: Erfahrung mit grenzüberschreitenden Schäden. Markus
arbeitet seit Jahren mit niederländischen Versicherungen zusammen und kennt
die Regulierungswege über die Grüne Karte und den Zentralruf der
Autoversicherer. Wenn der Unfallverursacher aus Geilenkirchen, Heinsberg
oder aus Kerkrade oder Heerlen kommt, ist das kein Problem — die
Schadensabwicklung läuft sauber über die internationalen Standards.

Plus die Standard-Disziplin: Markus arbeitet nach DAT- und BVSK-Standard,
dokumentiert mit Lackmessgerät und strukturierter Foto-Aufnahme, prüft
Strukturschäden und ermittelt Reparaturkosten, Wertminderung und Restwert
nach belastbaren Marktdaten. Das Gutachten liegt binnen 48 Stunden bei Ihnen
— die Versicherungsregulierung läuft parallel mit dem
Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Baesweiler: Die B 57 Aachener Straße ist
Hauptverkehrsachse Nord-Süd, mit hohem Pendlerverkehr Richtung Aachen und
Heinsberg. Die L 240 Industriestraße ist Logistik-Achse — hier kommt
Schwerlastverkehr mit eigenen Schadens-Profilen ins Spiel. Die Grenznähe NL
erzeugt eine Besonderheit: Niederländische Fahrzeuge sind im Stadtbild
häufig, mit entsprechend grenzüberschreitenden Schäden.

Ein typischer Schadenstyp in Baesweiler: Auffahrunfall mit niederländischer
Beteiligung auf der B 57 im Berufsverkehr. Markus dokumentiert den
Heckschaden strukturiert, ermittelt Wertminderung und Restwert nach
deutschen Standards und sorgt dafür, dass die niederländische
Versicherung sauber reguliert. Über den Zentralruf der Autoversicherer wird
der Schaden an die niederländische Haftpflicht weitergeleitet, mit klaren
Fristen und Standards. Das Gutachten ist auch international anerkannt — DAT-
und BVSK-Standard sind in der EU akzeptiert.

Was viele Baesweiler nicht wissen: Auch bei Schäden mit ausländischen
Beteiligten gilt das Recht auf einen eigenen, unabhängigen
Sachverständigen. Sie müssen nicht den Gutachter nehmen, den die
niederländische Versicherung Ihnen empfiehlt. Markus arbeitet ausschließlich
in Ihrem Interesse — das gilt grenzüberschreitend.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche Karosserie- und
Lackbetriebe in Baesweiler-Mitte und Setterich — vom freien Fachbetrieb bis
zur Markenwerkstatt. Wenn Sie keine eigene Werkstatt haben, vermittelt er.
Sie behalten die Wahl.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten in Baesweiler, alle Stadtteile inklusive Setterich. 3) Gutachten
in 48 Stunden, Versicherungsabwicklung läuft parallel — auch bei
grenzüberschreitenden Schäden. 0 € für Sie.

Kfz-Gutachter Baesweiler — neutral, gerichtsfest, schnell vor Ort. Markus
Lennartz ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  eschweiler: `Eschweiler ist mit rund 56.000 Einwohnern eine der größten Städte im
Aachen-Cluster und hat eine bewegte Schadens-Geschichte: 2021 traf das
Hochwasser im Indetal die Stadt mit voller Wucht. Hunderte Totalschäden,
Wassertotalschäden, Beschädigungen durch Schlamm und Geröll — bis heute
prägt das die Versicherungs- und Sachverständigen-Landschaft. Markus
Lennartz war damals über Monate vor Ort und kennt die Hochwasser-Schäden
der Region wie kaum ein anderer Sachverständiger. Wer in Eschweiler einen
Kfz-Gutachter sucht, ist bei ihm richtig — egal ob klassischer Auffahrunfall
oder Wasserschaden mit komplizierter Versicherungsabwicklung. 0 € für Sie —
die gegnerische Versicherung übernimmt die Honorarkosten nach §249 BGB.

Eschweiler hat vier größere Stadtteile mit eigener Schadens-Dynamik.
Eschweiler-Mitte ist Verwaltungs- und Einkaufszentrum mit der Indestraße
als Hauptachse — klassische Innenstadt-Dynamik. Weisweiler ist Kraftwerk-
Stadtteil und hat eine ganz andere Schadens-Identität mit
Industrieverkehr und Sondertransporten. Dürwiß und Nothberg sind Wohngebiete
mit Pendlerschwerpunkt und klassischen Innenstadt-Schäden.

Wer in Eschweiler einen Kfz-Sachverständigen braucht, sollte auf die
Hochwasser-Erfahrung achten. Das Hochwasser 2021 hat eine eigene
versicherungstechnische Komplexität geschaffen: Wassertotalschäden bei
Teilkasko, Beweisführung über Schlamm- und Geröll-Spuren, Bewertung von
Folgeschäden an Elektronik und Lager. Markus hat damals hunderte solcher
Gutachten erstellt und kennt die Regulierungswege. Bei aktuellen Schäden mit
Wasser- oder Hochwasser-Bezug — etwa nach Starkregen-Ereignissen, die
weiterhin regelmäßig auftreten — ist diese Erfahrung gold wert.

Plus die Standard-Disziplin: Markus arbeitet nach DAT- und BVSK-Standard,
dokumentiert mit Lackmessgerät und strukturierter Foto-Aufnahme, prüft
Strukturschäden und ermittelt Reparaturkosten, Wertminderung und Restwert
nach belastbaren Marktdaten. Das Gutachten liegt binnen 48 Stunden bei
Ihnen — die Versicherungsregulierung läuft parallel mit dem Claimondo-
Partnernetzwerk.

Verkehrsschwerpunkte rund um Eschweiler: Die A 4 Anschlussstelle Eschweiler
ist Hauptzubringer mit hohem Pendleraufkommen Richtung Aachen und Köln.
Stop-and-Go im Berufsverkehr ist klassisch. Die Indestraße als
Stadtdurchquerung ist innerstädtische Hauptverkehrsachse mit
Mischverkehr aus Pkw, Bus und Fahrrad. Die Hauptstraße verbindet die
Innenstadt mit den Wohngebieten und ist Schwerpunkt für Innenstadt-Rempler.

Ein typischer Schadenstyp in Eschweiler — abseits klassischer Auffahrunfälle:
Wasserschaden nach Starkregen. Das Fahrzeug stand auf einer überfluteten
Straße, Wasser ist in den Motor- oder Innenraum eingedrungen,
Folgeschäden an Elektronik sind drohend. Markus dokumentiert die
Wassereinwirkung sauber und ermittelt den Schaden so, dass die Teilkasko
oder die gegnerische Haftpflicht (bei Verkehrsverursachung) sauber
reguliert. Auch der Wiederbeschaffungswert bei Totalschäden wird belastbar
berechnet.

Was viele Eschweiler nicht wissen: Bei Hochwasser-Schäden gibt es klare
Beweisregeln. Die Versicherung verlangt häufig Nachweise über die Wasserlage,
den Verbleib auf der Straße und die Schadenshöhe. Markus dokumentiert
strukturiert mit Foto-Belegen, Pegelständen und Schadensspuren — so dass die
Versicherung sauber reguliert. Falls die Versicherung kürzt — etwa
Wiederbeschaffungswert zu niedrig ansetzt —, erstellen wir auf Wunsch ein
Gegengutachten.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche Karosserie-,
Lack- und Elektronik-Fachbetriebe in Eschweiler-Mitte und Weisweiler — vom
freien Fachbetrieb bis zur Markenwerkstatt. Auch Spezialwerkstätten für
Wassertotalschäden mit Trocknungs- und Elektronik-Diagnose-Erfahrung sind
im Netzwerk vermittelbar.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten, alle Stadtteile inklusive Weisweiler. 3) Gutachten in 48 Stunden,
Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Eschweiler — Hochwasser-Erfahrung 2021, gerichtsfest, schnell
vor Ort. Markus Lennartz ist Ihr Ansprechpartner. Wir klären in 5 Minuten am
Telefon, wie es weitergeht.`,
  juelich: `Jülich ist Forschungs- und Geschichts-Stadt zugleich: Das Forschungszentrum
Jülich ist eine der größten interdisziplinären Forschungseinrichtungen in
Europa, gleichzeitig prägt die historische Zitadelle und der Hexenturm das
Stadtbild. Verkehrlich ist Jülich über die A 44 mit Aachen und über die
B 56 mit Düren verbunden. Wer hier in einen unverschuldeten Unfall geraten
ist, hat einen klaren Ansprechpartner: Markus Lennartz, Kfz-Sachverständiger
aus Aachen-Burtscheid, ist meist binnen 60 Minuten bei Ihnen in
Jülich-Mitte, Stetternich, Selgersdorf oder Koslar. 0 € für Sie — die
gegnerische Versicherung übernimmt das Honorar nach §249 BGB.

Jülich hat vier Stadtteile mit unterschiedlicher Schadensdynamik.
Jülich-Mitte ist Verwaltungs- und Einkaufszentrum mit der Zitadelle als
historischem Anker, hier dominieren Innenstadt-Rempler. Stetternich östlich
ist Forschungszentrum-Stadtteil mit hohem Berufspendlerverkehr aus
Deutschland und dem Ausland — Wissenschaftler und Mitarbeiter aus
verschiedenen Ländern erzeugen eine internationale Schadens-Lage. Selgersdorf
westlich und Koslar südlich sind Wohngebiete mit Pendlerprofil.

Wer in Jülich einen Kfz-Gutachter braucht, sollte auf drei Dinge achten:
Neutralität, lokale Erfahrung und gerichtsfeste Dokumentation. Markus
arbeitet nach DAT- und BVSK-Standard, dokumentiert mit Lackmessgerät und
Foto-Aufnahme, prüft Strukturschäden und ermittelt Wertminderung und
Restwert nach belastbaren Marktdaten. Das Gutachten liegt binnen 48 Stunden
bei Ihnen — die Versicherungsregulierung läuft parallel mit dem
Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Jülich: Die A 44 Anschlussstelle Jülich ist
Hauptzubringer Richtung Aachen mit hohem Forschungs- und Pendlerverkehr —
typische Auffahrunfall-Strecke im Berufsverkehr. Die B 56 Aachener
Landstraße ist Hauptverkehrsachse Richtung Düren und Aachen, mit hohem
Lieferverkehr. Die L 241 Düren-Jülich ist Pendlerstrecke zwischen den
beiden Städten — eigene Schadens-Profile.

Eine Besonderheit in Jülich: Internationale Beteiligte. Mitarbeiter des
Forschungszentrums kommen aus aller Welt, mit entsprechenden internationalen
Versicherungsbeziehungen. Markus arbeitet auch mit nicht-deutschen
Versicherungen zusammen und kennt die internationalen Regulierungswege.
Plus die regionale Nähe zu den Niederlanden und Belgien — auch hier sind
grenzüberschreitende Schäden nicht selten.

Ein typischer Schadenstyp in Jülich: Auffahrunfall auf der A 44 im
Berufsverkehr Richtung Aachen. Markus dokumentiert den Heckschaden
strukturiert, prüft Strukturschäden und ermittelt Wertminderung nach
Marktdaten. Bei jüngeren Fahrzeugen ist der merkantile Minderwert oft höher,
als die Versicherung freiwillig zugesteht. Markus dokumentiert so, dass die
Versicherung nicht einfach kürzen kann. Falls sie es doch tut, erstellen wir
auf Wunsch ein Gegengutachten.

Was viele Jülicher nicht wissen: Sie haben das Recht auf einen
unabhängigen Sachverständigen Ihrer Wahl. Die gegnerische Versicherung
schickt manchmal einen eigenen Gutachter — der arbeitet aber für die
Versicherung, nicht für Sie. Markus ist ausschließlich in Ihrem Interesse
tätig, dokumentiert gerichtsfest und liefert ein neutrales Gutachten.

Plus: Bei Schäden mit Hochwasser- oder Wasserbezug — die im Indetal nach
2021 weiterhin regelmäßig vorkommen — bringt Markus die spezifische
Erfahrung mit. Wassertotalschäden, Folgeschäden an Elektronik,
Schlammspuren als Beweis — alles strukturiert dokumentiert.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche Karosserie- und
Lackbetriebe in Jülich-Mitte, Stetternich und Selgersdorf. Wenn Sie keine
eigene Werkstatt haben, vermittelt er gerne.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten in Jülich, alle Stadtteile inklusive Forschungszentrum-Umfeld.
3) Gutachten in 48 Stunden, Versicherungsabwicklung läuft parallel. 0 €.

Kfz-Gutachter Jülich — neutral, gerichtsfest, schnell vor Ort. Markus
Lennartz ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  stolberg: `Stolberg ist mit rund 57.000 Einwohnern eine der größten Städte im
Aachen-Cluster und hat ebenso wie Eschweiler eine Hochwasser-Geschichte:
2021 traf das Hochwasser auch Stolberg massiv, vor allem die Vichtbach- und
Indetal-Lage. Hunderte Schäden, Totalschäden, Wassergutachten. Wer hier
einen erfahrenen Sachverständigen braucht — egal ob für einen klassischen
Auffahrunfall oder einen Wasserschaden mit komplizierter Versicherungs-
abwicklung — ist bei Markus Lennartz richtig. Der Kfz-Sachverständige aus
Aachen-Burtscheid ist meist binnen 60 Minuten bei Ihnen in Stolberg-Mitte,
Atsch, Münsterbusch oder Vicht. 0 € für Sie — die gegnerische Versicherung
übernimmt das Honorar nach §249 BGB.

Stolberg hat vier größere Stadtteile mit eigener Schadens-Identität.
Stolberg-Mitte mit der historischen Altstadt und der Burg ist Touristen-
und Kultur-Schwerpunkt — Park-Rempler in den engen Altstadtgassen sind
klassisch. Atsch südlich ist Industriegebiet, geprägt von der ehemaligen
Buntmetall-Industrie — hier dominieren Logistik- und Flotten-Schäden.
Münsterbusch westlich ist Wohngebiet, Vicht im Süden ist Eifel-Vorland mit
Wildunfall-Risiko.

Wer in Stolberg einen Kfz-Sachverständigen braucht, sollte auf die
Hochwasser-Erfahrung achten. Markus war 2021 monatelang vor Ort und kennt
die Schadens-Lage der Vichtbach- und Indetal-Region wie kaum ein anderer
Sachverständiger. Wassertotalschäden, Folgeschäden an Elektronik, Beweisführung
über Schlamm- und Geröll-Spuren — alles strukturiert dokumentiert nach DAT-
und BVSK-Standard.

Plus die Standard-Disziplin: Markus arbeitet nach DAT- und BVSK-Standard,
dokumentiert mit Lackmessgerät und strukturierter Foto-Aufnahme, prüft
Strukturschäden und ermittelt Reparaturkosten, Wertminderung und Restwert
nach belastbaren Marktdaten. Das Gutachten liegt binnen 48 Stunden bei Ihnen.

Verkehrsschwerpunkte rund um Stolberg: Die A 4 Anschlussstelle Stolberg ist
zentraler Zubringer Richtung Aachen und Köln, mit hohem Pendleraufkommen im
Berufsverkehr — klassisches Auffahrunfall-Profil. Die B 258 als Hauptstraße
durch die Stadt ist innerstädtische Hauptverkehrsachse mit hohem
Pendler- und Lieferverkehr. Die L 238 Eschweilerer Straße verbindet
Richtung Eschweiler. In der Altstadt sind die engen Gassen rund um die Burg
Schwerpunkt für Park-Konflikte und Touristen-Rempler.

Ein typischer Schadenstyp in Stolberg: Wasserschaden nach Starkregen,
Auffahrunfall am A 4-Anschluss oder Wildunfall in Vicht-Eifel-Vorland.
Markus dokumentiert je nach Schadensart strukturiert — bei Wasserschäden mit
Pegelstand-Belegen und Schadensspuren, bei Auffahrunfällen mit Strukturschäden
und Wertminderungs-Berechnung, bei Wildunfällen mit Wildhärchen- und
Aufprall-Dokumentation für die Teilkasko-Abwicklung.

Was viele Stolberger nicht wissen: Bei Hochwasser-Folgeschäden — die auch
Jahre nach 2021 noch auftreten — gibt es klare Beweisregeln. Wenn
Korrosionsschäden oder Elektronik-Folgeschäden erst später sichtbar werden,
können sie unter Umständen noch reguliert werden. Markus dokumentiert so,
dass die Versicherung sauber reguliert. Auch bei Wildunfällen ist die
saubere Aufnahme der Schadensspur entscheidend für die Teilkasko-Abwicklung.

Eine Besonderheit für Stolberg: Da die Suchanfrage "kfz gutachter stolberg"
in der Region weniger geläufig ist als "kfz sachverständiger stolberg",
arbeiten wir oft auch unter dem Begriff Kfz-Sachverständiger. Das ist
dasselbe — die rechtliche Stellung ist identisch, das Gutachten ist
gerichtsfest und DAT-/BVSK-Standard.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche Karosserie- und
Lackbetriebe in Stolberg-Mitte und Atsch — vom freien Fachbetrieb bis zur
Markenwerkstatt. Auch Spezialwerkstätten für Wassertotalschäden mit
Trocknungs- und Elektronik-Diagnose-Erfahrung sind im Netzwerk vermittelbar.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten, alle Stadtteile inklusive Atsch und Vicht. 3) Gutachten in
48 Stunden, Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Sachverständiger Stolberg — Hochwasser-Erfahrung 2021, gerichtsfest,
schnell vor Ort. Markus Lennartz ist Ihr Ansprechpartner. Wir klären in
5 Minuten am Telefon, wie es weitergeht.`,
  herzogenrath: `Herzogenrath ist die Grenzstadt par excellence: Direkt an der niederländischen
Grenze gelegen, mit dem Eurodepartement Kerkrade quasi zusammengewachsen,
prägt der grenzüberschreitende Verkehr die Stadt mehr als jedes andere
Element. Wer hier in einen unverschuldeten Unfall verwickelt wird — auf der
A 4 Anschlussstelle Herzogenrath, auf der B 57 Roermonder Straße oder im
Stadtkern rund um die Burg Rode —, braucht einen Sachverständigen, der die
internationale Schadens-Abwicklung kennt. Markus Lennartz, Kfz-Sachverständiger
aus Aachen-Burtscheid, ist meist binnen 60 Minuten bei Ihnen in
Herzogenrath-Mitte, Kohlscheid oder Merkstein. 0 € für Sie — die gegnerische
Versicherung übernimmt das Honorar nach §249 BGB.

Herzogenrath hat drei größere Stadtteile mit jeweils eigener
Schadensdynamik. Herzogenrath-Mitte mit der Burg Rode als historischem
Anker ist Verwaltungs- und Einkaufszentrum mit klassischer Innenstadt-Dynamik
und Park-Remplern. Kohlscheid südlich ist Wohngebiet, Merkstein nördlich
liegt direkt an der niederländischen Grenze und hat entsprechend hohen
grenzüberschreitenden Verkehr.

Wer in Herzogenrath einen Kfz-Sachverständigen sucht, sollte auf eines
besonders achten: Erfahrung mit grenzüberschreitenden Schäden. Markus
arbeitet seit Jahren mit niederländischen Versicherungen zusammen und kennt
die Regulierungswege über die Grüne Karte und den Zentralruf der
Autoversicherer. Wenn der Unfallverursacher aus Kerkrade, Heerlen oder
Maastricht kommt, ist das kein Problem — die Schadensabwicklung läuft sauber
über die internationalen Standards.

Plus die Standard-Disziplin: Markus arbeitet nach DAT- und BVSK-Standard,
dokumentiert mit Lackmessgerät und strukturierter Foto-Aufnahme, prüft
Strukturschäden und ermittelt Reparaturkosten, Wertminderung und Restwert
nach belastbaren Marktdaten. Das Gutachten liegt binnen 48 Stunden bei Ihnen
— die Versicherungsregulierung läuft parallel mit dem
Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Herzogenrath: Die A 4 Anschlussstelle
Herzogenrath ist Hauptzubringer Richtung Köln und Aachen mit hohem
Pendlerverkehr — Auffahrunfälle bei Stop-and-Go sind klassisch. Die B 57
Roermonder Straße ist Hauptverkehrsachse Richtung Niederlande und entsprechend
unfallträchtig. Innerstädtisch sind die engen Gassen rund um die Burg
Schwerpunkt für Innenstadt-Rempler.

Eine Besonderheit für die Region: Die Eurogebiet-Grenze zu Kerkrade ist
quasi unsichtbar — niederländische und deutsche Fahrzeuge sind im
Stadtbild gleichermaßen häufig. Bei Schäden mit niederländischer Beteiligung
gilt: Sie haben das Recht auf einen eigenen, unabhängigen Sachverständigen,
auch wenn die gegnerische Versicherung in NL sitzt. Markus arbeitet
ausschließlich in Ihrem Interesse — das gilt grenzüberschreitend.

Ein typischer Schadenstyp in Herzogenrath: Auffahrunfall auf der A 4 oder
B 57 mit niederländischer Beteiligung. Markus dokumentiert den Heckschaden
strukturiert, ermittelt Wertminderung und Restwert nach deutschen
Standards. Über den Zentralruf der Autoversicherer wird der Schaden an die
niederländische Haftpflicht weitergeleitet, mit klaren Fristen.

Was viele Herzogenrather nicht wissen: Auch bei Schäden mit ausländischen
Beteiligten gilt das Recht auf einen eigenen Sachverständigen. Sie müssen
nicht den Gutachter nehmen, den die niederländische Versicherung Ihnen
empfiehlt. Das ist Ihr Recht nach EU-Standard. Markus dokumentiert so, dass
die Versicherung — egal ob deutsch oder niederländisch — sauber reguliert.

Wichtig zu wissen: In Herzogenrath ist der Sachverständigen-Markt eng und
wettbewerbsintensiv. Wir bieten einen klaren Mehrwert: schnelle
Vor-Ort-Aufnahme, Gutachten in 48 Stunden, Versicherungsabwicklung über
das Claimondo-Partnernetzwerk inklusive Anwalt und Mietwagen — alles
kostenfrei für Sie.

Werkstattwahl bleibt Ihr Recht. Markus kennt verlässliche Karosserie- und
Lackbetriebe in Herzogenrath-Mitte und Kohlscheid — vom freien Fachbetrieb
bis zur Markenwerkstatt. Wenn Sie keine eigene Werkstatt haben, vermittelt
er gerne.

Drei Schritte: 1) Anruf oder WhatsApp an Markus. 2) Vor-Ort-Termin binnen
60 Minuten, alle Stadtteile inklusive Merkstein. 3) Gutachten in 48 Stunden,
Versicherungsabwicklung läuft parallel — auch bei niederländischer
Beteiligung. 0 € für Sie.

Kfz-Gutachter Herzogenrath — neutral, gerichtsfest, schnell vor Ort, auch
bei Grenzschäden. Markus Lennartz ist Ihr Ansprechpartner. Wir klären in
5 Minuten am Telefon, wie es weitergeht.`,
}

export function seoTextFor(slug: string): string {
  return SEO_TEXT[slug] ?? ''
}
