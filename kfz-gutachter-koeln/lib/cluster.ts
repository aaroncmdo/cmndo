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
    { text: `Ein Unfall in Köln passiert schnell — im Stop-and-Go vor dem Heumarer Dreieck, beim Spurwechsel auf der Zoobrücke, beim Rangieren in einer Veedel-Seitenstraße. Wenn Sie unverschuldet beteiligt sind, brauchen Sie einen neutralen Kfz-Gutachter, der gerichtsfest dokumentiert — und zwar bevor die gegnerische Versicherung ihren eigenen Prüfer schickt. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten bei Ihnen: in Ehrenfeld, Nippes, Mülheim, Kalk oder Porz. 0 € für Sie, denn die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Köln denkt in Veedeln — und jedes hat seine eigene Schadensdynamik. In der Innenstadt zwischen Barbarossaplatz, Zülpicher Platz und Rudolfplatz dominieren Park-Rempler, Tür-Öffner-Schäden und Konflikte mit KVB-Bahnen, deren Gleise dort im Fahrbahnbelag liegen. Auf dem Autobahnring und an seinen Kreuzen sind es Auffahrunfälle aus zähem Verkehr. In Lindenthal, Sülz und Klettenberg häufen sich Schäden im Umfeld von Schulen, Kitas und Universität. Mülheim, Kalk und Buchforst leben von Liefer- und Handwerkerverkehr auf engen Achsen, während in Rodenkirchen, Bayenthal und Marienburg der Pendlerstrom über A 4 und A 555 das Bild prägt. Chorweiler und Porz wiederum sind flächige Bezirke mit langen Ausfallstraßen und entsprechend hohen Geschwindigkeiten. Unsere Sachverständigen fahren diese Strecken im Tagesgeschäft.` },
    { h3: 'Woran erkennen Sie einen guten Kfz-Gutachter in Köln?', text: `An drei Dingen: Neutralität, Geschwindigkeit und einer Dokumentation, die vor Gericht hält. Wir arbeiten nach BVSK-Standard — das Gutachten geht binnen 48 Stunden an Sie, Ihre Kanzlei oder direkt an die gegnerische Versicherung. Zum Standardumfang gehören:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo kracht es in Köln am häufigsten?', text: `Der Kölner Autobahnring aus A 1, A 3 und A 4 legt sich als Kette von Knoten um die Stadt: Köln-West (A 1/A 4), Köln-Nord (A 1/A 57), Köln-Süd (A 4/A 555), Gremberg (A 4/A 559), Köln-Ost (A 3/A 4) und das Heumarer Dreieck, wo A 3, A 4 und A 59 zusammenlaufen. Zwischen Köln-Ost und Gremberg folgen mehrere Kreuze aufeinander, ohne dass dazwischen eine Anschlussstelle liegt — wer dort die Ausfahrt sucht, wechselt spät und knapp die Spur. Das ist das Muster hinter den meisten Auffahr- und Streifschäden auf dem Ring. Innerstädtisch verlagert sich das Bild auf die Ringe zwischen Ebertplatz und Ubierring sowie auf die Ausfallstraßen Aachener, Venloer, Luxemburger und Bonner Straße.` },
    { h3: 'Rheinbrücke gesperrt, Umleitung voll — was heißt das für Ihren Schaden?', text: `Köln hängt an seinen Rheinquerungen, und die sind seit Jahren im Umbau. Die Mülheimer Brücke wird abschnittsweise unter laufendem Verkehr instand gesetzt, an der Rodenkirchener Autobahnbrücke der A 4 laufen Korrosionsschutz und die Erneuerung der Fahrbahnübergänge — mit Tempolimit auf weiten Teilen der A 4 im Kölner Süden. Verengt sich eine Querung, drückt der Verkehr auf Zoobrücke, Deutzer und Severinsbrücke, und dort steigen Auffahr- und Engstellenschäden. Für Ihr Gutachten ist das relevant: Wir halten Fahrbahnführung, Beschilderung und Spurbreite am Unfallort mit fest, weil eine Baustellenverkehrsführung die Haftungsfrage verschieben kann.` },
    { h3: 'Unfall mit einer KVB-Bahn — was ist daran anders?', text: `Auf vielen Kölner Achsen liegen die Stadtbahngleise im Asphalt, Auto und Bahn teilen sich die Fahrbahn. Kommt es dort zur Kollision, ist die Gegenseite ein Verkehrsbetrieb mit eigener Schadenabteilung und eigenen Gutachtern — und die Beweislage entscheidet sich an Details: Lage im Gleisbereich, Haltestelleninsel, Ampelphase, Bremsspur. Wir dokumentieren die Örtlichkeit so, dass die spätere Rekonstruktion nicht allein auf der Darstellung des Verkehrsbetriebs beruht.` },
    { h3: 'Was tun, wenn die Versicherung kürzt?', text: `Kürzt die Versicherung des Unfallverursachers Ihre Schadenshöhe oder verweist sie auf eine günstigere Werkstatt, haben Sie das Recht auf ein Gegengutachten — auch das trägt die Gegenseite. Wir und das Claimondo-Partnernetzwerk prüfen den Erstbericht und belegen die strittigen Positionen einzeln: Karosserie- und Strukturschäden, merkantiler Minderwert bei jungen Fahrzeugen, Hagel- und Totalschadenfälle, Nutzungsausfall.` },
    { h3: 'Wer entscheidet über die Werkstatt?', text: `Sie — das ist Ihr Recht nach ständiger BGH-Rechtsprechung. Wir arbeiten mit Betrieben in ganz Köln zusammen, vom freien Karosseriefachbetrieb in Mülheim über die Lackiererei im Ossendorfer Gewerbegebiet bis zur Markenwerkstatt in Lindenthal, und vermitteln auf Wunsch einen Betrieb, der auf Basis des Gutachtens abrechnet — ohne Vorgabe der gegnerischen Versicherung.` },
    { h3: 'Assistenzsysteme: der Posten, den Kostenvoranschläge gern übersehen', text: `Moderne Fahrzeuge tragen Radarsensoren, Kameras und Ultraschallgeber in Stoßfängern, Windschutzscheibe und Außenspiegeln. Wird eines dieser Bauteile getauscht oder auch nur ausgebaut, muss das System danach kalibriert werden — sonst misst der Abstandsregler falsch oder der Spurhalteassistent zieht zur Seite. Diese Kalibrierung ist ein eigener Kostenpunkt mit eigener Herstellervorschrift, und in Kostenvoranschlägen fehlt sie regelmäßig. Nach einem Frontschaden auf dem Ring oder einem Parkrempler mit Sensorbeteiligung nehmen wir die verbauten Systeme deshalb einzeln auf und weisen die Kalibrierung als Position aus. Steht sie nicht im Gutachten, zahlt die Versicherung sie später nicht — und Sie fahren mit einem Assistenten weiter, dem Sie nicht mehr trauen können.` },
    { h3: 'Wie läuft es ab?', text: `Sie melden sich telefonisch oder über WhatsApp und schildern kurz, was passiert ist. Der Sachverständige dokumentiert vor Ort — in Ihrer Straße, in der Werkstatt oder am Abstellort, auch wenn das Fahrzeug nicht mehr fahrbereit ist. Sie erhalten das Gutachten binnen 48 Stunden; parallel läuft die Regulierung, auf Wunsch mit Verkehrsrechtsanwalt, Werkstatt und Mietwagen aus dem Netzwerk. Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Köln — neutral, gerichtsfest, schnell vor Ort. Rufen Sie an oder schreiben Sie über WhatsApp: In fünf Minuten ist geklärt, ob ein Sachverständiger sinnvoll ist und wie es weitergeht.` },
  ],
  leverkusen: [
    { text: `Leverkusen ist Werkstadt und Autobahnknoten zugleich. Der Chempark in Wiesdorf zieht Werks-, Liefer- und Schichtverkehr an, und über dem Stadtgebiet kreuzen sich gleich drei Autobahnen: Am Autobahnkreuz Leverkusen treffen A 1 und A 3 aufeinander, wenige Kilometer westlich verbindet das Kreuz Leverkusen-West die A 1 mit der A 59. Unser Kfz-Gutachter ist meist binnen 60 Minuten in Wiesdorf, Opladen, Schlebusch, Küppersteg, Steinbüchel, Rheindorf oder Hitdorf. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Leverkusens Stadtteile bringen jeweils eigene Schadensbilder mit. Wiesdorf lebt vom Chempark und der City: Werksverkehr, Schichtwechsel und Einkaufsverkehr überlagern sich, Auffahr- und Spurwechselschäden dominieren. Opladen ist das historische Zentrum mit Bahnhof und engem Straßenraster — dort sind es Park-Rempler, Abbiegeschäden und Konflikte mit Fußgängern und Radfahrenden. In Schlebusch steigt das Aufkommen an Spieltagen in der BayArena spürbar an. Küppersteg und Manfort liegen zwischen Bahn und Autobahn und tragen viel Durchgangsverkehr. Steinbüchel, Lützenkirchen und Quettingen sind Wohnlagen mit Vorfahrt- und Rangierschäden vor Schulen und Kitas. Rheindorf und Hitdorf am Rhein sind ruhiger, aber über wenige Zufahrten erschlossen — fällt eine aus, staut sich alles auf der Alternative.` },
    { h3: 'Welche Rechte haben Sie nach einem unverschuldeten Unfall?', text: `Sie wählen den Kfz-Gutachter selbst — nicht die gegnerische Versicherung und auch nicht deren Schaden-Hotline. Wir arbeiten nach BVSK-Standard und dokumentieren gerichtsfest, von der Stoßfängerdelle bis zum Strukturschaden:`, liste: LEISTUNGS_LISTE },
    { h3: 'Warum die A 1 an der Rheinbrücke unfallträchtig bleibt', text: `Die neue Leverkusener Rheinbrücke ist erst zur Hälfte fertig: Beide Fahrtrichtungen laufen derzeit über ein einziges Bauwerk, während das zweite Teilbauwerk daneben entsteht. Enge Fahrstreifen, versetzte Verkehrsführung und wechselnde Sperrungen rund um das Kreuz Leverkusen-West gehören zum Alltag, und jede Montagephase am Stahlüberbau verschiebt den Verkehr erneut. Das erzeugt genau die Konstellation, in der Auffahr- und Streifschäden entstehen — und in der die Haftungsfrage von der Beschilderung am Unfalltag abhängt. Wir halten die Verkehrsführung deshalb mit fest, nicht nur den Schaden am Fahrzeug.` },
    { h3: 'Werks- und Lkw-Verkehr rund um den Chempark: Worauf kommt es an?', text: `Wo Tanklastzüge, Werkslogistik und Berufsverkehr aufeinandertreffen, ist oft unklar, wer haftet: Fahrer, Spedition oder auftraggebendes Unternehmen. Entscheidend ist die saubere Aufnahme von Schadensspur, Fahrzeugdaten und Beteiligten — nur damit lässt sich die richtige Haftpflichtversicherung adressieren. Bei jüngeren Fahrzeugen kommt der merkantile Minderwert hinzu, der nach einem Lkw-Streifschaden regelmäßig unterschätzt wird.` },
    { h3: 'Warum nicht der Gutachter der Versicherung?', text: `Der von der gegnerischen Versicherung beauftragte Prüfer arbeitet in deren Auftrag, nicht in Ihrem. Sie haben Anspruch auf einen unabhängigen Sachverständigen, der ausschließlich für Sie dokumentiert. Kürzt die Versicherung anschließend, erstellen wir ein Gegengutachten — auch das wird übernommen, ebenso Anwalt, Mietwagen oder Nutzungsausfall.` },
    { h3: 'Streifschaden in der Baustellenführung: Was dabei am Fahrzeug passiert', text: `Ein Streifschaden in einer verengten Fahrstreifenführung sieht nach wenig aus und ist selten wenig. Der Kontakt läuft über mehrere Bauteile hinweg — Stoßfängerecke, Kotflügel, beide Türen, Schweller, Radlauf —, und jedes davon hat eigene Befestigungspunkte. Entscheidend ist nicht die Länge des Kratzers, sondern ob sich die Spaltmaße verändert haben: Steht eine Tür auch nur einen Millimeter anders, ist der Anprall bis in die Struktur gegangen. Dazu kommt die Lackschichtdicke, die verrät, ob an dieser Stelle schon einmal gearbeitet wurde. Wir messen das, statt es zu schätzen. Ein als reiner Lackschaden abgerechneter Streifschaden, der in Wahrheit die Türscharniere erfasst hat, fällt Ihnen spätestens beim Wiederverkauf auf die Füße.` },
    { h3: 'Transporter und Werksfahrzeuge: Warum die Bewertung anders läuft', text: `Bei Kastenwagen und Pritschen steckt der Wert nicht im Fahrzeug allein, sondern im Aufbau: Regalsystem, Trennwand, Kühlkoffer, Ladebordwand, Beschriftung. Nach einem Schaden wird das gern übersehen, weil die Kalkulationssysteme den Serienstand kennen und den Ausbau nicht. Dazu kommt der Nutzungsausfall, der bei einem gewerblich genutzten Fahrzeug nicht nach der Pkw-Tabelle bemessen wird, sondern nach dem, was der Ausfall den Betrieb tatsächlich kostet. Wir nehmen Aufbau und Sonderausstattung einzeln auf und dokumentieren die betriebliche Nutzung — sonst wird aus einem eingerichteten Handwerkerfahrzeug auf dem Papier ein leerer Transporter.` },
    { h3: 'Welche Werkstatt darf reparieren?', text: `Die, die Sie wählen: freier Fachbetrieb in Wiesdorf, Markenwerkstatt in Opladen oder Karosseriespezialist in Schlebusch. Abrechnungsgrundlage ist das gerichtsfeste Gutachten, nicht der Kostenvoranschlag der Gegenseite. Verweist die Versicherung auf einen günstigeren Betrieb, muss sie belegen, dass er gleichwertig und für Sie zumutbar erreichbar ist — bei einem scheckheftgepflegten Fahrzeug innerhalb der Herstellergarantie gilt das regelmäßig nicht. Wir vermitteln verlässliche Partner in der Region und halten im Gutachten fest, welche Reparaturwege fachlich überhaupt in Frage kommen.` },
    { h3: 'Was passiert nach Ihrem Anruf?', text: `Sie schildern kurz den Hergang — telefonisch oder per WhatsApp. Der Sachverständige kommt in der Regel binnen 60 Minuten zum Fahrzeug, gleich ob es in einer Tiefgarage in Wiesdorf steht oder am Straßenrand in Rheindorf. Bringen Sie, wenn vorhanden, Führerschein, Fahrzeugschein und die Daten des Unfallgegners mit; alles Weitere nehmen wir vor Ort auf. Nach 48 Stunden liegt das Gutachten vor, die Regulierung läuft parallel. Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Leverkusen — neutral, gerichtsfest, schnell vor Ort. Ein kurzer Anruf genügt, um zu klären, ob sich ein Sachverständiger für Ihren Fall lohnt.` },
  ],
  'bergisch-gladbach': [
    { text: `Bergisch Gladbach ist Kreisstadt und größte Stadt des Rheinisch-Bergischen Kreises — und verkehrlich ein Zwitter. Im Westen hängt die Stadt eng an Köln: Die A 4 erschließt sie über die Anschlussstellen Bensberg, Frankenforst und Refrath, dahinter geht es über Köln-Merheim direkt in den Kölner Osten. Im Osten beginnt das Bergische Land mit Landstraßen, Waldrändern und Wildwechsel. Unser Kfz-Gutachter ist meist binnen 60 Minuten in Bensberg, Refrath, Schildgen, Heidkamp, Paffrath, Hand, Sand oder Herkenrath. 0 € für Sie — die gegnerische Versicherung trägt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Die Stadtteile haben einen sehr unterschiedlichen Schadens-Charakter. Bensberg mit Schloss, Altstadtgassen und Hanglage ist Schwerpunkt für Rangier- und Park-Rempler, dazu Ausparkschäden an schmalen Straßen. Refrath und Frankenforst liegen direkt an der A 4 und tragen den Berufsverkehr Richtung Köln — dort dominieren Auffahrunfälle an den Rückstauenden vor den Auffahrten. Die Stadtmitte um Heidkamp und Gronau ist Einkaufs- und Verwaltungsverkehr mit dem typischen Innenstadtbild aus Tür-Öffner- und Abbiegeschäden. Schildgen und Paffrath im Norden sind Wohnlagen mit ausgeprägten Pendlerspitzen morgens und abends. Hand, Sand und Herkenrath liegen am Übergang ins Bergische: enge Kurven, unbeleuchtete Abschnitte, Wildwechsel in der Dämmerung.` },
    { h3: 'Was macht ein Gutachten gerichtsfest?', text: `Nachvollziehbarkeit. Jede Position muss belegt sein — durch Foto, Messwert und Kalkulationsgrundlage, nicht durch Erfahrungswerte. Wir arbeiten nach BVSK-Standard und liefern:`, liste: LEISTUNGS_LISTE },
    { h3: 'Warum die A 4 zwischen Merheim und Untereschbach ein Dauerthema ist', text: `Der Abschnitt zwischen Köln-Merheim und Overath-Untereschbach ist über Jahre in Bauabschnitten erneuert worden, einschließlich der Anschlussstellen Bensberg, Frankenforst und Refrath. Einspurige Führungen, nächtliche Auffahrtssperrungen und wechselnde Umleitungen gehören seither zum Pendleralltag — und mit ihnen die Schäden, die dabei entstehen: Auffahrunfälle am Stauende, Streifschäden in verengten Fahrstreifen, Kollisionen beim Einfädeln, wenn die gewohnte Auffahrt gesperrt ist. Wir dokumentieren die Verkehrsführung am Unfalltag mit, weil sie für die Haftungsfrage regelmäßig entscheidend ist.` },
    { h3: 'Wildunfall im Bergischen: Was muss dokumentiert werden?', text: `Zwischen Sand, Herkenrath und dem Königsforst sind Wildunfälle keine Seltenheit — und die Abwicklung steht und fällt mit der Spur: Wildhaare, Aufprallpunkt, Lackabrieb, Bremsweg und Wildunfallbescheinigung müssen zusammenpassen, sonst hakt die Teilkasko. Noch heikler wird es beim Ausweichunfall ohne Wildberührung, denn dann prüft der Versicherer, ob das Ausweichen überhaupt geboten war. Ein neutraler Sachverständiger nimmt das auf, bevor das Fahrzeug bewegt wird.` },
    { h3: 'Totalschaden oder 130-Prozent-Reparatur?', text: `Kritisch wird es, wenn die Reparaturkosten den Wiederbeschaffungswert übersteigen. Dann entscheidet sich, ob fiktive Abrechnung, die 130-Prozent-Regelung oder die Auszahlung des Wiederbeschaffungswerts der bessere Weg ist — und diese Entscheidung hängt an sauber ermitteltem Restwert und Wiederbeschaffungswert. Wir dokumentieren so, dass Ihnen alle drei Wege offenbleiben, statt einen davon vorwegzunehmen.` },
    { h3: 'Was ein Wildunfall vorn am Fahrzeug tatsächlich anrichtet', text: `Ein Reh wiegt wenig und richtet trotzdem viel an, weil der Anprall hoch und mittig sitzt. Zuerst gibt der Stoßfänger nach, dahinter stehen aber Kühler, Klimakondensator und Ladeluftkühler dicht gestaffelt — ein Riss dort zeigt sich oft erst als Pfütze am nächsten Morgen. Darüber liegen Scheinwerfer mit Steuergerät und Leuchtweitensensorik, dahinter der Querträger, dessen Verformung man von außen nicht sieht. Bei Fahrzeugen mit Notbremsassistent sitzt zudem das Radarmodul hinter der Kühlergrillblende: Es kann intakt aussehen und trotzdem dejustiert sein. Wir demontieren die Frontverkleidung für die Aufnahme deshalb im Zweifel, statt vom Lackschaden auf den Rest zu schließen — genau dort entstehen sonst die Nachforderungen, die niemand mehr bezahlt bekommt.` },
    { h3: 'Teilkasko oder Haftpflicht: Wer zahlt beim Wildschaden?', text: `Beim Zusammenstoß mit Haarwild greift Ihre Teilkasko, sofern vorhanden — mit Selbstbeteiligung, aber ohne Rückstufung. Ist ein anderes Fahrzeug beteiligt, etwa weil jemand auf Ihr bremsendes Auto auffährt, haftet dessen Kfz-Haftpflicht für diesen Teil des Schadens. Beides kann in einem einzigen Unfall zusammentreffen, und dann muss sauber getrennt werden, welcher Schaden zu welchem Ereignis gehört. Genau daran scheitern Abrechnungen im Bergischen häufig. Wir ordnen die Schadensbilder den Anstößen zu, statt sie zu einer Summe zu verschmelzen, damit jeder Versicherer den Teil trägt, für den er zuständig ist.` },
    { h3: 'Dürfen Sie die Werkstatt selbst aussuchen?', text: `Ja. Freier Fachbetrieb oder Markenwerkstatt ist Ihre Entscheidung, nicht die der gegnerischen Versicherung. Wir vermitteln verlässliche Betriebe in Bensberg, Refrath oder Heidkamp und begleiten die Abrechnung auf Grundlage des Gutachtens. Wichtig bei Fahrzeugen mit Alu- oder Mischbauweise: Nicht jeder Betrieb darf solche Strukturteile instand setzen, dafür braucht es Zulassung und Ausrüstung. Wir halten im Gutachten fest, welche Reparaturart der Hersteller vorschreibt — damit die Reparatur später nicht an einer fehlenden Freigabe scheitert.` },
    { h3: 'Vom Anruf bis zum Gutachten', text: `Sie melden sich, wir kommen — in der Regel binnen 60 Minuten, in allen Stadtteilen einschließlich der Ortslagen im Osten. Steht das Fahrzeug nach einem Wildunfall am Straßenrand, kommen wir dorthin; bewegen Sie es vorher möglichst nicht und lassen Sie die Spuren, wie sie sind. Nach 48 Stunden liegt das Gutachten vor; Anwalt, Werkstatt und Mietwagen laufen auf Wunsch parallel über das Claimondo-Netzwerk. Für Sie entstehen keine Kosten.` },
    { text: `Kfz-Gutachter Bergisch Gladbach — neutral, gerichtsfest, schnell vor Ort. Rufen Sie an oder schreiben Sie über WhatsApp; wir sagen Ihnen offen, ob sich ein Gutachten in Ihrem Fall lohnt.` },
  ],
  pulheim: [
    { text: `Pulheim liegt nordwestlich von Köln zwischen Feldern, Bahnlinie und Autobahn — und ist vor allem eines: Pendlerstadt. Die A 1 erschließt das Stadtgebiet über die nahen Anschlussstellen Köln-Lövenich und Köln-Bocklemünd, am Kreuz Köln-Nord geht es weiter auf die A 57 Richtung Neuss und Krefeld, und die B 59 führt als Umgehung westlich an Pulheim und Stommeln vorbei nach Köln hinein. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Pulheim-Mitte, Brauweiler, Stommeln, Sinnersdorf, Sinthern, Geyen oder Dansweiler. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Die Ortsteile liegen weit auseinander und haben sehr verschiedene Lagen. Pulheim-Mitte ist Verwaltungs- und Einkaufskern mit Bahnhof: Park-Rempler am Marktplatz, Rangierschäden auf den Kundenparkplätzen, morgendlicher Andrang rund um den Bahnhofsvorplatz. Brauweiler mit der Abtei zieht Besucher an und liegt zugleich am nächsten an der A 1 — dort mischen sich Ausflugs- und Berufsverkehr. Stommeln ist gewachsener Ortskern mit Bahnhaltepunkt und engen Durchfahrten. Sinnersdorf grenzt an den Kölner Norden und trägt dessen Durchgangsverkehr mit. Sinthern, Geyen und Dansweiler sind ländlich geprägt: Wirtschaftswege, landwirtschaftlicher Verkehr und schlechte Sicht an Feldeinmündungen. In den Gewerbelagen kommt der Lieferverkehr hinzu.` },
    { h3: 'Welche Rechte haben Sie bei der Gutachter-Wahl?', text: `Sie beauftragen den Sachverständigen, nicht die gegnerische Versicherung — und Sie müssen dafür nichts vorstrecken. Wir arbeiten nach BVSK-Standard, ausschließlich in Ihrem Interesse:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wo passiert es in Pulheim am häufigsten?', text: `Drei Muster wiederholen sich. Erstens die Zufahrten Richtung A 1: Wer morgens aus Brauweiler oder Dansweiler kommt, trifft auf Rückstau, und am Stauende entstehen Auffahrunfälle. Zweitens die Umgehung B 59 mit ihren Anschlussknoten — dort sind es Vorfahrt- und Einfädelfehler bei hohem Tempounterschied. Drittens die Wirtschaftswege und Feldeinmündungen zwischen den Ortsteilen: unübersichtliche Anschlüsse, langsame landwirtschaftliche Gespanne, im Winter früh einsetzende Dunkelheit. Dazu kommt der Ausflugsverkehr rund um die Abtei Brauweiler an starken Wochenenden.` },
    { h3: 'Unfall auf dem Weg zur Arbeit — ist das ein Arbeitsunfall?', text: `Der Weg zwischen Wohnung und Arbeitsstätte steht unter dem Schutz der gesetzlichen Unfallversicherung. Für den Schaden am Fahrzeug bleibt aber die Kfz-Haftpflicht des Verursachers zuständig — beides läuft parallel und darf nicht vermischt werden. In einer Stadt, in der ein großer Teil der Einwohner täglich nach Köln pendelt, ist das ein häufiges Missverständnis. Wir dokumentieren den Fahrzeugschaden so, dass er unabhängig von der Personenschadenseite abgewickelt werden kann.` },
    { h3: 'Mietwagen und Nutzungsausfall: Was steht Ihnen zu?', text: `Während der Reparatur haben Sie Anspruch auf einen gleichwertigen Mietwagen oder auf Nutzungsausfallentschädigung — wahlweise, nicht beides. Wer täglich pendelt, fährt meist besser mit dem Mietwagen; wer ein Zweitfahrzeug hat, oft besser mit der Entschädigung. Wir ermitteln die Ausfallzeit im Gutachten, damit die Gegenseite sie nicht nach eigenem Ermessen kürzt, und vermitteln auf Wunsch Mietwagen und Verkehrsrechtsanwalt aus dem Claimondo-Netzwerk.` },
    { h3: 'Seitlicher Anprall an einer Feldeinmündung: das unterschätzte Schadensbild', text: `Wer aus einem Wirtschaftsweg heraus übersehen wird, bekommt den Anstoß seitlich — und das ist die Richtung, gegen die ein Fahrzeug am wenigsten Struktur hat. Die Energie läuft über Tür und Schweller in die B-Säule, und ob dort etwas nachgegeben hat, sieht man von außen praktisch nie: Die Tür schließt weiter, der Lack ist nur zerkratzt. Verräterisch sind die Spaltmaße, ein hakender Fensterheber und Faltenbildung am Schwellerfalz. Dazu kommen die Seitenairbags: Haben sie ausgelöst, müssen Gurtstraffer, Sitzbezüge und teils die Verkleidungen mit erneuert werden. Wir vermessen die Karosserie im Zweifel, statt sie zu begutachten — bei einem Seitenanprall ist das der Unterschied zwischen einem sicheren und einem nur ordentlich aussehenden Auto.` },
    { h3: 'Elektro- und Hybridfahrzeug beschädigt: Was zusätzlich zu prüfen ist', text: `Bei einem Stromer entscheidet die Hochvoltbatterie über fast alles, denn sie ist das teuerste Einzelteil. Sie liegt flach im Unterboden und ist damit genau dort, wo Bordsteinkontakt, Aufsetzer und seitliche Anstöße wirken. Ein Gehäuseschaden ist auch ohne sichtbare Verformung möglich, und viele Hersteller verlangen nach einem Unfall eine dokumentierte Prüfung samt Auslesen des Batteriemanagements. Ohne dieses Protokoll wird das Fahrzeug später schwer verkäuflich, und der Restwert bricht ein. Wir halten Ladezustand, Fehlerspeicher und den Zustand der Unterbodenverkleidung fest und weisen die Herstellerprüfung als eigene Position aus, statt sie im Stundenlohn verschwinden zu lassen.` },
    { h3: 'Freie Werkstattwahl — auch in Pulheim?', text: `Ja, und das gilt unabhängig davon, ob die Versicherung eine eigene Empfehlung ausspricht. Wir kennen Karosserie- und Lackbetriebe in Pulheim-Mitte, Brauweiler und Stommeln; die Reparatur erfolgt fachgerecht nach den Vorgaben des Gutachtens. Bei Elektrofahrzeugen kommt hinzu, dass nur Betriebe mit Hochvolt-Qualifikation am Fahrzeug arbeiten dürfen — das schränkt die Auswahl ein, hebt aber Ihr Wahlrecht nicht auf.` },
    { h3: 'Der Ablauf, kurz gefasst', text: `Sie rufen an oder schreiben per WhatsApp. Der Sachverständige kommt meist binnen 60 Minuten, auch in die Außenorte zwischen Sinthern, Geyen und Dansweiler. Nach 48 Stunden liegt das Gutachten vor, die Regulierung läuft parallel. Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Pulheim — neutral, gerichtsfest, schnell vor Ort. Melden Sie sich kurz, dann klären wir gemeinsam, ob ein Gutachten sinnvoll ist.` },
  ],
  bruehl: [
    { text: `Brühl hat zwei Gesichter: das UNESCO-Welterbe Schloss Augustusburg mit Schlosspark und gediegenem Stadtkern — und das Phantasialand mit dem Besucherverkehr eines überregionalen Freizeitparks. Verkehrlich läuft beides über wenige Achsen. Die A 553 beginnt am Autobahnkreuz Bliesheim und geht nach gut dreizehn Kilometern am Kölner Stadtrand in die B 51 über; parallel führt die B 265 Luxemburger Straße Richtung Hürth und Köln. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Brühl-Mitte, Vochem, Pingsdorf, Kierberg, Badorf, Heide oder Schwadorf. 0 € für Sie — die gegnerische Versicherung trägt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Brühls Schadensdynamik ist tourismusgeprägt und damit stark wochentagsabhängig. An starken Wochenenden und in den Ferien füllen sich die Besucherparkflächen, und mit ihnen häufen sich Park-Rempler, Anfahrschäden beim Rangieren mit Wohnmobil oder Anhänger und Kollisionen auf den Zufahrtsstraßen. Rund um Schloss und Schlosspark rangieren Auswärtige in engen Altstadtgassen, oft mit größeren Fahrzeugen, als die Straße verträgt. Vochem und Kierberg im Norden sind Wohn- und Gewerbelagen mit Pendlerverkehr Richtung Hürth und Köln. Pingsdorf und Badorf im Süden gehen ins Vorgebirge über — dort prägen Landstraßen, Obst- und Gartenbaubetriebe und langsamer landwirtschaftlicher Verkehr das Bild.` },
    { h3: 'Was leistet das Gutachten konkret?', text: `Es beziffert Ihren Schaden vollständig und belegbar — und zwar bevor die Gegenseite eine eigene Zahl in den Raum stellt. Wir arbeiten nach BVSK-Standard; auf Wunsch übernimmt ein Verkehrsrechtsanwalt aus dem Claimondo-Netzwerk das komplette Abwicklungsmandat:`, liste: LEISTUNGS_LISTE },
    { h3: 'A 553: kurze Autobahn, hohe Last', text: `Mit rund dreizehn Kilometern ist die A 553 eine der kürzeren Autobahnen im Rheinland — und durchgehend nur zweistreifig je Richtung. Sie nimmt am Kreuz Bliesheim den Verkehr von A 1 und A 61 auf und gibt ihn im Brühler Norden an die B 51 Richtung Köln ab. Fällt eine Spur aus, etwa bei den wiederkehrenden Engpässen zwischen Kreuz Bliesheim und Brühl-Süd, gibt es keine dritte Spur als Puffer: Der Verkehr steht sofort, und am Stauende entstehen genau die Auffahrschäden, die wir hier am häufigsten begutachten.` },
    { h3: 'Park-Rempler mit Fahrerflucht: Welche Optionen bleiben?', text: `Auf großen Besucherparkflächen ist der Verursacher oft nicht mehr greifbar. Dann geht es um die eigene Vollkaskoversicherung oder — bei Personenschaden — um die Verkehrsopferhilfe. Beides hängt davon ab, dass der Schaden dokumentiert ist, bevor das Fahrzeug bewegt wird: Anstoßhöhe, Fremdlackspuren, Schadensrichtung. Stellt sich die eigene Vollkasko quer oder kürzt sie, ist ein Gegengutachten der übliche Weg.` },
    { h3: 'Unfall mit ausländischer Beteiligung — was nun?', text: `Bei einem überregionalen Ausflugsziel keine Seltenheit. Über die Grüne Karte und den Zentralruf der Autoversicherer lässt sich auch der ausländische Haftpflichtversicherer ermitteln und in Deutschland in Anspruch nehmen. Entscheidend sind vollständige Fahrzeug- und Versicherungsdaten am Unfallort — später sind sie kaum noch zu beschaffen. Wir und das Claimondo-Netzwerk übernehmen die Abwicklung mit ausländischen Versicherern.` },
    { h3: 'Warum ein Parkrempler selten ein Lackschaden ist', text: `Ein Stoßfänger ist heute kein Blech mehr, sondern ein Bauteil mit Innenleben: Dahinter sitzen Prallträger, Deformationselemente und die Ultraschallsensoren der Einparkhilfe, bei vielen Fahrzeugen zusätzlich Kamera und Radar für Totwinkel- und Querverkehrswarner. Der Kunststoff federt zurück und sieht danach nahezu unbeschädigt aus, während die Halteklammern gebrochen und die Sensorhalter verschoben sind. Sichtbar wird das erst, wenn der Stoßfänger abgenommen ist — und daran, dass die Einparkhilfe unregelmäßig piept. Deshalb nehmen wir bei jedem Anstoß im Stoßfängerbereich die verbauten Systeme mit auf. Ein Schaden, der als Lackierung abgerechnet wird, obwohl der Prallträger nachgegeben hat, kostet Sie beim nächsten Aufprall genau die Knautschzone, für die Sie bezahlt haben.` },
    { h3: 'Anhänger, Wohnmobil und Fahrradträger: Was mitbegutachtet gehört', text: `Wer mit Gespann unterwegs ist, hat im Schadensfall zwei Fahrzeuge und oft zwei Versicherer. Beim Anhänger zählt nicht nur das Blech, sondern die Deichsel, die Auflaufeinrichtung und der Rahmen — verzieht sich dort etwas, ist die Betriebserlaubnis berührt und der Anhänger nicht mehr verkehrssicher. Bei Wohnmobilen kommen Aufbau, Dichtigkeit und Einbauten hinzu: Ein Anstoß an der Seitenwand kann die Verklebung öffnen, und Feuchtigkeit zeigt sich erst Monate später. Auch ein beschädigter Fahrradträger samt Rädern gehört in die Aufnahme, weil er zum Schaden aus demselben Ereignis zählt. Wir dokumentieren Zugfahrzeug und Anhänger getrennt, damit beide Ansprüche belegt sind.` },
    { h3: 'Freie Werkstatt oder Vertragswerkstatt?', text: `Beides möglich, Sie entscheiden. Bei jüngeren Fahrzeugen mit Herstellergarantie spricht viel für die Markenwerkstatt, bei älteren oft für den freien Fachbetrieb. Wir vermitteln Karosserie- und Lackbetriebe in Brühl-Mitte, Vochem und Pingsdorf; abgerechnet wird über das Gutachten. Kürzt die Gegenseite mit Verweis auf einen günstigeren Stundensatz, prüfen wir, ob der genannte Betrieb überhaupt gleichwertig ausgestattet ist — das ist der Punkt, an dem solche Verweise regelmäßig scheitern.` },
    { h3: 'Der Ablauf in Brühl', text: `Anruf oder WhatsApp, Vor-Ort-Termin meist binnen 60 Minuten — auch auf dem Parkplatz, wenn das Fahrzeug dort steht und nicht mehr bewegt werden soll. Fotografieren Sie vorher die Stellung beider Fahrzeuge und die Umgebung, das erleichtert die spätere Zuordnung erheblich. Gutachten binnen 48 Stunden, Regulierung parallel, für Sie 0 €.` },
    { text: `Kfz-Gutachter Brühl — neutral, gerichtsfest, schnell vor Ort. Ein kurzer Anruf genügt, um zu klären, wie es weitergeht.` },
  ],
  frechen: [
    { text: `Frechen liegt westlich von Köln unmittelbar an der A 4 und ist seit Jahrhunderten Steinzeug- und Keramikstadt — heute daneben Gewerbe- und Pendlerstandort mit Anschluss in beide Richtungen, nach Köln und nach Aachen. Verkehrlich prägen die A 4 mit der Anschlussstelle Frechen-Nord, die B 264 Aachener Straße als innerörtliche Hauptachse und die Gewerbeflächen im Norden das Bild. Unser Kfz-Gutachter ist meist binnen 60 Minuten in Frechen-Mitte, Königsdorf, Habbelrath, Bachem, Buschbell oder Grefrath. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Frechens Ortsteile verteilen sich zwischen Autobahn, Bahn und Feldflur. Frechen-Mitte hat die klassische Innenstadtlage mit Marktplatz, Hauptstraße und Kundenverkehr — dort dominieren Park-Rempler, Ausparkschäden und Abbiegekonflikte. Königsdorf im Nordosten liegt zwischen A 4, Bahnhaltepunkt und Königsdorfer Wald und ist ein Wohn-Gewerbe-Mix mit ausgeprägtem Berufsverkehr. Habbelrath, Grefrath und Bachem sind ländlicher geprägt, mit Landstraßenverkehr und landwirtschaftlichen Fahrzeugen im Sommer. In den Gewerbelagen im Norden bestimmt Logistik das Geschehen: Rangierschäden auf Betriebshöfen, Streifschäden an engen Zufahrten, Kollisionen zwischen Lkw und Pkw beim Einfädeln.` },
    { h3: 'Warum überhaupt ein neutraler Gutachter?', text: `Weil die ermittelte Schadenhöhe die Verhandlungsgrundlage ist — und wer sie ermittelt, bestimmt, worüber überhaupt gesprochen wird. Wir arbeiten nach BVSK-Standard und ausschließlich in Ihrem Auftrag:`, liste: LEISTUNGS_LISTE },
    { h3: 'A 4 und die neue Anschlussstelle Königsdorf', text: `Zwischen der Anschlussstelle Frechen-Nord und dem Autobahnkreuz Kerpen entsteht mit der Querspange eine zusätzliche A-4-Anschlussstelle Frechen-Königsdorf. Für die Brückenbauarbeiten wurde die A 4 in diesem Abschnitt mehrfach voll gesperrt, mit weiträumigen Umleitungen über die B 264 und das nachgeordnete Netz. Genau das ist die Phase, in der Ortsunkundige auf Strecken fahren, die sie nicht kennen: Abbiegefehler an Ortsdurchfahrten, Vorfahrtsverstöße an Knoten ohne Ampel, Auffahrschäden an ungewohnten Stauenden. Bis zur Fertigstellung bleibt das ein Dauerzustand — wir kennen die Umleitungsführungen aus dem Tagesgeschäft.` },
    { h3: 'Firmen- und Flottenfahrzeuge: Was ist anders?', text: `Bei Firmenwagen greifen zwei Versicherungsverhältnisse ineinander, und beide hätten die gleiche Frage gern anders beantwortet. Entscheidend ist, dass Halter, Nutzer und Kostenträger sauber getrennt dokumentiert sind — sonst entsteht Streit über Nutzungsausfall und Vorsteuerabzug. Bei Leasing- und Mietfahrzeugen kommt die Rückgabebewertung hinzu: Was jetzt nicht als merkantiler Minderwert festgehalten wird, taucht später als Nachforderung des Leasinggebers wieder auf.` },
    { h3: 'Totalschaden: Welche Abrechnung lohnt sich?', text: `Fiktive Abrechnung auf Gutachtenbasis, Reparatur nach der 130-Prozent-Regelung oder Auszahlung des Wiederbeschaffungswerts — welcher Weg der richtige ist, hängt an Fahrzeugalter, Restwert und daran, ob Sie das Fahrzeug behalten wollen. Wir rechnen die Varianten durch, bevor Sie sich festlegen, statt Ihnen hinterher zu erklären, warum es nur eine gab.` },
    { h3: 'Werkstattwahl — Ihr Recht, nicht das der Versicherung', text: `Sie entscheiden, wo repariert wird. Wir kennen verlässliche Karosserie- und Lackbetriebe in Frechen-Mitte, Königsdorf und Habbelrath, vom freien Fachbetrieb bis zur Markenwerkstatt, und die Abrechnung läuft über das Gutachten.` },
    { h3: 'In drei Schritten zum Gutachten', text: `Melden, dokumentieren, abwickeln: Anruf oder WhatsApp, Vor-Ort-Termin meist binnen 60 Minuten in allen Ortsteilen, Gutachten binnen 48 Stunden. Die Versicherungsabwicklung läuft parallel — für Sie kostenfrei.` },
    { text: `Kfz-Gutachter Frechen — neutral, gerichtsfest, schnell vor Ort. Ein Anruf reicht, um zu klären, wie es in Ihrem Fall weitergeht.` },
  ],
  huerth: [
    { text: `Hürth liegt dort, wo der Kölner Westen in den Rhein-Erft-Kreis übergeht — direkt am Autobahnkreuz Köln-West, wo A 1 und A 4 zusammentreffen, und an der B 265 Luxemburger Straße, die vom Kölner Barbarossaplatz über Sülz und Klettenberg bis nach Erftstadt führt. Dazu kommt die Studio-Stadt: In den MMC Studios entstehen große Fernsehproduktionen, mit entsprechendem Produktions- und Publikumsverkehr. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Hürth-Mitte, Hermülheim, Efferen, Alt-Hürth, Gleuel, Kalscheuren oder Berrenrath. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Ein kompaktes Stadtgebiet mit sehr unterschiedlichen Lagen. Hürth-Mitte ist Einkaufs- und Verwaltungsschwerpunkt mit Parkhaus- und Rangierschäden. Hermülheim grenzt unmittelbar an Köln und trägt den Durchgangsverkehr der Luxemburger Straße; der Stadtteil ist zugleich als Geburtsort von Michael Schumacher bekannt. Efferen ist über die Stadtbahn eng mit Köln verzahnt — dort teilen sich Auto und Bahn den Straßenraum. Alt-Hürth, Gleuel und Berrenrath sind gewachsene Ortslagen mit engen Durchfahrten, Kalscheuren und Knapsack dagegen Gewerbe- und Industriestandorte mit Lkw- und Werksverkehr. Die A 1 erschließt die Stadt über die Anschlussstellen Gleuel und Hürth, das Kreuz Köln-West liegt praktisch vor der Haustür.` },
    { h3: 'Was gehört in ein gerichtsfestes Gutachten?', text: `Alles, was später jemand nachprüfen können muss — und zwar dokumentiert, nicht rekonstruiert. Wir arbeiten nach BVSK-Standard und halten vollständig fest:`, liste: LEISTUNGS_LISTE },
    { h3: 'Kreuz Köln-West: Warum so unfallträchtig?', text: `Wo A 1 und A 4 zusammenkommen, verflechtet sich der Fernverkehr Richtung Aachen, Dortmund und Olpe mit dem Kölner Berufsverkehr. Der Rückstau reicht regelmäßig weit in die Zubringer hinein, und genau am Stauende entstehen die typischen Auffahrunfälle: Der Vordermann steht, der Nachfolgende rechnet noch mit fließendem Verkehr. Dazu kommen Spurwechsel-Kollisionen kurz vor den Verzweigungen. Wer dort auffährt, gilt zunächst als Verursacher — es sei denn, die Dokumentation zeigt etwas anderes, etwa einen abrupten Fahrstreifenwechsel des Vordermanns.` },
    { h3: 'Luxemburger Straße: Dauerbaustelle mit eigenem Schadensbild', text: `Die B 265 ist Hürths Hauptschlagader und seit Jahren Umbau- und Planungsthema, bis hin zur diskutierten Ortsumgehung. Ausbauabschnitte, geänderte Abbiegebeziehungen und verlegte Radwege ändern das Verhalten aller Beteiligten und erzeugen eine eigene Schadensklasse: Abbiegeunfälle mit Radfahrenden, Kollisionen an provisorisch geführten Einmündungen, Streifschäden in verengten Spuren. Wir fotografieren die Örtlichkeit deshalb im Zustand des Unfalltages, weil Baustellen weiterwandern und die Beweislage sonst binnen Wochen verschwunden ist.` },
    { h3: 'Studio- und Produktionsfahrzeuge: Was ist zu beachten?', text: `Rund um die Studios sind Sprinter, Technikfahrzeuge und Leihwagen unterwegs, oft auf fremde Halter zugelassen und mit knappen Drehplänen. Wird ein solches Fahrzeug beschädigt, hängen an der Dokumentation gleich mehrere Fragen: Wer ist Halter, wer Fahrer, wer trägt den Ausfall, und wie ist der Nutzungsausfall zu bemessen. Wir nehmen das so auf, dass Firmenversicherung und gegnerische Haftpflicht damit arbeiten können, statt sich gegenseitig zu verweisen.` },
    { h3: 'Wer zahlt den Anwalt?', text: `Bei unverschuldetem Unfall die gegnerische Versicherung — genau wie Gutachter, Mietwagen und Abschleppkosten. Wir vermitteln über das Claimondo-Partnernetzwerk einen Verkehrsrechtsanwalt aus der Region, der den Fall von der Schadensmeldung bis zur Auszahlung führt.` },
    { h3: 'Sind Sie an die Werkstatt der Versicherung gebunden?', text: `Nein. Verweist die Gegenseite auf eine „Partnerwerkstatt", ist das ein Vorschlag, keine Vorgabe. Wir vermitteln Betriebe in Hürth-Mitte, Hermülheim oder Efferen, und abgerechnet wird auf Basis des Gutachtens.` },
    { h3: 'So läuft Ihr Termin ab', text: `Kurzer Anruf oder WhatsApp, Vor-Ort-Termin meist binnen 60 Minuten, Gutachten binnen 48 Stunden. Die Regulierung läuft parallel — Sie müssen nichts vorstrecken und zahlen 0 €.` },
    { text: `Kfz-Gutachter Hürth — neutral, gerichtsfest, schnell vor Ort. Melden Sie sich, und wir klären in fünf Minuten, was in Ihrem Fall sinnvoll ist.` },
  ],
  wesseling: [
    { text: `Wesseling liegt zwischen Köln und Bonn eingeklemmt zwischen Rhein und Chemie: Der Energy and Chemicals Park Rheinland von Shell sowie die Werke von Evonik und LyondellBasell bestimmen Stadtbild und Verkehr. Täglich rollen Schichtverkehr, Tanklastzüge und Sondertransporte durch ein Stadtgebiet mit wenigen durchgehenden Nord-Süd-Achsen: die B 9 Bonner Straße mitten hindurch, die A 555 mit eigener Anschlussstelle Wesseling westlich parallel dazu. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Wesseling-Mitte, Berzdorf, Urfeld und Keldenich. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Wesselings Verkehrslage ist ungewöhnlich, weil Industrie und Wohnen so dicht beieinanderliegen. Wesseling-Mitte trägt den Einkaufs- und Durchgangsverkehr der B 9; dort dominieren Auffahr-, Abbiege- und Türöffner-Schäden. Rund um die Werkstore überlagern sich Schichtwechsel und Schwerverkehr — Rangier- und Streifschäden an Zufahrten sind Alltag, ebenso Kollisionen beim Ausfahren von Werksgeländen. Berzdorf und Keldenich im Westen sind Wohnlagen mit Pendlerverkehr Richtung A 555, Urfeld im Süden liegt am Rhein und ist über wenige Straßen erschlossen. Wer die Kombination aus enger Führung, hohem Lkw-Anteil und dichtem Berufsverkehr kennt, weiß, warum ein Schadensbild hier selten von selbst eindeutig ist.` },
    { h3: 'Warum ein eigener Sachverständiger und nicht der Prüfer der Gegenseite?', text: `Weil der Prüfer der gegnerischen Versicherung deren Interesse vertritt: eine möglichst niedrige Schadenssumme. Sie haben Anspruch auf einen unabhängigen Sachverständigen, den die Gegenseite bezahlt. Wir arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'A 555 und B 9: zwei Achsen, zwei Schadensbilder', text: `Die A 555 zwischen dem Verteilerkreis Köln und Bonn gehört zu den ältesten Autobahnstrecken Deutschlands und ist bis heute die schnelle Pendlerachse zwischen beiden Städten — mit dem typischen Stop-and-Go-Profil im Berufsverkehr und Auffahrunfällen am Stauende. Die B 9 dagegen führt mitten durch Wesseling: Ampeln, Querungen, Grundstückszufahrten und abbiegender Lieferverkehr auf einer Strecke, die zugleich Durchgangsstraße ist. Auf der Autobahn geht es meist um Geschwindigkeit und Abstand, auf der B 9 um Vorfahrt und Sicht — zwei völlig verschiedene Beweisfragen, die auch verschieden dokumentiert werden müssen.` },
    { h3: 'Lkw-Streifschaden: Wer haftet?', text: `Bei Streifschäden durch den Spurwechsel eines Lkw oder durch Kollision mit einem Tanklastzug ist oft strittig, ob Fahrer, Spedition oder auftraggebendes Unternehmen einzustehen hat. Die Antwort steht in der Schadensspur: Anstoßhöhe, Abriebrichtung, Lackübertrag. Wir nehmen sie so auf, dass die Zuordnung belegbar bleibt — und berechnen den merkantilen Minderwert, der bei jüngeren Fahrzeugen nach einem Lkw-Streifschaden regelmäßig höher liegt, als die Gegenseite zunächst ansetzt.` },
    { h3: 'Schaden durch verlorenes Ladegut — wer zahlt?', text: `Wer in ausgelaufene Flüssigkeit, Schüttgut oder ein verlorenes Bauteil gerät, hat Ansprüche gegen den Verursacher beziehungsweise dessen Halterhaftpflicht. Voraussetzung ist, dass sich Ursache und Fahrzeug zuordnen lassen — also Fahrbahnzustand, Reifenspuren und Unterbodenschäden dokumentiert sind, bevor die Fahrbahn gereinigt wird. Bei Sondertransport-Beteiligung kennt das Claimondo-Netzwerk die Wege zu den zuständigen Versicherern.` },
    { h3: 'Wertminderung und Vorschäden: Wo Versicherungen ansetzen', text: `Bei Fahrzeugen, die täglich im Werks- und Pendlerverkehr laufen, sind kleinere Vorschäden die Regel. Die gegnerische Versicherung nutzt das gern, um den aktuellen Schaden kleinzurechnen. Deshalb trennen wir sauber: Was ist Altschaden, was ist neu, und wo überlagert sich beides. Nur diese Trennung hält, wenn später über Reparaturweg und merkantilen Minderwert gestritten wird.` },
    { h3: 'Werkstattbindung? Nicht beim Haftpflichtschaden', text: `Beim unverschuldeten Unfall wählen Sie die Werkstatt frei — anders als bei manchen Kaskotarifen mit vereinbarter Werkstattbindung. Wir vermitteln Karosserie- und Lackbetriebe in Wesseling-Mitte und Berzdorf und begleiten die Abrechnung über das Gutachten.` },
    { h3: 'So kommen Sie zum Gutachten', text: `Anruf oder WhatsApp, Vor-Ort-Termin meist binnen 60 Minuten — auf Wunsch auch am Werkstor oder auf dem Firmenhof. Gutachten binnen 48 Stunden, Regulierung parallel, 0 € für Sie.` },
    { text: `Kfz-Gutachter Wesseling — neutral, gerichtsfest, schnell vor Ort. Melden Sie sich, wir sagen Ihnen offen, was in Ihrem Fall zu tun ist.` },
  ],
  kerpen: [
    { text: `Kerpen im Rhein-Erft-Kreis ist Autobahnstadt und Revierstadt zugleich. Am Autobahnkreuz Kerpen laufen A 4 und A 61 zusammen; auf der A 61 folgt südlich die Anschlussstelle Türnich, auf der A 4 geht es nach Köln und Aachen. Innerörtlich trägt die B 264 Aachener Straße den Verkehr, und im Westen des Stadtgebiets liegt der Tagebau Hambach mit dem Schwerlast- und Werksverkehr, den ein Braunkohletagebau mit sich bringt. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Kerpen-Mitte, Horrem, Sindorf, Türnich, Brüggen, Blatzheim oder Buir. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Die Stadtteile könnten unterschiedlicher kaum sein. Kerpen-Mitte ist Verwaltungs- und Einkaufskern mit den klassischen Innenstadtschäden. Horrem lebt vom Bahnhof: Park-and-Ride-Verkehr, morgendliche Spitzen, volle Parkflächen und entsprechend viele Rangier- und Türöffner-Schäden. Sindorf ist gewachsenes Wohngebiet mit Schul- und Kitaverkehr. Türnich und Brüggen orientieren sich zur A 61 und zum Revier hin, Blatzheim und Buir im Westen sind ländlich und über Landstraßen erschlossen. Auf den Verbindungen Richtung Tagebau mischen sich Pendler mit schwerem Werksverkehr — eine Kombination, bei der Streifschäden und Vorfahrtkonflikte an Einmündungen überdurchschnittlich oft vorkommen.` },
    { h3: 'Woran erkennen Sie ein belastbares Gutachten?', text: `Daran, dass jede Zahl darin auf eine Quelle zurückgeht — Messwert, Foto, Marktdaten — und nicht auf Erfahrung. Wir arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Kreuz Kerpen: Wo A 4 und A 61 zusammenlaufen', text: `Am Autobahnkreuz Kerpen trifft der Fernverkehr der A 61 auf die A 4 zwischen Köln und Aachen. Beide Autobahnen tragen einen hohen Lkw-Anteil, und die Verflechtungsstrecken sind kurz. Typisch sind Auffahrunfälle im Stop-and-Go, Streifschäden beim Einfädeln und Kollisionen kurz vor der Verzweigung, wenn jemand die Ausfahrt zu spät erkennt. Bei Auffahrschäden lohnt der genaue Blick nach hinten: Heckblech, Kofferraumboden und Längsträger nehmen Aufprallenergie auf, ohne dass davon außen viel zu sehen sein muss.` },
    { h3: 'Tagebau Hambach: Schwerlast, Ersatzstraßen, Umsiedlung', text: `Der Tagebau prägt den Westen des Stadtgebiets bis heute. Solange Kohle gefördert wird, läuft Werks- und Versorgungsverkehr über das umliegende Netz, und die Straßenführung ändert sich mit dem Tagebau: Verbindungen werden gekappt, Ersatztrassen gebaut, Ortslagen wie Manheim sind umgesiedelt worden. Für die Unfallaufnahme heißt das, dass Kartenmaterial und Navigationsdaten nicht immer dem entsprechen, was vor Ort tatsächlich steht. Wir dokumentieren die reale Örtlichkeit — Beschilderung, Fahrbahnbreite, Sichtverhältnisse — statt uns auf eine Karte zu verlassen, die schon überholt sein kann.` },
    { h3: 'Firmenfahrzeug beteiligt: Wer haftet?', text: `Ob Fahrer, Halter oder auftraggebendes Unternehmen einzustehen hat, entscheidet sich an den Daten, die am Unfallort aufgenommen werden: Halteranschrift, Versicherungsnachweis, Auftragsverhältnis. Fehlt eines davon, verweisen die Beteiligten später gern aufeinander. Wir nehmen das vollständig auf und adressieren die richtige Haftpflichtversicherung; die Anwaltsabwicklung übernimmt das Claimondo-Partnernetzwerk, ebenfalls kostenfrei für Sie.` },
    { h3: 'Wertminderung: Warum wird hier so gern gekürzt?', text: `Weil der merkantile Minderwert eine Prognose ist — und Prognosen lassen sich bestreiten. Bei jüngeren Fahrzeugen fällt er nach einem Auffahrunfall spürbar aus, wird aber häufig pauschal gekürzt oder ganz gestrichen. Wir leiten ihn nachvollziehbar aus Fahrzeugalter, Laufleistung, Schadensumfang und Marktdaten her. Wird trotzdem gekürzt, ist das Gegengutachten der Weg — und auch dessen Kosten trägt die Gegenseite.` },
    { h3: 'Ihre Werkstatt, Ihre Entscheidung', text: `Freier Karosseriefachbetrieb oder Markenwerkstatt — die Wahl liegt bei Ihnen. Wir kennen verlässliche Betriebe in Kerpen-Mitte, Horrem und Sindorf; abgerechnet wird auf Grundlage des Gutachtens.` },
    { h3: 'Vom Anruf zum Gutachten', text: `Kurze Schilderung per Telefon oder WhatsApp, Vor-Ort-Termin meist binnen 60 Minuten in allen Stadtteilen, Gutachten binnen 48 Stunden. Die Regulierung läuft parallel; Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Kerpen — neutral, gerichtsfest, schnell vor Ort. Ein Anruf klärt in wenigen Minuten, wie Sie am besten vorgehen.` },
  ],
  erftstadt: [
    { text: `Erftstadt liegt südwestlich von Köln, wo die Erft die Börde durchzieht — eine polyzentrische Stadt aus fünfzehn Stadtteilen, vom historischen Lechenich mit Burg und Stadtmauer bis zum Verwaltungssitz Liblar. Der verkehrlich wichtigste Punkt liegt im eigenen Stadtgebiet: Am Autobahnkreuz Bliesheim treffen A 1 und A 61 aufeinander, und von dort führt die A 553 weiter Richtung Brühl und Kölner Süden. Dazu kommt die B 265 Luxemburger Straße nach Hürth und Köln. Unser Kfz-Sachverständiger ist meist binnen 60 Minuten in Liblar, Lechenich, Bliesheim, Kierdorf, Köttingen, Gymnich oder Erp. 0 € für Sie — die gegnerische Versicherung übernimmt das Honorar nach § 249 BGB.` },
    { vorort: true, text: `Fünfzehn Stadtteile bedeuten fünfzehn kleine Ortsdurchfahrten statt einer großen Innenstadt — und genau das prägt das Schadensbild. Liblar ist Verwaltungs- und Bahnhofsstadtteil mit hohem Pendleraufkommen und entsprechend vielen Park- und Berufsverkehrsschäden. Lechenich im Osten hat eine enge historische Altstadt: Abbiege-, Rangier- und Streifschäden an Bordsteinen und Hausecken. Bliesheim im Süden liegt unmittelbar am Autobahnkreuz, wo jeder Rückstau auf die Ortsdurchfahrt durchschlägt. Kierdorf und Köttingen im Norden sind wohngeprägt. Gymnich im Westen mit seinem Schloss sowie Erp, Friesheim und Borr sind ländlich: Landstraßen, lange Geraden und landwirtschaftlicher Verkehr in der Erntezeit.` },
    { h3: 'Was ein neutrales Gutachten für Sie festhält', text: `Den Zustand, der wenige Tage später niemandem mehr zugänglich ist — und zwar jede Position einzeln begründet. Wir arbeiten nach BVSK-Standard und ausschließlich in Ihrem Interesse:`, liste: LEISTUNGS_LISTE },
    { h3: 'Autobahnkreuz Bliesheim: drei Richtungen an einem Punkt', text: `Am Kreuz Bliesheim laufen die A 1 aus der Eifel, die A 61 aus Richtung Koblenz und die A 553 Richtung Brühl zusammen. Wer aus dem Süden kommt und nach Köln will, muss sich früh entscheiden — und genau daraus entsteht das typische Schadensbild: späte Fahrstreifenwechsel, Auffahrunfälle am Rückstauende, Streifschäden in den Verflechtungsbereichen. Weil die A 553 dahinter nur zweistreifig weiterläuft, wirkt jede Störung dort sofort bis ins Kreuz zurück.` },
    { h3: 'Landstraßen in der Börde: das unterschätzte Risiko', text: `Zwischen Erp, Friesheim, Gymnich und Herrig liegen lange, gerade Landstraßen mit hohem Tempo, wenig Beleuchtung und Einmündungen ohne Ampel. Dazu kommen breite, langsame landwirtschaftliche Gespanne und Feldzufahrten mit Schmutzeintrag auf der Fahrbahn. Die Unfälle dort sind seltener als in der Stadt, aber die Folgen fallen erfahrungsgemäß schwerer aus — und die Beweislage hängt an Details, die eine Nacht später weg sind: Bremsspuren, Splitterfeld, Verschmutzungsbild. Deshalb kommen wir kurzfristig raus und nicht erst in der Woche darauf.` },
    { h3: 'Die Versicherung kürzt — und jetzt?', text: `Kürzungen kommen selten mit Begründung, sondern als niedrigere Überweisung. Häufig betroffen sind Verbringungskosten, Ersatzteilaufschläge, Beilackierung und der merkantile Minderwert. Sie haben Anspruch darauf, jede dieser Positionen prüfen zu lassen; wird der Erstbericht dabei widerlegt, trägt die Gegenseite auch das Gegengutachten. Gerade bei jüngeren Fahrzeugen lohnt der zweite Blick fast immer.` },
    { h3: 'Werkstattwahl: Sie entscheiden, nicht die Gegenseite', text: `Freier Fachbetrieb oder Markenwerkstatt — das ist Ihr Recht. Wir vermitteln verlässliche Partner in Liblar, Lechenich und im benachbarten Hürth; das gerichtsfeste Gutachten ist die Abrechnungsgrundlage.` },
    { h3: 'Ihr Weg zum Gutachten', text: `Ein Anruf oder eine WhatsApp genügt. Der Sachverständige kommt meist binnen 60 Minuten, auch in die Außenorte, und nach 48 Stunden liegt das Gutachten vor. Anwalt, Werkstatt und Mietwagen laufen auf Wunsch parallel über das Netzwerk. Sie zahlen 0 €.` },
    { text: `Kfz-Gutachter Erftstadt — neutral, gerichtsfest, schnell vor Ort. Rufen Sie kurz an; wir klären, ob und wie ein Gutachten Ihnen weiterhilft.` },
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
