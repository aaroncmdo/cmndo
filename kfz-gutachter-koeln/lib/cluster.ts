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
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach DAT-Standard.', // 08n N1: Geo-Schwanz raus (Aaron)
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
  koeln: `Ein Unfall in Köln passiert schnell — am Heumarer Dreieck, auf der Zoobrücke,
im Stop-and-Go auf der A 1. Wenn Sie unverschuldet beteiligt sind, brauchen
Sie einen neutralen Kfz-Gutachter, der gerichtsfest dokumentiert und Sie
durch die Versicherungsregulierung begleitet. Stefan Wagner, Kfz-Sachverständiger
aus Köln-Lindenthal, ist meist binnen 60 Minuten bei Ihnen — egal ob Sie in
Ehrenfeld, Nippes, Mülheim oder Porz stehen. Sein Versprechen: 0 € für Sie.
Die gegnerische Versicherung übernimmt die Honorarkosten nach §249 BGB.

Köln ist groß, aber als Sachverständiger denken Sie schnell in Stadtteilen:
Die Innenstadt mit Barbarossaplatz und Rudolfplatz hat eine andere
Schadensdynamik als die Außenbezirke Chorweiler oder Porz. In der Neustadt-Süd
und im Belgischen Viertel dominieren Park-Rempler, Tür-Öffner-Schäden und
Konflikte mit KVB-Trams. Auf den Ringen und am Heumarer Dreieck reden wir
über Auffahrunfälle aus dem zähen Verkehr. In Lindenthal, Sülz und Klettenberg
sind es häufig Schäden vor Schulen und Kitas, in Mülheim und Kalk dominieren
Innenstadtachsen mit hohem Lieferverkehr. Stefan kennt die Strecken, weil er
hier wohnt und arbeitet.

Wenn Sie nach einem unverschuldeten Unfall einen Kfz-Gutachter in Köln suchen,
sind drei Punkte wichtig: Neutralität, Geschwindigkeit, gerichtsfeste
Dokumentation. Stefan arbeitet nach DAT- und BVSK-Standard, dokumentiert alle
Schadenspositionen mit Lackmessgerät, prüft Strukturschäden und Karosserie und
ermittelt Reparaturkosten, Wertminderung sowie Restwert nach belastbaren
Marktdaten. Das Gutachten landet in der Regel binnen 48 Stunden bei Ihnen
und Ihrer Anwaltskanzlei oder direkt bei der gegnerischen Versicherung — auf
Wunsch übernimmt unser Netzwerk-Anwalt das komplette Abwicklungsmandat.

Verkehrsschwerpunkte rund um Köln sind seit Jahren bekannt: Der Kölner
Autobahnring mit A 1, A 3 und A 4 zählt zu den staureichsten Strecken in NRW.
Besonders das Heumarer Dreieck und das Kreuz Köln-West sind klassische
Auffahrunfall-Stellen. Wenn Sie dort stehen, sind wir die richtige Adresse —
Stefan kommt aus Köln, kennt die Umleitungen und ist zügig vor Ort. Auch die
Zoobrücke, die Mülheimer Brücke und die Severinsbrücke sind regelmäßig
Engstellen, wenn Sanierungen oder Hochwasser den Verkehr ausbremsen. Bei
Innenstadt-Knoten wie Barbarossaplatz oder Friesenplatz reden wir wiederum
über Konflikte zwischen Auto, Fahrrad und Tram — hier braucht es ein genaues
Schadensbild, damit die Haftung sauber zugeordnet wird.

Was viele Kölner nicht wissen: Wenn die Versicherung des Unfallverursachers
Ihre Schadenshöhe kürzt, haben Sie das Recht auf ein Gegengutachten — und
auch das übernimmt die Versicherung. Stefan und das Claimondo-Partnernetzwerk
prüfen den Erstbericht, dokumentieren strittige Positionen und sorgen dafür,
dass Sie nicht auf vermeidbaren Kosten sitzen bleiben. Das gilt für
Karosserieschäden genauso wie für Wertminderungen bei jungen Fahrzeugen, für
Hagelschäden und für Totalschäden.

Stefan arbeitet eng mit Werkstätten in Köln zusammen — vom freien
Karosseriefachbetrieb in Mülheim bis zur Markenwerkstatt in Lindenthal. Wenn
Sie noch keine Werkstatt haben, vermittelt er auf Wunsch eine, die mit dem
gerichtsfesten Gutachten arbeitet und sich nicht an Vorgaben der gegnerischen
Versicherung halten muss. Sie behalten die Werkstattwahl — das ist Ihr Recht
nach BGH-Rechtsprechung.

Drei Schritte, dann ist Ihr Schaden in der richtigen Spur: 1) Sie melden sich
telefonisch oder über WhatsApp. 2) Stefan kommt vor Ort, dokumentiert
strukturiert und nimmt Fotos auf. 3) Sie erhalten das Gutachten binnen 48
Stunden — die Versicherungsregulierung läuft parallel. Bei Bedarf vermitteln
wir Anwalt, Werkstatt und Mietwagen. Sie zahlen 0 € — die gegnerische
Versicherung trägt alle Kosten.

Kfz-Gutachter Köln — neutral, gerichtsfest, schnell vor Ort. Stefan Wagner
ist Ihr Ansprechpartner. Rufen Sie an oder schreiben Sie über WhatsApp,
und wir klären in 5 Minuten, ob ein Sachverständiger sinnvoll ist und wie
es weitergeht.`,
  leverkusen: `Leverkusen — die Bayer-Stadt am Rhein, geprägt vom Chempark Wiesdorf, der
BayArena in Schlebusch und der berüchtigten A 1 Leverkusener Brücke. Wer hier
in einen unverschuldeten Unfall verwickelt wird, kennt das Problem: Die A 1
ist seit Jahren Baustelle, die A 3 Köln–Leverkusen quillt im Berufsverkehr
über, und das Bayer-Kreuz als Knotenpunkt von A 1, A 3 und A 59 zählt zu den
staureichsten Stellen in NRW. Stefan Wagner, Kfz-Gutachter aus Köln-Lindenthal,
ist in der Regel binnen 60 Minuten bei Ihnen in Wiesdorf, Opladen, Schlebusch,
Steinbüchel oder Hitdorf. 0 € für Sie — die gegnerische Versicherung übernimmt
das Honorar nach §249 BGB.

Leverkusen hat sechs Stadtteile, die ihre eigene Schadensdynamik mitbringen.
Wiesdorf mit dem Chempark hat hohen Anteil an Industrieverkehr und
Berufspendlern — Auffahrunfälle und Spurwechsel-Kollisionen prägen das Bild.
Opladen, das historische Zentrum, ist Bahnhofs-Stadtteil mit klassischer
Innenstadt-Atmosphäre, wo Park-Rempler und Konflikte mit Fußgängern dominieren.
In Schlebusch dreht sich am Spieltag der BayArena alles um die Bundesliga, und
mit dem Publikumsverkehr steigt das Unfallrisiko spürbar. Steinbüchel,
Lützenkirchen und Hitdorf am Rhein sind Wohngebiete, in denen Tür-Öffner-Schäden
und Vorfahrt-Konflikte vor Kindergärten und Schulen häufig sind.

Wenn Sie in Leverkusen unverschuldet in einen Unfall geraten, gilt: Sie haben
das Recht auf einen unabhängigen Kfz-Gutachter Ihrer Wahl — nicht den, den
die gegnerische Versicherung Ihnen empfiehlt. Stefan arbeitet nach DAT- und
BVSK-Standard, ist als Sachverständiger gerichtsfest und dokumentiert
strukturiert von der Bumper-Delle bis zum Strukturschaden. Lackmessung, Foto-
und Maß-Dokumentation, Wertminderung und Restwertermittlung gehören
selbstverständlich dazu.

Die A 1 Leverkusener Brücke ist ein eigenes Kapitel: Die jahrelange
Sanierung und die Lkw-Sperrung haben den Verkehr deutlich verändert, mit
spürbaren Auswirkungen auf Auffahrunfälle und Stop-and-Go-Kollisionen auf
den Umleitungsstrecken. Wer dort steht, wartet meist nicht lange auf Stefan
— er kennt die Strecke und kommt direkt. Auch das Bayer-Kreuz ist
schadensrelevant: Wer aus der A 1 auf die A 59 wechselt oder umgekehrt, kennt
die engen Verflechtungen und das Risiko, dass sich beim Spurwechsel jemand
auffährt.

Ein häufiger Fehler nach einem Unfall: Sich auf den von der gegnerischen
Versicherung beauftragten Gutachter zu verlassen. Der ist nicht neutral — er
arbeitet im Auftrag der Versicherung. Sie haben das Recht auf einen eigenen,
unabhängigen Kfz-Sachverständigen, der ausschließlich in Ihrem Interesse
dokumentiert. Stefan und das Claimondo-Partnernetzwerk übernehmen das für
Sie — inklusive Vermittlung von Anwalt, Mietwagen und Werkstatt. Falls die
gegnerische Versicherung kürzt, erstellen wir auf Wunsch ein Gegengutachten —
auch das wird übernommen.

Werkstattwahl in Leverkusen: Sie sind frei, eine Werkstatt zu wählen — egal
ob freier Fachbetrieb in Wiesdorf, Markenwerkstatt in Opladen oder
Karosseriespezialist in Schlebusch. Stefan kennt verlässliche Partner in
der Region und vermittelt auf Wunsch, ohne dass Sie an eine bestimmte
Werkstatt gebunden sind. Das gerichtsfeste Gutachten ist die Basis — die
Werkstatt rechnet darauf ab.

Drei Schritte: 1) Anruf oder WhatsApp an Stefan. 2) Vor-Ort-Termin binnen
60 Minuten in Leverkusen, alle Stadtteile abgedeckt. 3) Gutachten in
48 Stunden, Versicherungsabwicklung läuft parallel. Sie zahlen 0 €.

Kfz-Gutachter Leverkusen — neutral, gerichtsfest, schnell vor Ort.
Stefan Wagner ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon,
ob ein Sachverständiger sinnvoll ist und wie es weitergeht.`,
  'bergisch-gladbach': `Bergisch Gladbach ist mit 111.000 Einwohnern die größte Stadt im Rheinisch-
Bergischen Kreis und ein häufig unterschätzter Schadens-Hotspot. Die A 4
Bergisch Gladbach-Bensberg ist Hauptverkehrsader Richtung Olpe und Frankfurt,
die A 3 Königsforst verbindet mit Köln, und im Bergischen Land Richtung
Bensberg oder Refrath kommen Wildunfälle dazu, die viele Kölner Sachverständige
schlicht unterschätzen. Stefan Wagner, Kfz-Gutachter aus Köln-Lindenthal, ist
in der Regel binnen 60 Minuten in Bensberg, Refrath, Schildgen, Heidkamp, Hand
oder Sand. 0 € für Sie — die gegnerische Versicherung trägt das Honorar nach
§249 BGB.

Die Stadtteile haben jeweils ihren eigenen Schadens-Charakter. Bensberg, das
historische Zentrum mit Schloss Bensberg, ist Touristen- und Stadtkern-
Schwerpunkt — Park-Rempler und Konflikte in den engen Altstadtgassen sind
typisch. Refrath, südlich gelegen mit Forschungsstandort BTC, hat hohen
Berufspendlerverkehr und einen direkten Anschluss an die A 4. Schildgen und
Heidkamp sind Wohngebiete mit ruhigerem Charakter, aber ebenfalls Pendlerorte.
Hand, Sand und Asselborn liegen am Übergang ins Bergische Land — hier sind
Wildunfälle, gerade in der Dämmerung, deutlich häufiger als viele denken.

Wer in Bergisch Gladbach einen Kfz-Sachverständigen braucht, sollte auf drei
Dinge achten: Neutralität, lokale Erfahrung und gerichtsfeste Dokumentation.
Stefan arbeitet nach DAT- und BVSK-Standard, ist als Sachverständiger
unabhängig und dokumentiert strukturiert. Bei Wildunfällen — die in der
Region besonders zwischen Sand und dem Königsforst häufig sind — kommt es
auf die saubere Aufnahme der Schadensspur an. Wildhärchen, Blutspuren,
Aufprallpunkt und Lackabrieb müssen dokumentiert werden, damit die
Haftpflicht- oder Teilkaskoabwicklung sauber läuft.

Die A 4 Anschlussstellen Bensberg und Refrath sind Auffahrunfall-Hotspots
besonders im Berufsverkehr Richtung Köln. Wer dort steht, hat oft das Problem,
dass die gegnerische Versicherung schnell mit einem eigenen Gutachter kommt —
das ist nicht in Ihrem Interesse. Sie haben das Recht auf einen eigenen
Sachverständigen, der ausschließlich für Sie arbeitet. Stefan und das
Claimondo-Partnernetzwerk übernehmen das gesamte Mandat: Vor-Ort-Aufnahme,
Foto-Dokumentation, Reparaturkostenkalkulation, Wertminderung und
Restwertermittlung sowie auf Wunsch die komplette Versicherungs- und
Anwaltsabwicklung.

Ein häufiger Konfliktpunkt bei Schäden im Bergischen Land: Die Höhe der
Reparaturkosten bei älteren Fahrzeugen. Wenn die Versicherung die
Reparaturkosten höher ansetzt als den Wiederbeschaffungswert, droht der
Totalschaden — und dann geht es um die Frage, ob fiktive Abrechnung oder
130-Prozent-Regelung möglich ist. Stefan kennt die Rechtsprechung und
dokumentiert so, dass Sie alle Optionen behalten. Auch bei Wertminderungen
junger Fahrzeuge nach Auffahrunfällen ist die saubere Berechnung entscheidend
— hier zählt Erfahrung.

Werkstattwahl in Bergisch Gladbach: Sie wählen frei, ob freier Fachbetrieb
oder Markenwerkstatt. Stefan vermittelt verlässliche Partner in Bensberg,
Refrath oder Heidkamp, wenn Sie keine eigene Werkstatt haben — Sie sind
nicht verpflichtet, die Werkstatt zu nehmen, die die Versicherung Ihnen
empfiehlt. Das ist Ihr Recht.

Drei Schritte für die Schadensregulierung: 1) Sie melden sich telefonisch
oder über WhatsApp. 2) Stefan kommt vor Ort, alle Stadtteile inklusive
Bensberg und Refrath. 3) Gutachten in 48 Stunden — die Versicherungsabwicklung
läuft parallel. 0 € für Sie.

Kfz-Gutachter Bergisch Gladbach — neutral, gerichtsfest, schnell vor Ort.
Stefan Wagner ist Ihr Ansprechpartner. Rufen Sie an oder schreiben Sie
über WhatsApp, und wir klären in 5 Minuten, wie es weitergeht.`,
  pulheim: `Pulheim, nordwestlich von Köln, ist Pendlerstadt par excellence: A 1 Pulheim-
Brauweiler, A 57 Köln-Krefeld, B 59 Aachener Straße — drei Hauptverkehrsadern,
die täglich tausende Pendler nach Köln und Bergheim bringen. Wenn Sie hier in
einen unverschuldeten Unfall geraten, sind die Strecken klar: A 1, A 57 oder
Innenstadt-Anschluss. Stefan Wagner, Kfz-Sachverständiger aus Köln-Lindenthal,
ist meist binnen 60 Minuten in Pulheim-Mitte, Brauweiler, Stommeln, Sinnersdorf
oder Geyen. 0 € für Sie — die gegnerische Versicherung übernimmt die
Honorarkosten nach §249 BGB.

Pulheim hat fünf größere Stadtteile mit jeweils eigener Schadens-Identität.
Pulheim-Mitte ist Verwaltungs- und Einkaufs-Kern, hier dominieren Park-Rempler
und Konflikte am Marktplatz. Brauweiler im Westen ist berühmt für die Abtei
Brauweiler — touristisch geprägt, aber auch starkes A 1-Anbindungspendlergebiet.
Stommeln im Norden ist klassisches Wohngebiet mit Bahnhof, Sinnersdorf und
Geyen sind ländlicher geprägt, mit eigenen Schadenstypen, die von Wildunfällen
bis zu Wartungsstaus auf der B 59 reichen.

Wer in Pulheim einen Kfz-Gutachter braucht, sollte wissen: Sie haben das
Recht auf einen unabhängigen Sachverständigen Ihrer Wahl — nicht den, den
die gegnerische Versicherung schickt. Stefan arbeitet nach DAT- und
BVSK-Standard, dokumentiert strukturiert und gerichtsfest, und ist als
Sachverständiger im Schadensfall ausschließlich in Ihrem Interesse tätig.

Pulheim wächst — und das spürt man am Verkehr. Der Industriepark Pulheim-
Bornheim hat sich in den letzten Jahren deutlich entwickelt, mit
entsprechendem Anstieg an Flotten- und Berufsverkehr. Auch die Anbindung an
die A 1 Brauweiler ist relevant: Hier kreuzen sich Pendler aus Bergheim und
Köln, was zu klassischen Auffahrunfällen im Stop-and-Go führt. Wenn Sie an
einer dieser Stellen unverschuldet stehen, kommt Stefan zügig vorbei und
dokumentiert vor Ort — Lackmessung, Strukturschadens-Check, Foto-
Dokumentation und Maß-Aufnahme inklusive.

Ein typischer Schadenstyp in Pulheim: Park-Rempler vor der Abtei Brauweiler,
besonders an touristisch starken Wochenenden. Auch im Wohngebiet
Stommeln-Pesch sind Tür-Öffner-Schäden vor Kindergärten und Schulen häufig.
Stefan dokumentiert die Schadenshöhe, ermittelt Wertminderung und
Restwert und sorgt dafür, dass die gegnerische Versicherung sauber reguliert.
Falls die Versicherung kürzt, erstellen wir auf Wunsch ein Gegengutachten —
ebenfalls auf Kosten der gegnerischen Versicherung.

Was viele Pulheimer nicht wissen: Auch die Mietwagenkosten während der
Reparaturzeit sind erstattungsfähig. Sie haben Anspruch auf einen
gleichwertigen Mietwagen oder eine Nutzungsausfallentschädigung. Stefan und
das Claimondo-Partnernetzwerk regeln das mit — Sie müssen nicht im
Mietwagenbüro um die richtige Klasse feilschen. Auch die Anwaltskosten
übernimmt die gegnerische Versicherung — wir vermitteln einen
Verkehrsrechtsanwalt aus dem Netzwerk, der den Fall sauber abwickelt.

Werkstattwahl bleibt Ihr Recht. Stefan kennt verlässliche Partner in
Pulheim-Mitte, Brauweiler und Stommeln — vom Karosseriefachbetrieb bis zur
Lackiererei. Wenn Sie keine eigene Werkstatt haben, vermittelt er gerne. Die
Werkstatt rechnet auf Basis des Gutachtens ab, sodass die Reparatur
fachgerecht und nach DAT-Standard erfolgt.

Drei Schritte: 1) Anruf oder WhatsApp an Stefan. 2) Vor-Ort-Termin binnen
60 Minuten in Pulheim, alle Stadtteile abgedeckt. 3) Gutachten in 48 Stunden,
Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Pulheim — neutral, gerichtsfest, schnell vor Ort. Stefan
Wagner ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  bruehl: `Brühl, südlich von Köln, ist eine Stadt mit zwei Gesichtern: Auf der einen
Seite das UNESCO-Welterbe Schloss Augustusburg und ein gediegener Stadtkern,
auf der anderen Seite das Phantasialand mit über 5 Millionen Besuchern pro
Jahr. Dazu kommen die A 553 als Hauptverkehrsader Richtung Köln-Süden und
die A 555 als Brücke Richtung Bonn. Wenn Sie hier in einen unverschuldeten
Unfall geraten, sind Sie nicht allein — Stefan Wagner, Kfz-Sachverständiger
aus Köln-Lindenthal, ist meist binnen 60 Minuten in Brühl-Mitte, Vochem,
Pingsdorf, Heide oder Schwadorf. 0 € für Sie — die gegnerische Versicherung
trägt das Honorar nach §249 BGB.

Brühl hat eine besondere Schadensdynamik: Tourismus. An starken Wochenenden
und in den Sommermonaten steigen die Park-Rempler am Phantasialand-Parkplatz
deutlich, ebenso die Schäden in der Innenstadt rund um das Schloss. Hier
treffen Auswärtige auf enge Altstadtgassen, in denen Park-Disziplin
herausgefordert wird. Pingsdorf, der Phantasialand-Stadtteil im Süden, ist
ein eigenes Kapitel — wir bekommen regelmäßig Anfragen wegen Anhänger-,
Wohnmobil- und Anfahrtsschäden auf den Parkplätzen.

Stefan kennt die Region und kommt zügig vor Ort. Er arbeitet nach DAT- und
BVSK-Standard, dokumentiert mit Lackmessgerät und Foto-Setup, prüft
Strukturschäden und ermittelt Wertminderung und Restwert nach belastbaren
Marktdaten. Das Gutachten ist binnen 48 Stunden bei Ihnen — und im selben
Schritt läuft die Versicherungsregulierung mit dem Claimondo-Partnernetzwerk
an. Auf Wunsch übernimmt unser Verkehrsrechtsanwalt das komplette
Abwicklungsmandat.

Verkehrsschwerpunkte rund um Brühl: Die A 553 Brühl ist als Hauptzubringer
nach Köln-Süden im Berufsverkehr regelmäßig Stop-and-Go — klassische
Auffahrunfall-Strecke. Die A 555 Köln-Brühl-Bonn ist Brückenstrecke mit
Engstelle, hier sind Spurwechsel-Kollisionen und Auffahrunfälle bei
Sanierungsphasen häufig. Innerstädtisch ist die B 51 Bonner Straße die
Hauptverkehrsader, die Brühl mit Köln und Bonn verbindet — auch hier dominiert
Pendler- und Berufsverkehr.

Ein typischer Schaden, der in Brühl überdurchschnittlich oft vorkommt:
Park-Rempler am Phantasialand-Parkplatz mit Fahrerflucht. Wenn der Verursacher
nicht greifbar ist, geht es um die Frage, ob Sie über die eigene Vollkasko
oder die Verkehrsopferhilfe abwickeln. Stefan dokumentiert den Schaden so,
dass alle Optionen offen bleiben — sauber, gerichtsfest, mit klarer Foto-Spur.
Falls die eigene Vollkasko sich querstellt, kann ein Gegengutachten helfen.

Was viele in Brühl nicht wissen: Auch bei Unfällen mit ausländischen
Beteiligten — und im Phantasialand-Verkehr ist das nicht selten — gibt es
klare Regulierungsabläufe. Über die Grüne Karte und den Zentralruf der
Autoversicherer kann der Schaden auch bei nicht-deutschen Beteiligten
abgewickelt werden. Stefan und das Claimondo-Netzwerk kennen die Wege und
übernehmen die Abwicklung mit ausländischen Versicherern.

Werkstattwahl in Brühl: Sie wählen frei. Stefan vermittelt verlässliche
Karosserie- und Lackbetriebe in Brühl-Mitte, Vochem oder Pingsdorf. Wer eine
Markenwerkstatt bevorzugt, bekommt sie — wer einen freien Fachbetrieb will,
ebenfalls. Sie behalten die Wahl, das gerichtsfeste Gutachten ist die Basis
für die Abrechnung.

Drei Schritte: 1) Sie melden sich telefonisch oder über WhatsApp. 2) Stefan
kommt vor Ort, alle Stadtteile inklusive Pingsdorf und Heide. 3) Gutachten in
48 Stunden — die Versicherungsabwicklung läuft parallel. 0 € für Sie.

Kfz-Gutachter Brühl — neutral, gerichtsfest, schnell vor Ort. Stefan Wagner
ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  frechen: `Frechen, westlich von Köln direkt an der A 4, ist seit Jahrhunderten von
Steinzeug- und Keramikindustrie geprägt und gleichzeitig eine wichtige
Pendlerstadt mit Anschluss an Köln und Aachen. Wenn Sie hier in einen
unverschuldeten Unfall geraten — egal ob auf der A 4 bei Frechen-Königsdorf,
auf der B 264 Aachener Straße oder im Industriepark — ist Stefan Wagner,
Kfz-Gutachter aus Köln-Lindenthal, meist binnen 60 Minuten bei Ihnen. 0 €
für Sie — die gegnerische Versicherung übernimmt die Honorarkosten nach
§249 BGB.

Frechen hat vier Stadtteile mit jeweils eigener Schadens-Identität.
Frechen-Mitte ist Verwaltungs- und Einkaufs-Zentrum, hier dominieren
Park-Rempler am Marktplatz und im Bereich Hauptstraße. Königsdorf im
Nordosten ist Wohn- und Gewerbe-Mix mit direkter A 4-Anbindung, hier ist
Berufsverkehr-Schaden klassisch. Habbelrath und Bachem sind ländlicher geprägt
und mit Industrieparks durchsetzt — hier kommen Flotten- und Lkw-Schäden
hinzu.

Wer in Frechen einen Kfz-Sachverständigen braucht, sollte auf drei Dinge
achten: Neutralität, lokale Erfahrung und gerichtsfeste Dokumentation. Stefan
arbeitet nach DAT- und BVSK-Standard, dokumentiert mit Lackmessgerät und
Foto-Setup und ermittelt Reparaturkosten, Wertminderung und Restwert nach
belastbaren Marktdaten. Das Gutachten ist binnen 48 Stunden bei Ihnen — und
die Versicherungsregulierung läuft parallel mit dem Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Frechen: Die A 4 Frechen-Königsdorf ist
Hauptzubringer nach Köln und Aachen — hohes Pendleraufkommen, klassisches
Auffahrunfall-Profil im Berufsverkehr. Die B 264 Aachener Straße ist
Innenstadt-Hauptachse mit hohem Lieferverkehr. Im Industriepark
Frechen-Königsdorf dominiert Logistikverkehr — hier sind Streifschäden und
Lkw-Pkw-Konflikte häufig.

Ein typischer Schadenstyp in Frechen: Auffahrunfall auf der A 4 im
Berufsverkehr Richtung Köln. Stefan dokumentiert die Schadenshöhe ab dem
Bumper-Bereich, prüft Strukturschäden im Heckblech, ermittelt Wertminderung
nach Marktdaten und sorgt dafür, dass die gegnerische Versicherung sauber
reguliert. Falls die Versicherung kürzt — etwa weil sie Reparaturkosten als
zu hoch ansetzt — erstellen wir ein Gegengutachten. Auch das wird von der
gegnerischen Versicherung übernommen.

Frechen hat eine besondere Industrie-Geschichte: Die Keramik- und
Steinzeugindustrie hat viele Flottenbetriebe in der Region etabliert. Wer
mit einem Firmenfahrzeug in einen Unfall verwickelt wird, hat oft die Frage:
Wie läuft die Abwicklung bei einer Firmen-Versicherung? Stefan dokumentiert
auch hier strukturiert, sodass die Firmenversicherung und die gegnerische
Haftpflicht sauber abrechnen können. Bei Mietfahrzeugen ist die Dokumentation
besonders wichtig, weil sonst Nachverhandlungen drohen.

Was viele Frechener nicht wissen: Bei einem Totalschaden gibt es mehrere
Abrechnungsoptionen — fiktive Abrechnung auf Gutachten-Basis, Reparatur nach
130-Prozent-Regelung oder Wiederbeschaffungswert-Auszahlung. Welche Option
für Sie sinnvoll ist, hängt vom Fahrzeugalter, Restwert und Ihren Plänen ab.
Stefan und das Claimondo-Netzwerk besprechen die Optionen mit Ihnen und
sorgen dafür, dass Sie nicht in die schlechteste Option gedrängt werden.

Werkstattwahl bleibt Ihr Recht. Stefan kennt verlässliche Partner in
Frechen-Mitte, Königsdorf und Habbelrath — vom freien Karosseriefachbetrieb
bis zur Markenwerkstatt. Wenn Sie keine eigene Werkstatt haben, vermittelt er
gerne. Die Werkstatt rechnet auf Basis des Gutachtens ab, sodass die
Reparatur fachgerecht erfolgt.

Drei Schritte: 1) Anruf oder WhatsApp an Stefan. 2) Vor-Ort-Termin binnen
60 Minuten in Frechen, alle Stadtteile inklusive Königsdorf und Habbelrath.
3) Gutachten in 48 Stunden, Versicherungsabwicklung läuft parallel. 0 €.

Kfz-Gutachter Frechen — neutral, gerichtsfest, schnell vor Ort. Stefan
Wagner ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  huerth: `Hürth, südwestlich von Köln, ist Studio-Stadt: Hier residieren die MMC Studios,
wo „Wer wird Millionär?" und zahlreiche andere TV-Produktionen entstehen.
Gleichzeitig ist Hürth Wohnvorort mit hohem Berufspendleranteil — und mit
dem A 1/A 4 Kreuz Köln-West einer der staureichsten Knotenpunkte der Region.
Wenn Sie hier in einen unverschuldeten Unfall geraten, ist Stefan Wagner,
Kfz-Sachverständiger aus Köln-Lindenthal, meist binnen 60 Minuten bei Ihnen
in Hürth-Mitte, Hermülheim, Efferen, Sielsdorf oder Berrenrath. 0 € für Sie
— die gegnerische Versicherung übernimmt das Honorar nach §249 BGB.

Hürth hat fünf größere Stadtteile mit unterschiedlicher Schadenslage.
Hürth-Mitte ist Verwaltungs- und Einkaufszentrum, hier dominieren
Innenstadt-Rempler. Hermülheim, der Stadtteil im Nordosten, ist als
Geburtsort von Michael Schumacher bekannt und liegt nah an den
Studios — hier kommt Promi- und Publikumsverkehr hinzu. Efferen, Sielsdorf
und Berrenrath sind klassische Wohn- und Industriegebiete mit hohem
Pendleraufkommen.

Wer in Hürth einen Kfz-Gutachter braucht, sollte auf Neutralität und
Geschwindigkeit achten. Stefan arbeitet nach DAT- und BVSK-Standard,
dokumentiert mit Lackmessgerät und Foto-Setup, prüft Strukturschäden und
ermittelt Reparaturkosten, Wertminderung sowie Restwert nach belastbaren
Marktdaten. Das Gutachten ist binnen 48 Stunden bei Ihnen — die
Versicherungsregulierung läuft parallel mit dem Claimondo-Partnernetzwerk.

Verkehrsschwerpunkte rund um Hürth: Das Kreuz Köln-West, an dem A 1 und A 4
zusammenkommen, gehört zu den staureichsten Knotenpunkten in NRW. Wer dort
im Berufsverkehr steht, kennt das Risiko: Auffahrunfälle bei
Stop-and-Go-Verkehr sind klassisch, ebenso Spurwechsel-Kollisionen, wenn
Pendler kurzfristig die Spur wechseln. Die A 553 Brühl-Hürth ist
südlicher Zubringer, die B 264 Luxemburger Straße ist Innenstadt-Hauptachse
mit hohem Lieferverkehr.

Ein typischer Schadenstyp in Hürth: Auffahrunfall am Kreuz Köln-West im
Berufsverkehr. Stefan dokumentiert den Heckschaden ab dem Bumper bis zum
Strukturschaden im Heckblech, ermittelt Wertminderung und Restwert, und
sorgt dafür, dass die gegnerische Versicherung sauber reguliert. Häufig
versucht die Versicherung, Reparaturkosten zu drücken — etwa durch Verweis
auf günstigere Werkstätten. Sie haben das Recht auf eine Werkstatt Ihrer
Wahl. Stefan dokumentiert so, dass die Versicherung das nicht aushebeln kann.

Hürth hat eine besondere Lage: Die MMC Studios bringen regelmäßig
Produktions- und Filmcrews in die Stadt, mit entsprechend hohem
Lieferverkehr und Versorger-Fahrzeugen. Wer mit einem Sprinter oder
Studiowagen in einen Unfall verwickelt wird, braucht eine Dokumentation, die
auch bei Firmenversicherungen sauber durchläuft. Stefan kennt die
Anforderungen und liefert.

Was viele Hürther nicht wissen: Auch die Anwaltskosten übernimmt bei einem
unverschuldeten Unfall die gegnerische Versicherung. Sie zahlen 0 € für
Anwalt, Gutachter, Mietwagen und Mietwagenkostenversicherung. Stefan und das
Claimondo-Partnernetzwerk vermitteln einen Verkehrsrechtsanwalt aus der
Region, der den Fall sauber abwickelt — von der Schadensmeldung bis zur
Auszahlung.

Werkstattwahl bleibt Ihr Recht. Stefan vermittelt verlässliche Partner in
Hürth-Mitte, Hermülheim oder Efferen — vom freien Karosseriefachbetrieb bis
zur Markenwerkstatt. Sie sind nicht verpflichtet, die Werkstatt zu nehmen,
die die Versicherung empfiehlt.

Drei Schritte: 1) Anruf oder WhatsApp an Stefan. 2) Vor-Ort-Termin binnen
60 Minuten, alle Stadtteile inklusive Hermülheim und Efferen. 3) Gutachten in
48 Stunden, Versicherungsabwicklung läuft parallel. 0 €.

Kfz-Gutachter Hürth — neutral, gerichtsfest, schnell vor Ort. Stefan Wagner
ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es weitergeht.`,
  wesseling: `Wesseling liegt zwischen Köln und Bonn am Rhein und ist klassische
Chemie-Industriestadt: Shell-Raffinerie, Evonik-Werk und LyondellBasell prägen
das Stadtbild und ziehen täglich Tausende Pendler und Lieferverkehr an. Wer
hier in einen unverschuldeten Unfall gerät — auf der B 9 Bonner Straße, an der
A 555 Köln-Bonn oder im Industrie-Quartier — ist nicht allein. Stefan Wagner,
Kfz-Sachverständiger aus Köln-Lindenthal, ist meist binnen 60 Minuten bei
Ihnen in Wesseling-Mitte, Berzdorf, Urfeld oder Keldenich. 0 € für Sie — die
gegnerische Versicherung übernimmt die Honorarkosten nach §249 BGB.

Wesseling hat eine besondere Verkehrslage: Die Chemie-Industrie produziert
hohen Lieferverkehr mit Tanklastzügen und Sondertransporten, was zu einer
eigenen Schadensdynamik führt. Die A 555 zwischen Köln und Bonn ist
Pendlerstrecke, mit klassischem Stop-and-Go im Berufsverkehr und entsprechenden
Auffahrunfällen. Die B 9 Bonner Straße ist innerstädtische Hauptverkehrsader,
hier dominieren Innenstadt-Rempler und Spurwechsel-Konflikte.

Wer in Wesseling einen Kfz-Gutachter braucht, sollte wissen: Sie haben das
Recht auf einen unabhängigen Sachverständigen Ihrer Wahl — nicht den, den
die gegnerische Versicherung schickt. Stefan arbeitet nach DAT- und
BVSK-Standard, ist gerichtsfest und dokumentiert strukturiert mit
Lackmessgerät, Foto-Setup und Maß-Aufnahme. Das Gutachten ist binnen 48
Stunden bei Ihnen — die Versicherungsregulierung läuft parallel mit dem
Claimondo-Partnernetzwerk.

Eine Besonderheit in Wesseling: Konflikte mit Industrie-Lieferverkehr. Bei
Streifschäden durch Lkw-Spurwechsel oder Auffahrunfällen mit
Tanklastzügen geht es oft um die Frage, ob das Industrieunternehmen, der
Speditionspartner oder der Fahrer haftet. Stefan dokumentiert sauber, sodass
die Haftungs-Zuordnung im Schadensfall klar belegbar ist. Auch bei
Wertminderungen — die bei jüngeren Fahrzeugen nach Lkw-Streifschäden besonders
hoch ausfallen können — kommt es auf die korrekte Berechnung an.

Verkehrsschwerpunkte rund um Wesseling: Die A 555 Köln-Wesseling-Bonn ist
Pendlerstrecke mit Stop-and-Go im Berufsverkehr. Die B 9 Bonner Straße ist
innerstädtische Hauptachse, hier sind Rempler an den Kreuzungen Bonner
Straße/Eichholzer Straße sowie an den Industriegebiet-Ausfahrten häufig. Die
Industrieanbindungen am Rheinufer bringen Lkw-Verkehr in die Stadt — sowohl
für Shell als auch für Evonik.

Was viele Wesselinger nicht wissen: Auch bei Schäden durch verlorenes
Ladegut — etwa von Lkws auf der A 555 — gibt es klare Regulierungswege. Wenn
Sie auf der Autobahn in eine ausgelaufene Flüssigkeit oder ein verlorenes Teil
geraten, haftet der Verursacher beziehungsweise die Spedition. Stefan
dokumentiert die Schäden so, dass die Haftpflichtversicherung der Spedition
sauber abrechnen kann. Auch bei Schäden mit Sondertransport-Beteiligung kennt
das Claimondo-Netzwerk die Wege.

Bei einem Totalschaden in Wesseling sind drei Optionen möglich: Reparatur
mit 130-Prozent-Regelung, fiktive Abrechnung auf Gutachten-Basis oder
Wiederbeschaffungswert-Auszahlung. Welche Option für Sie sinnvoll ist, hängt
vom Fahrzeugalter, Restwert und Ihren Plänen ab. Stefan und der
Verkehrsrechtsanwalt aus dem Claimondo-Netzwerk besprechen die Optionen mit
Ihnen und sorgen dafür, dass Sie nicht in die schlechteste Variante gedrängt
werden.

Werkstattwahl bleibt Ihr Recht. Stefan vermittelt verlässliche Karosserie-
und Lackbetriebe in Wesseling-Mitte und Berzdorf — vom freien Fachbetrieb
bis zur Markenwerkstatt. Sie sind frei in der Wahl.

Drei Schritte: 1) Anruf oder WhatsApp an Stefan. 2) Vor-Ort-Termin binnen
60 Minuten, alle Stadtteile inklusive Urfeld und Keldenich. 3) Gutachten in
48 Stunden, Versicherungsabwicklung läuft parallel. 0 €.

Kfz-Gutachter Wesseling — neutral, gerichtsfest, schnell vor Ort. Stefan
Wagner ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es
weitergeht.`,
  kerpen: `Kerpen, westlich von Köln im Rhein-Erft-Kreis, hat zwei Dinge, die jeder
kennt: den Tagebau Hambach und den berühmtesten Sohn der Stadt, Michael
Schumacher. Verkehrslich ist Kerpen mit der A 4, der A 61 und der B 264
Aachener Straße eng vernetzt — wer Köln oder Aachen erreichen will, fährt
durch oder an Kerpen vorbei. Wenn Sie hier in einen unverschuldeten Unfall
geraten, ist Stefan Wagner, Kfz-Sachverständiger aus Köln-Lindenthal, meist
binnen 60 Minuten bei Ihnen in Kerpen-Mitte, Horrem, Sindorf, Türnich oder
Brüggen. 0 € für Sie — die gegnerische Versicherung übernimmt die
Honorarkosten nach §249 BGB.

Kerpen hat fünf größere Stadtteile mit jeweils eigener Schadens-Dynamik.
Kerpen-Mitte ist Verwaltungs- und Einkaufszentrum mit klassischen
Innenstadt-Remplern. Horrem im Norden ist Bahnhofs-Stadtteil mit hohem
Pendleraufkommen Richtung Köln. Sindorf im Osten ist Wohngebiet, Türnich im
Süden ist klassisch ländlich-industriell mit A 4-Anschluss, und Brüggen
westlich liegt nahe am Tagebau Hambach — hier kommt Schwerlastverkehr von
RWE und Bagger-Versorgern ins Spiel.

Wer in Kerpen einen Kfz-Gutachter braucht, sollte auf drei Dinge achten:
Neutralität, Geschwindigkeit und gerichtsfeste Dokumentation. Stefan arbeitet
nach DAT- und BVSK-Standard, dokumentiert mit Lackmessgerät und Foto-Setup,
prüft Strukturschäden und ermittelt Wertminderung und Restwert nach
belastbaren Marktdaten. Das Gutachten ist binnen 48 Stunden bei Ihnen, die
Versicherungsregulierung läuft parallel.

Verkehrsschwerpunkte in Kerpen: Die A 4 Kerpen-Türnich ist Hauptzubringer
nach Köln und Aachen — klassisches Pendler-Auffahrunfall-Profil im
Berufsverkehr. Die A 61 Kerpen ist Strecke Richtung Koblenz und Aachen, hier
sind Sonntags- und Wochenend-Schäden durch Reiserückkehrer häufig. Die B 264
Aachener Straße ist Innenstadt-Hauptverkehrsachse. Eine Besonderheit: Der
Tagebau Hambach erzeugt Schwerlastverkehr Richtung Niederaußem und Neurath,
mit Lkw-Streifschäden und Konflikten auf den Industrie-Zubringerstraßen.

Ein typischer Schadenstyp in Kerpen: Auffahrunfall auf der A 4 Richtung
Köln im Berufsverkehr. Stefan dokumentiert den Heckschaden strukturiert,
prüft auch versteckte Schäden im Heckblech und Kofferraumboden, ermittelt
Wertminderung nach Marktdaten und sorgt dafür, dass die gegnerische
Versicherung sauber reguliert. Auch bei Streifschäden durch
Hambach-Schwerlastverkehr — Bagger-Versorger, Kettenfahrzeuge, Kies-Lkws —
kommt es auf die korrekte Haftungs-Zuordnung an. Hier hilft eine saubere
Foto-Spur, die belegt, wer auf welcher Spur fuhr.

Was viele Kerpener nicht wissen: Bei einem Auffahrunfall mit einem
Firmenfahrzeug gibt es manchmal Diskussionen, ob die Firma oder der Fahrer
haftet. Bei der saubere Aufnahme der Schadensspur und der Beteiligten-Daten
hilft Stefan, die Haftpflichtversicherung der Firma sauber zu adressieren. Wir
übernehmen mit dem Claimondo-Partnernetzwerk auch die Anwaltsabwicklung —
auch das ist für Sie kostenfrei.

Eine Besonderheit bei Kerpener Schäden: Bei jüngeren Fahrzeugen ist die
Wertminderung nach einem Auffahrunfall oft höher, als die Versicherung
zugestehen möchte. Hier zählt die saubere Berechnung. Stefan dokumentiert
nicht nur den Schaden, sondern auch den merkantilen Minderwert sauber, sodass
die Versicherung nicht einfach kürzen kann. Falls sie es doch tut, erstellen
wir auf Wunsch ein Gegengutachten — auch das wird übernommen.

Werkstattwahl bleibt Ihr Recht. Stefan kennt verlässliche Partner in
Kerpen-Mitte, Horrem und Sindorf — vom freien Karosseriefachbetrieb bis
zur Markenwerkstatt. Wenn Sie keine eigene Werkstatt haben, vermittelt er.
Die Werkstatt rechnet auf Basis des Gutachtens ab.

Drei Schritte: 1) Anruf oder WhatsApp an Stefan. 2) Vor-Ort-Termin binnen
60 Minuten, alle Stadtteile inklusive Horrem und Sindorf. 3) Gutachten in
48 Stunden, Versicherungsabwicklung läuft parallel. 0 €.

Kfz-Gutachter Kerpen — neutral, gerichtsfest, schnell vor Ort. Stefan Wagner
ist Ihr Ansprechpartner. Wir klären in 5 Minuten am Telefon, wie es weitergeht.`,
}

export function seoTextFor(slug: string): string {
  return SEO_TEXT[slug] ?? ''
}
