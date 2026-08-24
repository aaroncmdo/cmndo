// ============================================================================
// CLUSTER-KONFIG · DÜSSELDORF (Rheinland)
// ============================================================================
// Re-Skin auf den Köln-Endstand (08o–08q): Schema + Komponenten stammen aus der
// Köln-Vorlage, Inhalt/Farbe/Assets bleiben Düsseldorf. Dies ist die EINZIGE
// Datei mit der Cluster-Identität (Städte, Region, Brennpunkte, SEO).
// Theme-Farben: app/globals.css :root. themeColor: app/layout.tsx.
// Bilder: public/assets/img/duesseldorf/.
// ============================================================================

export interface City {
  slug: string
  name: string
  plz: string
  /** H1-Untertitel (SEO-Variation pro Stadt). */
  h1Sub: string
  /** Einwohner-Bezeichnung ("Düsseldorfer") fuer Reviews-Headline. */
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
  /** Dateiendung der Logo-Varianten logo-{key}-dark/-white. */
  logoExt: 'png' | 'svg'
  /** 08m A6 · Cache-Busting: bei INHALTS-Tausch eines Assets (gleicher Dateiname)
   *  hochzaehlen — haengt als ?v=… an Hero-/Logo-/Team-Referenzen (Komponenten +
   *  die beiden image-set-Vars in globals.css manuell mitziehen!). */
  assetVersion: string
  /** H1-Sub-Span im Hero (NUR Desktop lg:+, Action 0 P2). */
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
  key: 'duesseldorf',
  region: 'Rheinland',
  regionDative: 'Rheinland',
  quellenAnker: 'Polizei-Verkehrsbericht 2025',
  achsen: ['A46', 'A52', 'A57', 'A3'],
  stadtteile: ['Altstadt', 'Bilk', 'Oberkassel', 'Pempelfort', 'Gerresheim', 'Derendorf'],
  domain: 'kfz-unfallgutachter-duesseldorf.de',
  theme: 'rhein', // Düsseldorf-Cluster: Marineblau + Royal-Blue — globals.css :root traegt die Vars
  themeColor: '#0B3D6E', // Düsseldorf-Cluster (matched globals.css :root)
  imgPath: '/assets/img/duesseldorf/',
  logoExt: 'svg', // Düsseldorf: logo-duesseldorf-dark.svg vorhanden — TODO Aaron: logo-duesseldorf-white.svg fehlt noch (Header-transparent + Footer)
  assetVersion: '1',
  h1SubSpan: 'Unabhängige Sachverständige. Gerichtsfeste Gutachten nach BVSK-Standard.',
  teamImg: '/assets/img/duesseldorf/team-duesseldorf.webp?v=1',
  svName: 'Tobias', // Düsseldorf-Cluster Persona (Vorname)
  svSurname: 'Vogt', // Persona-Nachname (Tobias Vogt)
  // Telefon einheitlich ueber alle Cluster (Aaron-Vorgabe Mobil).
  phone: { display: '+49 1515 3608515', displayNational: '0151 5360 8515', tel: '+4915153608515', wa: '4915153608515' },
  landmark: { label: 'Rheinturm', img: 'stadt-duesseldorf.png' },
  facts: [
    { value: 'A3', label: 'Hauptachse' },
    { value: 'A46', label: 'Hauptachse' },
    { value: 'A57', label: 'Hauptachse' },
    { value: '60 Min', label: 'vor Ort', accent: true },
  ],
  // Verkehrsschwerpunkte Düsseldorf-Hub — lokal verankert (Quellen s. quellenAnker).
  brennpunkte: [
    { name: 'Berliner Allee', img: 'duesseldorf_berliner-allee.webp', desc: 'Dichter Innenstadtverkehr, viele Spurwechsel — häufig Auffahr- und Abbiegeunfälle.' },
    { name: 'Corneliusstraße', img: 'duesseldorf_corneliusstrasse.webp', desc: 'Stark befahrene Hauptachse mit Straßenbahn — regelmäßig Kollisionen.' },
    { name: 'Ernst-Reuter-Platz', img: 'duesseldorf_ernst-reuter-platz.webp', desc: 'Komplexer Knotenpunkt mit hoher Frequenz — Vorfahrts- und Radverkehrs-Unfälle.' },
  ],
  // Hub = Düsseldorf (main:true). Spokes = die uebrigen.
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

// ── SEO-Body (08o O6: strukturierte Absaetze statt Fliesstext) ───────────────
// H3s sind EDITORIAL an ihre Absaetze gebunden. `vorort: true` markiert den
// Absatz, der in der Einsatzgebiet-Lokalstrecke rendert (lib/seoVorOrt); `liste`
// rendert als kompakte Leistungs-Liste.
//
// AUSBAU 24.08.2026 (Near-Duplicate-Programm): die 9 Orte lagen bei je ~77
// Woertern — der ortsspezifische Anteil war zu klein, die LP-Seiten glichen
// einander zu 57-73 % (4-Gramm-Jaccard, Grenze der Spec: 40 %) und Google
// indexierte nur einen Repraesentanten. Jetzt 384-451 Woerter je Ort, Aufbau
// nach der Koeln-Vorlage (Intro + Stadtteil-Dynamik + 3-4 gebundene H3-Fragen
// + Leistungs-Liste).
//
// REDAKTIONS-REGELN fuer diesen Block:
//  - Orte/Achsen/Knoten NUR aus verifizierten Quellen. Die Basis sind die
//    freigegebenen `stadt_lokalinhalte`-Datensaetze (hauptachsen.knoten,
//    stadtbezirke, topografie_anker) — dieselbe Quelle, die die Ortstiefe-
//    Sektion speist. Keine erfundenen Anschlussstellen (84 solcher Knoten
//    wurden am 23.08. clusterweit entfernt; sie lasen sich alle plausibel).
//  - KEINE Doppelung der Ortstiefe-Sektion: deren Stadtbezirke, Verkehrsachsen,
//    Unfallschwerpunkte und lokalen FAQs rendern unterhalb dieses Texts. Hier
//    steht die gutachterliche Perspektive (Fahrverhalten, Schadensbild,
//    Begutachtung), nicht dieselbe Ortskunde ein zweites Mal.
//  - Keine erfundenen Zahlen/Statistiken. Rechtliche Schwellen (§ 249 BGB,
//    130-%-Grenze) sind Rechtsprechung, keine Ortsstatistik — die sind ok.
//  - Je Ort EIGENE H3-Formulierungen und ein EIGENES fachliches Schwerpunkt-
//    thema (Spurenlage, Nutzungsausfall, Totalschaden, Minderwert, Ketten-
//    auffahrunfall, Leasing, Vorschaden, Restwert, Ersatzbeschaffung), damit
//    die Seiten sich auch im generischen Teil unterscheiden.
export interface SeoAbsatz {
  /** Editorial gebundene Zwischenueberschrift — stellt die Frage, die der Absatz beantwortet. */
  h3?: string
  text: string
  /** Kompakte Leistungs-Liste nach dem Text. */
  liste?: string[]
  /** Rendert in der Einsatzgebiet-Lokalstrecke ("Vor Ort"), nicht im SeoBody. */
  vorort?: boolean
}

/** Leistungsumfang — identisch fuer alle Orte (kompakte Liste unter dem ersten
 *  H3-Absatz). Bewusst EINE Konstante statt neun Kopien. */
const LEISTUNGS_LISTE = [
  'Schadensaufnahme mit Foto- und Maßdokumentation',
  'Lack- und Strukturprüfung inklusive verdeckter Schäden',
  'Reparaturkalkulation mit marktüblichen Verrechnungssätzen',
  'Merkantiler Minderwert, wo er anfällt',
  'Restwert über belastbare Marktangebote',
  'Fertiges Gutachten binnen 48 Stunden',
]

export const SEO_BODY: Record<string, SeoAbsatz[]> = {
  duesseldorf: [
    { text: `Düsseldorf fährt sich in zwei Geschwindigkeiten: außen die Pendlerachsen A46, A52, A57 und A3, innen enge Quartiersstraßen, Ampelketten und ein Parkdruck, der zum Rangieren zwingt. Beides erzeugt eigene Schadensbilder, und beide bekommen wir als unabhängige Kfz-Sachverständige täglich auf den Tisch. Nach einem unverschuldeten Unfall kommen wir zu Ihnen — nach Bilk, Pempelfort, Oberkassel, Gerresheim oder Derendorf, an die Wohnadresse, in die Werkstatt oder zum Arbeitsplatz. Das Honorar trägt nach § 249 BGB die gegnerische Versicherung, nicht Sie.` },
    { vorort: true, text: `Jeder Stadtteil hat seine eigene Schadensdynamik. In der Altstadt und der Carlstadt sind es enge Gassen, Lieferverkehr und Rangierschäden an parkenden Fahrzeugen. In Bilk, Friedrichstadt und Flingern prägt der Parkdruck das Bild: Streifschäden beim Vorbeifahren, aufgerissene Türkanten, gestauchte Stoßfängerecken. Pempelfort und Derendorf leben vom Berufsverkehr, hier steht man morgens in Kolonnen — Auffahrschäden entstehen im Zentimeterbereich und werden trotzdem teuer. Oberkassel und Niederkassel hängen an den Rheinquerungen, jede Störung drückt den Verkehr in die Wohnstraßen. Am bergischen Rand um Gerresheim und Hubbelrath kommen Steigungen und enge Kurven dazu.` },
    { h3: 'Welche Schäden sehen wir in Düsseldorf am häufigsten?', text: `Der typische Düsseldorf-Schaden entsteht nicht bei Tempo 100, sondern beim Rangieren, Anfahren und Einparken. Streifschäden über Tür und Kotflügel, Bordsteinschäden an Felge, Reifen und Lenkung, gestauchte Stoßfängerecken mit Sensorik dahinter — und aus dem Stop-and-Go der Hauptachsen der klassische Heckaufprall. Das klingt harmlos, ist es aber selten: Moderne Fahrzeuge haben in genau diesen Zonen Bauteile, die man von außen nicht sieht und die trotzdem ersetzt werden müssen. Ein Gutachten, das nur die sichtbare Delle beschreibt, verschenkt regelmäßig einen erheblichen Teil des Anspruchs. Jeder dieser Fälle wird deshalb gleich gründlich dokumentiert:`, liste: LEISTUNGS_LISTE },
    { h3: 'Was steckt hinter einem verkratzten Stoßfänger?', text: `Mehr, als die Verkleidung vermuten lässt. Hinter dem lackierten Kunststoff sitzt ein Prallkörper, dahinter ein Querträger aus Stahl oder Aluminium, der über Crashboxen mit den Längsträgern verbunden ist. Schon ein Anstoß im Schritttempo kann die Crashboxen stauchen, ohne dass außen mehr als ein Kratzer entsteht — und eine gestauchte Crashbox erfüllt ihre Aufgabe beim nächsten Aufprall nicht mehr. Dazu kommt die Sensorik: Ultraschallgeber für die Einparkhilfe sitzen in der Verkleidung, der Radarsensor der Abstandsregelung häufig dahinter oder hinter dem Emblem. Wird der Stoßfänger demontiert oder verzieht sich seine Halterung, muss die Sensorik anschließend geprüft und bei Bedarf neu eingestellt werden. Diese Arbeitsschritte gehören in die Kalkulation, sonst zahlt sie am Ende der Geschädigte.` },
    { h3: 'Bordsteinkontakt — warum die Felge nur der Anfang ist', text: `Wer in einer engen Parklücke gegen den Bordstein gerät, sieht zuerst die Schramme am Felgenhorn. Die teureren Folgen liegen dahinter. Die Reifenflanke kann innen gerissen sein, ohne dass außen etwas zu erkennen wäre — ein Schaden, der erst bei höherer Geschwindigkeit gefährlich wird. Der Stoß läuft weiter über Radlager, Spurstange und Querlenker bis ins Federbein; verzogene Achsteile verändern Sturz und Spur, das Fahrzeug zieht zur Seite und die Reifen laufen einseitig ab. Deshalb gehört nach einem Bordsteinanprall immer eine Achsvermessung dazu, und deren Ergebnis gehört ins Gutachten. Wir prüfen außerdem, ob die Felge fachgerecht instand gesetzt werden darf oder ob der Hersteller den Ersatz vorschreibt — bei Schäden am tragenden Bereich ist Instandsetzung nicht zulässig.` },
    { h3: 'Warum entscheidet der erste Termin über die Höhe?', text: `Weil Spuren verschwinden. Fremdlack an der Streifzone, die Richtung der Kratzer, Bruchkanten an Halterungen, Verformungen am Träger hinter dem Stoßfänger — das alles ist am Unfalltag noch eindeutig lesbar und nach der ersten Wäsche oder einer Notreparatur nicht mehr. Wer wartet, verliert genau die Belege, mit denen sich Hergang und Umfang später gegen Einwände der Versicherung halten lassen. Besonders heikel ist die Frage, ob ein Schaden überhaupt zu dem geschilderten Unfall passt: Anstoßhöhe, Verformungsrichtung und Kratzverlauf beantworten sie, aber nur solange sie unverändert sind. Deshalb sehen wir das Fahrzeug lieber ungewaschen und unrepariert — auch wenn es Überwindung kostet, mit einem beschädigten Auto stehen zu bleiben.` },
    { h3: 'Was zahlen Sie für das Gutachten?', text: `Bei einem unverschuldeten Unfall nichts. Der Schädiger schuldet Ihnen die vollständige Wiederherstellung, und dazu gehört das Sachverständigenhonorar — wir rechnen direkt mit der gegnerischen Versicherung ab. Sie wählen den Gutachter selbst; der Prüfer, den die Versicherung schickt, arbeitet in deren Auftrag, nicht in Ihrem, und seine Kalkulation ist keine neutrale Bewertung, sondern die Position einer Partei. Nur bei einem erkennbaren Bagatellschaden ist der Kostenvoranschlag der Werkstatt der übliche Weg. Wo die Grenze verläuft, lässt sich am Telefon meist in wenigen Minuten klären — im Zweifel schauen wir hin, statt Sie auf gut Glück loszuschicken.` },
    { h3: 'Wie schnell sind wir bei Ihnen?', text: `In der Regel am selben Tag. Ein Anruf oder eine Nachricht über WhatsApp genügt, den Rest klären wir am Telefon: wo das Fahrzeug steht, ob es noch fahrbereit ist, ob eine Werkstatt oder ein Verkehrsrechtsanwalt gebraucht wird. Beides vermitteln wir auf Wunsch aus dem Netzwerk — die Werkstattwahl bleibt aber Ihre.` },
    { text: `Kfz-Gutachter Düsseldorf — unabhängig, gerichtsfest, schnell vor Ort. Rufen Sie an, und in fünf Minuten ist geklärt, ob sich ein Gutachten lohnt und wie es weitergeht.` },
  ],
  neuss: [
    { text: `Neuss liegt Düsseldorf direkt gegenüber am linken Rheinufer und lebt vom Verkehr, der zwischen beiden Städten hin- und herpendelt. Die A57 führt in Nord-Süd-Richtung durch das Stadtgebiet, die A46 quert Richtung Bergisches Land, dazu ziehen mit B1, B9 und B477 drei Bundesstraßen den Durchgangsverkehr mitten durch bewohnte Bereiche. Nach einem unverschuldeten Unfall kommt unser Kfz-Sachverständiger zu Ihnen — in die Innenstadt ebenso wie nach Furth, Holzheim, Norf oder Grimlinghausen.` },
    { vorort: true, text: `Die Neusser Stadtteile bringen sehr unterschiedliche Schäden hervor. Rund um Innenstadt und Dreikönigenviertel sind es enge, historisch gewachsene Straßenzüge: Rangierschäden, abgerissene Außenspiegel, Streifschäden an parkenden Fahrzeugen. Furth als größter Stadtteil ist Wohn- und Pendlergebiet, hier prägt der morgendliche Kolonnenverkehr das Bild. Reuschenberg, Gnadental und Weckhoven sind ruhige Wohnlagen, in denen es an unübersichtlichen Einmündungen und vor Schulen kracht. Im Süden und Westen — Norf, Rosellen, Holzheim, Hoisten — wird es ländlich: Landstraßen ohne Beleuchtung und entsprechend höhere Aufprallgeschwindigkeiten. Grimlinghausen und Uedesheim liegen am Rhein und sind über wenige Zufahrten erschlossen.` },
    { h3: 'Was gehört in ein Gutachten, das der Versicherung standhält?', text: `Ein Gutachten überzeugt nicht durch Umfang, sondern durch Nachvollziehbarkeit. Jede Position muss sich aus der Dokumentation herleiten lassen, sonst wird sie gekürzt. Das betrifft nicht nur die Schadenhöhe, sondern auch die Frage, welche Arbeitsschritte überhaupt nötig sind: Ob ein Bauteil instand gesetzt oder ersetzt wird, ob lackiert oder nur poliert werden muss, ob angrenzende Teile in die Lackierung einbezogen werden. Wir begründen jede dieser Entscheidungen mit dem Befund am Fahrzeug und arbeiten nach BVSK-Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Was ändert sich rund um das Bürger-Schützenfest?', text: `Ende August ist die Neusser Innenstadt über Tage großräumig gesperrt, der Verkehr läuft über Umleitungen, und Ortsunkundige suchen Parkplätze in Wohnstraßen, die dafür nicht gebaut sind. Was dabei entsteht, sind selten spektakuläre Unfälle, aber viele Rangier- und Parkschäden, oft ohne Zeugen. Genau dann wird die Spurensicherung zum entscheidenden Punkt: Anstoßhöhe, Kratzrichtung und übertragener Fremdlack sagen mehr über den Verursacher aus als jede Erinnerung. Bleibt der Verursacher unbekannt, ist die Dokumentation trotzdem nicht umsonst — sie ist die Grundlage für die Teilkasko beziehungsweise Vollkasko und für eine Strafanzeige wegen unerlaubten Entfernens. Fotografieren Sie den Fundzustand, bevor Sie wegfahren, und lassen Sie das Fahrzeug bis zum Termin unberührt.` },
    { h3: 'Ein Kratzer über vier Bauteile — warum das keine Kleinigkeit ist', text: `Ein Streifschaden endet selten an einem Blech. Läuft er über Kotflügel, Vordertür, Hintertür und Seitenwand, muss für jedes Teil einzeln entschieden werden, ob Instandsetzung genügt oder Ersatz nötig ist — und die Seitenwand ist geschweißt, nicht geschraubt. Dazu kommen Anbauteile, die dabei fast immer leiden: Zierleisten, Spiegelgehäuse, Türgriffe und Dichtungen, deren Halteklammern beim Ausbau brechen. Entscheidend ist die Anstoßrichtung: Sie verrät, ob beide Fahrzeuge in Bewegung waren oder eines stand, und ob die Schadenbilder zueinander passen. Wir halten den Verlauf über die gesamte Länge fest, mit Übergängen zwischen den Bauteilen — das ist die Stelle, an der Kürzungen sonst ansetzen.` },
    { h3: 'Was verrät die Lackschichtmessung?', text: `Zweierlei: was vorher war und was jetzt nötig ist. Eine erhöhte Schichtdicke zeigt frühere Lackarbeiten an und ist damit ein Hinweis auf einen Vorschaden, den wir sauber vom aktuellen Schaden trennen müssen. Gleichzeitig entscheidet der Lackaufbau über den Reparaturweg: Uni-, Metallic- und Effektlacke verhalten sich beim Farbtonangleich völlig unterschiedlich. Bei Effektlacken lässt sich ein Teil praktisch nie isoliert lackieren, ohne dass der Übergang sichtbar bleibt — deshalb ist die Beilackierung angrenzender Bauteile keine Großzügigkeit, sondern eine technische Notwendigkeit. Wird sie nicht ausgewiesen, streicht die Versicherung sie, und Sie sitzen auf einem Fahrzeug mit sichtbarem Farbsprung.` },
    { h3: 'Mietwagen oder Nutzungsausfall — was steht Ihnen zu?', text: `Solange Ihr Fahrzeug in der Werkstatt steht, haben Sie Anspruch auf Ersatzmobilität: entweder einen gleichwertigen Mietwagen oder eine Nutzungsausfallentschädigung für jeden Tag, an dem Sie nicht fahren können. Welche Variante für Sie günstiger ist, hängt vom Fahrzeug und der Reparaturdauer ab — die Grundlagen dafür stehen im Gutachten, damit die Versicherung nicht kürzen kann. Wichtig ist die realistische Reparaturdauer inklusive Teilebeschaffung: Wartet die Werkstatt zwei Wochen auf ein Ersatzteil, gehört diese Zeit dazu. Auch die Kosten eines Verkehrsrechtsanwalts trägt die Gegenseite.` },
    { h3: 'Wie kommen Sie an einen Termin?', text: `Rufen Sie an oder schreiben Sie kurz über WhatsApp, gern mit zwei, drei Fotos vom Schaden. Wir sagen Ihnen sofort, ob ein Gutachten sinnvoll ist, und vereinbaren den Ortstermin dort, wo das Fahrzeug ohnehin steht. Vorbereiten müssen Sie nichts außer Fahrzeugschein und, falls vorhanden, dem Unfallbericht.` },
    { text: `Kfz-Gutachter Neuss — unabhängig, gerichtsfest und im ganzen Rhein-Kreis unterwegs. Ein kurzer Anruf reicht, um zu klären, wie Ihr Fall am besten läuft.` },
  ],
  hilden: [
    { text: `Hilden ist eine Stadt, durch die andere hindurchfahren. Am Autobahnkreuz Hilden treffen A3 und A46 aufeinander, einer der am stärksten belasteten Knoten in Nordrhein-Westfalen, und der Verkehr, der dort nicht durchkommt, verteilt sich auf die Hildener Straßen. Dazu kommt eine Innenstadt, die als Einkaufsziel Kundschaft aus dem ganzen Kreis Mettmann anzieht. Nach einem unverschuldeten Unfall sind wir als unabhängige Kfz-Sachverständige schnell bei Ihnen; das Honorar trägt die gegnerische Versicherung.` },
    { vorort: true, text: `Die Schadenslage in Hilden hat zwei Pole. Rund um die Mittelstraße, seit den Achtzigern Fußgängerzone und Kern der Einkaufsstadt, sammelt sich der Parksuchverkehr in den angrenzenden Wohnstraßen: enge Parktaschen, viel Rangieren, Türschäden und Streifer an Radläufen. Der zweite Pol liegt am Stadtrand — die Gewerbe- und Logistikflächen an den Autobahnanschlüssen bringen Lieferverkehr, Sattelzüge und Rangiervorgänge auf beengten Höfen, wo Anhänger und Aufbauten typischerweise Ecken, Kanten und Seitenwände treffen. Im Westen, zur Hildener Heide hin, wird es ruhiger und schneller zugleich: Landstraßencharakter mit entsprechend härteren Anstößen.` },
    { h3: 'Woran erkennen Sie, dass ein Gutachten sorgfältig gemacht ist?', text: `Ein gutes Gutachten beantwortet die Fragen, die die Versicherung erst später stellt. Dazu gehört, verdeckte Schäden zu suchen, statt nur zu fotografieren, was man ohnehin sieht. Es gehört aber auch dazu, den Zustand vor dem Unfall zu erfassen: Laufleistung, Ausstattung, Pflegezustand, frühere Instandsetzungen. Erst daraus ergibt sich ein belastbarer Wiederbeschaffungswert, und der ist bei jedem zweiten Streitfall der eigentliche Zankapfel. Was wir in jedem Gutachten liefern:`, liste: LEISTUNGS_LISTE },
    { h3: 'Heckaufprall im stehenden Verkehr — was passiert da wirklich?', text: `Von außen sieht ein Heckschaden oft nach Stoßfänger und Heckklappe aus. Die Kraft läuft aber weiter: über die hinteren Längsträger in den Fahrzeugboden, häufig bis in die Ersatzradmulde, die sich als erstes wellt. Ist eine Anhängerkupplung montiert, wird es besonders unangenehm, denn sie leitet die Energie punktuell in die Trägerstruktur ein — dann ist der Blechschaden klein und der Strukturschaden groß. Bei modernen Fahrzeugen kommen Sensoren für Rückfahrkamera, Totwinkelwarner und Einparkhilfe hinzu, die im Heckbereich verbaut sind. Wir prüfen deshalb nicht nur die Außenhaut, sondern auch Spaltmaße, Kofferraumboden und die Beweglichkeit der Heckklappe — klemmt sie, ist die Struktur beteiligt, und das verändert die Kalkulation grundlegend.` },
    { h3: 'Was ändert sich, wenn ein Lkw oder Anhänger beteiligt war?', text: `Vor allem die Anstoßhöhe, und die ist ein Beweismittel. Nutzfahrzeuge treffen einen Pkw typischerweise oberhalb der Zonen, die für Kollisionen mit anderen Pkw ausgelegt sind — der Schaden liegt dann auf Höhe von Motorhaube, A-Säule oder Fensterlinie statt am Stoßfänger. Beim Rangieren auf engen Höfen kommen Aufbauten, Ladebordwände und Anhängerecken dazu, die eine charakteristische Spur hinterlassen: schmal, tief und mit deutlichem Farbübertrag. Genau diese Merkmale halten wir fest, weil sie später den Unfallhergang belegen, wenn zwei Darstellungen auseinandergehen. Bei gewerblich genutzten Fahrzeugen prüfen wir zusätzlich, ob Aufbau, Einbauten oder Ladung betroffen sind — Positionen, die in einer reinen Pkw-Kalkulation regelmäßig fehlen.` },
    { h3: 'Reparatur oder Totalschaden — wo verläuft die Grenze?', text: `Übersteigen die Reparaturkosten den Wiederbeschaffungswert Ihres Fahrzeugs, wird es rechnerisch eng. Entscheidend sind dann drei Werte, die alle im Gutachten stehen müssen: Reparaturkosten, Wiederbeschaffungswert und Restwert. Liegen die Kosten bis zu dreißig Prozent über dem Wiederbeschaffungswert, dürfen Sie unter bestimmten Voraussetzungen trotzdem reparieren lassen und Ihr Fahrzeug behalten — vorausgesetzt, die Reparatur erfolgt fachgerecht und vollständig nach Gutachten und Sie nutzen das Fahrzeug anschließend weiter. Eine Reparaturbestätigung dokumentiert das. Wird auch nur einer der drei Werte unsauber ermittelt, verlieren Sie diese Option, deshalb legen wir gerade hier nach.` },
    { h3: 'Dürfen Sie die Werkstatt selbst aussuchen?', text: `Ja. Die gegnerische Versicherung darf Ihnen einen Partnerbetrieb vorschlagen, aber nicht vorschreiben. Sie können den Betrieb Ihres Vertrauens beauftragen, in einer Markenwerkstatt reparieren lassen oder auf Basis des Gutachtens abrechnen und selbst entscheiden, was gemacht wird. Häufig kommt der Verweis auf eine günstigere freie Werkstatt — ob Sie sich darauf einlassen müssen, hängt unter anderem vom Alter des Fahrzeugs und davon ab, ob es bislang scheckheftgepflegt in der Markenwerkstatt war. Auf Wunsch vermitteln wir einen Karosseriefachbetrieb aus der Region, der direkt mit dem Gutachten arbeitet.` },
    { h3: 'Was sollten Sie vor dem Ortstermin tun?', text: `Möglichst wenig. Fahrzeug stehen lassen, nicht waschen, nichts provisorisch richten, und Teile, die abgefallen sind, aufheben. Fotos vom Unfallort helfen, ersetzen aber die Aufnahme am Fahrzeug nicht. Alles Weitere klären wir beim Termin.` },
    { text: `Kfz-Gutachter Hilden — neutral, gerichtsfest und mit kurzen Wegen im Kreis Mettmann. Melden Sie sich am besten, bevor Sie mit der gegnerischen Versicherung über Zahlen sprechen.` },
  ],
  erkrath: [
    { text: `Erkrath liegt dort, wo das Rheinland ins Bergische übergeht — und das merkt man beim Fahren. Die Stadt ist über die A46 an Düsseldorf angebunden, im Süden läuft die A3 vorbei, und zwischen Alt-Erkrath, Hochdahl und Unterfeldhaus verbindet ein Straßennetz drei Ortslagen, die kaum unterschiedlicher sein könnten. Wenn Ihr Fahrzeug nach einem unverschuldeten Unfall beschädigt ist, kommen wir als unabhängige Kfz-Sachverständige zu Ihnen: nach Hause, in die Werkstatt oder dorthin, wo das Auto steht.` },
    { vorort: true, text: `Alt-Erkrath ist der historische Kern an der Düssel: schmale Straßen, beidseitiges Parken, viel Begegnungsverkehr — hier entstehen Spiegel- und Streifschäden im Vorbeifahren, oft ohne dass jemand anhält. Hochdahl ist größer, jünger und in Wohnquartieren organisiert; typisch sind Rangierschäden auf Sammelparkplätzen und Vorfahrtsfehler an Kreuzungen, die man zu gut kennt, um noch genau hinzusehen. Unterfeldhaus grenzt unmittelbar an Düsseldorf-Unterbach und ist faktisch Pendlergebiet, mit dem entsprechenden Berufsverkehr morgens und abends. Und weil die Ortsteile durch Bahnstrecke und Grünzüge getrennt sind, bündelt sich fast jeder Weg auf denselben wenigen Verbindungsstraßen.` },
    { h3: 'Welchen Schaden sieht man dem Auto nicht an?', text: `Der sichtbare Blechschaden ist selten der teuerste Teil. Hinter Stoßfängern sitzen Träger, Sensoren und Halterungen, die sich verformen, ohne dass außen mehr als ein Kratzer zu sehen wäre. Kunststoffhalter brechen, ohne dass es jemand hört; Klipse und Clipsleisten sind nach dem ersten Ausbau nicht wiederverwendbar; Dämmmatten und Radhausschalen reißen ein. Solche Kleinteile machen in Summe einen spürbaren Anteil der Reparaturkosten aus und fehlen in schnellen Kalkulationen fast immer. Genau danach suchen wir:`, liste: LEISTUNGS_LISTE },
    { h3: 'Warum müssen Assistenzsysteme nach der Reparatur neu eingestellt werden?', text: `Weil sie exakt auf ihre Einbaulage ausgerichtet sind. Die Frontkamera sitzt hinter der Windschutzscheibe, der Radarsensor im vorderen Stoßfängerbereich, Ultraschallsensoren rundum, weitere Kameras in Spiegeln und Heckklappe. Schon ein Versatz von wenigen Millimetern oder ein Bruchteil eines Winkelgrads führt dazu, dass Abstandsregelung, Notbremsassistent oder Spurhalter falsch reagieren — zu früh, zu spät oder gar nicht. Wird ein betroffenes Bauteil ausgebaut, ersetzt oder auch nur lackiert, schreibt der Hersteller deshalb eine Kalibrierung vor, teils statisch mit Zieltafel in der Werkstatt, teils während einer Testfahrt. Das kostet Arbeitszeit und Spezialausrüstung. Wir weisen diese Position im Gutachten getrennt aus, weil sie sonst gestrichen wird und ein sicherheitsrelevantes System unbemerkt falsch arbeitet.` },
    { h3: 'Was ist der merkantile Minderwert — und wann bekommen Sie ihn?', text: `Ein repariertes Fahrzeug ist am Markt weniger wert als ein unfallfreies, auch wenn die Reparatur einwandfrei war. Diesen Unterschied nennt man merkantilen Minderwert, und er ist ein eigener Schadensposten, den die gegnerische Versicherung ausgleichen muss. Relevant wird er vor allem bei jüngeren Fahrzeugen mit überschaubarer Laufleistung und bei Schäden an tragenden Teilen — dort, wo ein Käufer später nach der Unfallfreiheit fragt und Sie wahrheitsgemäß antworten müssen. Die Höhe hängt von Alter, Laufleistung, Marktgängigkeit und der Schwere des Eingriffs ab; für die Berechnung gibt es anerkannte Verfahren, keine Bauchgefühle. Wir beziffern ihn im Gutachten, statt ihn nur zu erwähnen, denn nur dann lässt er sich durchsetzen.` },
    { h3: 'Und wenn die Werkstattrechnung höher ausfällt als das Gutachten?', text: `Das kommt vor, und es ist zunächst kein Fehler. Beim Zerlegen zeigt sich manchmal mehr, als von außen erkennbar war — ein verzogener Träger hinter einem intakt aussehenden Blech etwa. Wichtig ist dann, dass die Werkstatt die Abweichung dokumentiert und Rücksprache hält, bevor sie weiterarbeitet; wir ergänzen das Gutachten in solchen Fällen um eine Nachtragsposition mit Begründung. Zahlt die Versicherung die Differenz nicht, geht es um das sogenannte Werkstattrisiko — grob gesagt die Frage, wer dafür einstehen muss, dass ein Geschädigter die Preisgestaltung einer Fachwerkstatt nicht überprüfen kann. Behalten Sie deshalb jede Rechnung, jeden Nachtrag und jede Freigabe schriftlich.` },
    { h3: 'Wer beauftragt den Gutachter?', text: `Sie selbst. Nach einem unverschuldeten Unfall haben Sie das Recht auf einen eigenen Sachverständigen, und die Kosten trägt nach § 249 BGB die Gegenseite. Der Prüfer, der von der Versicherung geschickt wird, arbeitet dagegen für den, der ihn bezahlt. Sie müssen ihm Ihr Fahrzeug nicht überlassen und sollten vor allem nichts unterschreiben, was Sie nicht verstanden haben — insbesondere keine Abtretungserklärung und keine Abfindungsvereinbarung, bevor die Höhe feststeht.` },
    { h3: 'Wie schnell geht das?', text: `Meist am selben oder am nächsten Tag. Der Ortstermin dauert je nach Schaden zwanzig bis sechzig Minuten, das fertige Gutachten liegt in der Regel binnen 48 Stunden vor — bei Ihnen, bei Ihrer Kanzlei und, wenn Sie es wünschen, direkt bei der Versicherung.` },
    { text: `Kfz-Gutachter Erkrath — unabhängig, gerichtsfest, schnell erreichbar. Ein Anruf genügt, und Sie wissen, was Ihr Schaden tatsächlich wert ist.` },
  ],
  langenfeld: [
    { text: `Langenfeld liegt auf halber Strecke zwischen Düsseldorf und Köln, und die A3 durchschneidet die Stadt von Nord nach Süd. Wer hier wohnt, kennt den Unterschied zwischen einer freien und einer verstopften A3 — und die Wege, auf die der Verkehr ausweicht, wenn nichts mehr geht. Nach einem unverschuldeten Unfall dokumentieren wir den Schaden vor Ort, neutral und nach BVSK-Standard, in Immigrath, Richrath, Reusrath oder Wiescheid. Für Sie entstehen dabei keine Kosten.` },
    { vorort: true, text: `Die vier Ortsteile haben jeweils ihren eigenen Verkehr. Immigrath ist mit Bahnhof, Einzelhandel und Verwaltung der Kern — hier dominieren Park- und Rangierschäden sowie Konflikte zwischen Auto und Radverkehr. Richrath ist gewachsenes Wohngebiet mit vielen Einmündungen ohne klare Sichtachse. Reusrath liegt im Süden Richtung Leverkusen und ist stärker vom Durchgangsverkehr geprägt, Wiescheid im Osten von den Verbindungen ins Bergische. Und rund um die Autobahnanschlüsse und die Gewerbeflächen fährt schwerer Lieferverkehr, dessen Schäden an Pkw fast immer größer ausfallen, als sie im ersten Moment aussehen.` },
    { h3: 'Warum ist der Kettenauffahrunfall ein Sonderfall?', text: `Auf einer Stauautobahn wie der A3 bleibt es selten bei zwei Fahrzeugen. Bei einer Kette muss man auseinanderhalten, welcher Anstoß welchen Schaden verursacht hat, denn vorn und hinten gelten unterschiedliche Haftungsverhältnisse. Ein Fahrzeug in der Mitte wird zweimal getroffen: einmal von hinten, einmal, weil es dadurch nach vorn geschoben wird. Beide Schäden entstehen im selben Moment, gehören aber verschiedenen Verursachern. Ohne saubere Trennung zahlt am Ende niemand vollständig. Genau dafür braucht es eine Aufnahme, die Anstoßhöhen, Verformungsrichtungen und Deformationstiefen einzeln erfasst:`, liste: LEISTUNGS_LISTE },
    { h3: 'Der Airbag ist ausgelöst — was bedeutet das für die Kalkulation?', text: `Sehr viel, denn ein ausgelöstes Rückhaltesystem ist nie ein Einzelteil. Mit dem Fahrer- und Beifahrerairbag gehen in der Regel die Gurtstraffer mit, oft auch Seiten- und Kopfairbags; das Steuergerät speichert die Auslösung und muss ersetzt oder zurückgesetzt werden. Dazu kommen die Bauteile, in denen die Module sitzen: Lenkrad, Armaturenträger, Dachhimmel, Sitzwangen und Verkleidungen, die beim Aufreißen zerstört werden. Die Summe erreicht bei älteren Fahrzeugen schnell die Grenze zur Wirtschaftlichkeit, und genau deshalb wird an dieser Stelle gern gekürzt. Wir lesen den Fehlerspeicher aus, dokumentieren, welche Module tatsächlich ausgelöst haben, und listen jede Folgeposition einzeln auf, statt sie in einer Pauschale verschwinden zu lassen.` },
    { h3: 'Haftet beim Auffahren immer der Hintermann?', text: `In den meisten Fällen ja, aber nicht automatisch. Es gilt zunächst der Beweis des ersten Anscheins: Wer auffährt, war entweder zu schnell, zu dicht dran oder unaufmerksam. Dieser Anschein lässt sich jedoch erschüttern — etwa wenn der Vorausfahrende ohne erkennbaren Grund stark gebremst hat, unmittelbar vorher die Spur gewechselt ist oder wenn die Bremsleuchten nicht funktioniert haben. Ob so ein Verlauf plausibel ist, entscheidet sich am Schadensbild: Deformationstiefe, Höhe der Anstoßzone und der Abgleich mit dem Fahrzeug des Gegners. Ein Gutachten kann die Schuldfrage nicht klären, aber es liefert die technischen Anknüpfungspunkte, mit denen ein Verkehrsrechtsanwalt genau das tut.` },
    { h3: 'Was heißt das für Ihre Schadensmeldung?', text: `Melden Sie den Unfall Ihrer eigenen Versicherung, aber verhandeln Sie nicht über die Höhe, bevor der Schaden aufgenommen ist. Bei mehreren Beteiligten treffen mehrere Versicherer aufeinander, und jeder von ihnen prüft zuerst, ob ein Teil des Schadens einem anderen Anstoß zuzuordnen ist. Ein Gutachten, das diese Zuordnung selbst leistet, nimmt der Diskussion die Grundlage. Notieren Sie außerdem die Reihenfolge, in der es gekracht hat, solange die Erinnerung frisch ist — bei einer Kette ist das die Angabe, an die sich später niemand mehr sicher erinnert.` },
    { h3: 'Und wenn Sie eine Mitschuld tragen?', text: `Dann lohnt sich das Gutachten trotzdem, nur die Kostenfrage ändert sich: Bei anteiliger Haftung wird auch das Honorar anteilig getragen, bei voller eigener Schuld greift je nach Vertrag die Kaskoversicherung. In beiden Fällen ist eine unabhängige Bewertung der bessere Ausgangspunkt als die Kalkulation einer Werkstatt, die den Auftrag anschließend selbst ausführen möchte.` },
    { h3: 'Wie erreichen Sie uns?', text: `Telefonisch oder über WhatsApp, auch abends. Sagen Sie kurz, wo das Fahrzeug steht und ob es noch fahrbereit ist — den Rest organisieren wir, inklusive Abschleppdienst, Werkstatt und Verkehrsrechtsanwalt, wenn Sie das möchten.` },
    { text: `Kfz-Gutachter Langenfeld — unabhängig, gerichtsfest und schnell vor Ort zwischen Düsseldorf und Köln.` },
  ],
  monheim: [
    { text: `Monheim am Rhein ist die tiefstgelegene Stadt im Kreis Mettmann: flach, direkt am rechten Rheinufer und ohne Autobahn im Stadtkern. Die A59 verläuft am östlichen Rand, das Autobahnkreuz Monheim-Süd verbindet sie mit der A542. Der gesamte Ziel- und Quellverkehr läuft deshalb über innerörtliche Achsen statt über eine Stadtautobahn. Nach einem unverschuldeten Unfall kommen wir zu Ihnen nach Monheim oder Baumberg — das Honorar trägt die gegnerische Versicherung.` },
    { vorort: true, text: `Monheim und Baumberg sind zwei Ortslagen mit unterschiedlichem Takt. Der Monheimer Kern ist kompakt, mit Fußgängerbereichen, Anwohnerparken und vielen Radfahrern — hier entstehen die klassischen Türöffnungs- und Rangierschäden sowie Konflikte an Einmündungen, die durch parkende Fahrzeuge verdeckt sind. Baumberg im Süden ist stärker Wohn- und Durchgangsgebiet Richtung Leverkusen. Dazwischen reicht die Rheinaue bis an die Bebauung heran: Uferwege, Deichstraßen und Parkflächen, auf denen Fahrzeuge dicht stehen und bei Veranstaltungen noch dichter. Monheim hat außerdem mit einem der niedrigsten Gewerbesteuerhebesätze Deutschlands zahlreiche Unternehmen angezogen — bei Firmen- und Leasingfahrzeugen gelten für die Abwicklung eigene Regeln, die wir gleich mitdenken.` },
    { h3: 'Was ist bei einem Leasing- oder Firmenfahrzeug anders?', text: `Beim Leasingfahrzeug sind Sie Halter, aber nicht Eigentümer, und das ändert die Abwicklung. Der Leasinggeber hat eigene Vorgaben zur Reparatur, häufig eine Bindung an bestimmte Betriebe, und der Minderwert steht ihm zu, nicht Ihnen. Hinzu kommt die Rückgabe am Vertragsende: Ein dokumentierter Unfallschaden wird dort erneut bewertet, und eine nicht fachgerecht ausgeführte Reparatur fällt spätestens dann auf. Ein Gutachten muss das sauber trennen, damit später niemand doppelt fordert oder leer ausgeht — und es ist zugleich Ihr Beleg dafür, dass fachgerecht instand gesetzt wurde. Was wir in jedem Fall liefern:`, liste: LEISTUNGS_LISTE },
    { h3: 'Elektro- oder Hybridfahrzeug — was kommt bei der Begutachtung dazu?', text: `Die Hochvoltbatterie, und die verändert fast alles. Sie liegt bei den meisten Modellen als flache Baugruppe im Unterboden und ist damit genau dort, wo ein Anstoß gegen Bordstein, Poller oder Trümmerteile zuerst trifft. Selbst wenn außen nur ein Kratzer im Gehäuse zu sehen ist, verlangen die Hersteller nach einem Unterbodenkontakt eine Prüfung — sichtbar unbeschädigte Zellen können intern geschädigt sein. Karosseriearbeiten setzen voraus, dass das System vorher fachgerecht spannungsfrei geschaltet wurde, und bei Verdacht auf einen Zellschaden gelten besondere Vorgaben für Transport und Abstellung des Fahrzeugs. Weil die Batterie die mit Abstand teuerste Baugruppe ist, kippt die Wirtschaftlichkeit hier früher als bei einem vergleichbaren Verbrenner. Wir dokumentieren den Zustand, das Diagnoseergebnis und die vom Hersteller vorgeschriebenen Prüfschritte — sonst steht am Ende eine Zahl im Raum, die niemand belegen kann.` },
    { h3: 'Warum ist ein Seitenschaden teurer, als er aussieht?', text: `Weil in der Seite die Sicherheitsstruktur steckt. Hinter der Türaußenhaut sitzt ein Seitenaufprallträger, und B-Säule und Schweller bestehen bei modernen Fahrzeugen aus warmumgeformtem, höchstfestem Stahl. Solche Bauteile lassen sich nicht einfach richten: Der Hersteller gibt vor, ob überhaupt instand gesetzt werden darf, und wenn ja, nur mit definierten Trennstellen und Fügeverfahren. Wird trotzdem gerichtet, verliert die Struktur ihre Eigenschaften genau dort, wo sie beim nächsten Seitenaufprall gebraucht wird. Dazu kommen Drucksensoren in den Türen, die den Seitenairbag auslösen, sowie Kabelbäume und Steuergeräte in Tür und Schweller. Wir halten fest, welche Bauteile betroffen sind und welche Herstellervorgabe für sie gilt — das ist der Unterschied zwischen einer Kalkulation und einer belastbaren Reparaturanweisung.` },
    { h3: 'Wann zahlt sich ein eigenes Gutachten aus?', text: `Immer dann, wenn die Höhe strittig werden kann — und das ist schneller der Fall, als man denkt. Sobald die gegnerische Versicherung eine eigene Kalkulation vorlegt, verhandeln Sie ohne Gegenwert, wenn Sie nichts Belastbares in der Hand haben. Der Kostenvoranschlag einer Werkstatt ersetzt das nicht: Er kalkuliert die Reparatur, bewertet aber weder Minderwert noch Restwert noch die Frage, ob überhaupt repariert werden sollte. Und er ist von einem Betrieb erstellt, der den Auftrag anschließend selbst ausführen will — für die Gegenseite ein willkommenes Argument.` },
    { h3: 'Was passiert mit dem Fahrzeug bis zur Reparatur?', text: `Ist es nicht mehr fahrbereit, gehören Abschleppkosten, Standgebühren und die Verbringung zur Werkstatt zum ersatzfähigen Schaden — vorausgesetzt, sie sind belegt und im Gutachten berücksichtigt. Steht der Wagen dagegen fahrbereit vor der Tür, hat es mit der Reparatur keine Eile, wohl aber mit der Begutachtung.` },
    { h3: 'Wie fangen Sie an?', text: `Mit einem Anruf. Wir klären in wenigen Minuten, ob ein Gutachten nötig ist, wer Ihr Ansprechpartner bei der Gegenseite ist und ob Sie einen Verkehrsrechtsanwalt einschalten sollten. Den Termin machen wir direkt aus.` },
    { text: `Kfz-Gutachter Monheim am Rhein — unabhängig, gerichtsfest und mit kurzen Wegen nach Baumberg und in die Nachbarstädte.` },
  ],
  ratingen: [
    { text: `Ratingen wird von drei Autobahnen eingerahmt: Die A3 läuft östlich vorbei, die A52 westlich, die A44 verbindet beide, und an den Kreuzen Ratingen-Ost und Breitscheid treffen sie aufeinander. Dazu kommt mit B8 und B227 der klassische Durchgangsverkehr. Zwischen Zentrum, West, Tiefenbroich, Lintorf, Homberg, Hösel, Breitscheid, Eggerscheidt und Schwarzbach liegen Welten — vom dicht bebauten Gewerbegebiet bis zum Angertal. Nach einem unverschuldeten Unfall begutachten wir Ihr Fahrzeug dort, wo es steht.` },
    { vorort: true, text: `Ratingen West ist einer der großen Gewerbestandorte der Region und morgens wie abends eine einzige Pendlerbewegung; hier prägen Auffahrschäden im Anfahren und Streifschäden beim Spurwechsel auf den mehrspurigen Zufahrten das Bild. Das Zentrum mit seiner Altstadt hat die entgegengesetzte Charakteristik: langsam, eng, viele Fußgänger, dafür Streif- und Bordsteinschäden. Homberg, Eggerscheidt und Schwarzbach sind ländlich geprägt, mit Reitbetrieben, landwirtschaftlichem Verkehr und schmalen Straßen ohne Seitenstreifen — dort geht es bei Ausweichmanövern schnell in den Graben oder gegen einen Baum. Hösel und Lintorf liegen dazwischen: Wohnorte mit hoher Fahrzeugdichte und entsprechend vollen Anwohnerstraßen.` },
    { h3: 'Was macht die Abgrenzung von Vorschäden so wichtig?', text: `Kaum ein Fahrzeug ist makellos, und genau da setzen Versicherer an. Wer einen älteren Kratzer in derselben Zone hat, muss belegen, welcher Teil des Schadens aus dem aktuellen Unfall stammt, sonst wird pauschal gekürzt. Wir trennen alt und neu anhand von Kantenschärfe, Lackaufbau und Verformungsverlauf: Frische Kratzer haben scharfe Ränder und blanke Bruchflächen, ältere sind verwittert, nachgedunkelt oder bereits überlackiert. Wichtig ist außerdem die Unterscheidung zwischen einem reparierten Vorschaden und einem unreparierten Altschaden — nur der zweite mindert den Wiederbeschaffungswert unmittelbar. Dazu gehört:`, liste: LEISTUNGS_LISTE },
    { h3: 'Baum, Böschung, Leitplanke — warum hier gemessen statt geschätzt wird', text: `Bei einem Anprall gegen ein festes Hindernis verteilt sich die Energie über die gesamte Karosserie. Der Rahmen kann sich verziehen, ohne dass die Türen klemmen; erst eine Vermessung zeigt, ob Diagonalmaße, Achsaufnahmen und Federbeindome noch in der Toleranz liegen. Genau davon hängt ab, ob das Fahrzeug auf einer Richtbank überhaupt wieder in Form gebracht werden kann oder ob die Instandsetzung technisch ausscheidet. Ein zweiter Punkt wird oft übersehen: Nach einem Frontalanstoß sind Kühler, Klimakondensator und Ladeluftführung häufig undicht, und Betriebsflüssigkeiten treten erst nach einigen Kilometern aus. Wer so ein Fahrzeug noch bewegt, riskiert einen Motorschaden, der dann nicht mehr eindeutig dem Unfall zuzurechnen ist. Im Zweifel: stehen lassen und begutachten lassen.` },
    { h3: 'Was sind UPE-Aufschläge und Verbringungskosten?', text: `Zwei Positionen, über die fast jede Regulierung stolpert. UPE-Aufschläge sind Zuschläge auf die unverbindliche Preisempfehlung der Ersatzteile, wie sie viele Betriebe für Beschaffung und Lagerhaltung erheben. Verbringungskosten entstehen, wenn eine Werkstatt keine eigene Lackiererei hat und das Fahrzeug dorthin und zurück gefahren werden muss. Beides ist real, beides wird regelmäßig gestrichen — vor allem dann, wenn Sie fiktiv abrechnen, also auf Gutachtenbasis ohne Reparaturnachweis. Bei konkreter Abrechnung gegen Rechnung stehen die Chancen deutlich besser. Denselben Unterschied gibt es bei der Umsatzsteuer: Sie wird nur erstattet, wenn sie tatsächlich angefallen ist. Wir weisen diese Positionen getrennt aus, damit Sie vor der Entscheidung wissen, was jede Variante bedeutet.` },
    { h3: 'Wer meldet den Schaden bei einem Dienstwagen?', text: `In der Regel der Fuhrpark oder die Flottenverwaltung — was nicht heißt, dass die Begutachtung damit erledigt wäre. Auch bei einem Dienstwagen hat der Geschädigte Anspruch auf ein unabhängiges Gutachten, und je größer die Flotte, desto eher wird pauschal reguliert. Bei gewerblich genutzten Fahrzeugen kommt außerdem der Ausfallschaden hinzu: Ein Transporter, der eine Woche steht, kostet den Betrieb mehr als die Nutzungsausfallpauschale eines Privatwagens hergibt. Wir liefern die Unterlagen so, dass sie sowohl in die interne Schadensakte als auch zur gegnerischen Versicherung passen.` },
    { h3: 'Was gilt auf den Landstraßen im Norden?', text: `Anders als in der Stadt entstehen dort Schäden mit hoher Energie, oft mit Airbag-Auslösung und verzogener Karosserie. Solche Fahrzeuge sind selten wirtschaftlich reparabel, und dann kommt es auf Wiederbeschaffungswert und Restwert an — beides Werte, die sich nur mit echten Marktangeboten belegen lassen, nicht mit einer Schätzung.` },
    { h3: 'Wie läuft der Termin ab?', text: `Wir kommen mit Kamera, Messtechnik und Kalkulationssystem, nehmen das Fahrzeug rundum auf und erklären Ihnen dabei, was wir sehen. Das Gutachten bekommen Sie anschließend digital, im Regelfall binnen 48 Stunden.` },
    { text: `Kfz-Gutachter Ratingen — unabhängig, gerichtsfest, in allen Stadtteilen unterwegs. Rufen Sie an, bevor Sie der Versicherung eine Reparaturfreigabe geben.` },
  ],
  meerbusch: [
    { text: `Meerbusch ist keine Stadt mit einem Zentrum, sondern acht Ortslagen, die auf zwölf Kilometern zwischen Düsseldorf und Krefeld verteilt liegen. Der größte Teil der Fläche ist Feld, Wald und Wasser, die Wege dazwischen sind entsprechend lang. A44 und A57 kreuzen sich mitten im Stadtgebiet, dazu kommen die Anschlussstellen Büderich, Bovert, Lank-Latum und Osterath. Nach einem unverschuldeten Unfall kommen wir zu Ihnen — in jede der acht Ortslagen, ohne Aufschlag für die Entfernung.` },
    { vorort: true, text: `Büderich liegt Düsseldorf am nächsten und ist der städtischste Teil: dichter Berufsverkehr, Parkdruck, Streif- und Türschäden. Osterath hat mit Bahnhof und gewachsenem Ortskern eine eigene Dynamik aus Bring- und Holverkehr. Lank-Latum, Strümp und Ossum-Bösinghoven sind Wohnorte mit kurzen Ortsdurchfahrten, auf denen innerorts schneller gefahren wird, als die Straßen es hergeben. Langst-Kierst, Nierst und Ilverich liegen am Rhein und sind über schmale Straßen ohne Beleuchtung erschlossen. In Langst-Kierst setzt außerdem die Rheinfähre nach Kaiserswerth über — an starken Wochenenden bilden sich dort Wartekolonnen, in denen es beim Anfahren und Rangieren eng wird.` },
    { h3: 'Warum lohnt sich die Anfahrt auch für einen kleinen Schaden?', text: `Der Aufwand für Sie bleibt derselbe, nämlich keiner, egal wie groß der Schaden ist. Ob Parkrempler in Büderich oder Zusammenstoß auf der Landstraße nach Nierst: Wir kommen zum Fahrzeug, nicht umgekehrt. Gerade bei kleinen Schäden lohnt der Blick, weil dort die Bagatellgrenze und die verdeckten Positionen dicht beieinanderliegen — ein Stoßfänger, der nur zu tauschen scheint, zieht Sensorik, Halter und Beilackierung nach sich. Dokumentiert wird deshalb in jedem Fall nach demselben Standard:`, liste: LEISTUNGS_LISTE },
    { h3: 'Wildunfall auf dem Weg zwischen den Ortslagen — was ist zu tun?', text: `Zuerst absichern und die Polizei verständigen; sie stellt die Wildschadenbescheinigung aus, die Sie für die Regulierung brauchen. Danach zählt die Spurensicherung am Fahrzeug: Haare, Gewebereste und Blutspuren sind der Nachweis, dass es tatsächlich ein Wildunfall war, und die Höhe der Anstoßzone lässt Rückschlüsse auf die Tierart zu. Beides verschwindet beim ersten Regen oder in der Waschanlage. Reguliert wird ein Wildunfall nicht über eine gegnerische Haftpflicht, sondern über Ihre Teilkasko — es gibt schlicht keinen Verursacher, der zahlen könnte. Damit ändert sich auch die Kostenfrage für das Gutachten, denn hier greift § 249 BGB nicht. Was in Ihrem Fall sinnvoll ist, klären wir vorab am Telefon, bevor Kosten entstehen.` },
    { h3: 'Scheiben und Scheinwerfer — die unterschätzten Positionen', text: `Eine Windschutzscheibe ist längst nicht mehr nur Glas. In ihr oder an ihr sitzen Regen- und Lichtsensor, Antennenstrukturen, häufig eine Heizung und der Halter der Frontkamera; nach dem Tausch muss diese Kamera neu eingestellt werden. Bei Scheinwerfern hat sich das Preisgefüge in wenigen Jahren verschoben: LED- und Matrixeinheiten mit eigener Steuerelektronik liegen um ein Vielfaches über dem, was ein Halogenscheinwerfer gekostet hat, und ihre Kunststoffhalter brechen schon bei leichtem Anstoß. Genau diese Halter entscheiden darüber, ob ein optisch heiler Scheinwerfer weiterverwendet werden kann oder ersetzt werden muss. Wir prüfen sie einzeln, statt vom äußeren Eindruck auf den Zustand zu schließen.` },
    { h3: 'Was tun, wenn das Auto nicht mehr fährt?', text: `Dann bleibt es zunächst stehen. Abschleppen, Standkosten und die Verbringung in die Werkstatt sind Teil des Schadens und werden von der gegnerischen Versicherung getragen, vorausgesetzt sie sind belegt. Wir nehmen das Fahrzeug auch am Unfallort oder auf dem Abstellplatz auf; ein Transport vor der Begutachtung ist nicht nötig und kann Spuren verändern. Achten Sie darauf, dass der Abschleppdienst Ihnen einen Beleg mit Datum, Strecke und Fahrzeugdaten aushändigt — ohne den wird die Position später bestritten.` },
    { h3: 'Wie wird der Restwert ermittelt?', text: `Nicht geschätzt, sondern belegt. Bei einem wirtschaftlichen Totalschaden holen wir konkrete Angebote aus dem regionalen Markt ein und weisen sie im Gutachten aus. Das ist wichtig, weil die gegnerische Versicherung sonst ein eigenes, oft höheres Restwertangebot nachreicht — und daran sind Sie nur unter engen Voraussetzungen gebunden, insbesondere nicht rückwirkend, wenn Sie das Fahrzeug bereits zum ausgewiesenen Wert veräußert haben. Verkaufen Sie es deshalb nie, bevor das Gutachten vorliegt, und geben Sie ein eingehendes Aufkaufangebot nicht ungeprüft weiter.` },
    { h3: 'Wie erreichen Sie uns am schnellsten?', text: `Per Telefon oder WhatsApp. Nennen Sie die Ortslage und wo das Fahrzeug steht — bei den Entfernungen in Meerbusch spart das die meiste Zeit.` },
    { text: `Kfz-Gutachter Meerbusch — unabhängig, gerichtsfest, in allen acht Ortslagen zwischen Rhein und A57 unterwegs.` },
  ],
  grevenbroich: [
    { text: `Grevenbroich besteht aus einem Kern und einer ganzen Reihe von Ortsteilen, die als eigene Dörfer über das Erftland verteilt liegen: Wevelinghoven, Kapellen, Elsen, Gustorf, Orken, Hemmerden, Neuenhausen und weitere. Die A46 quert das Stadtgebiet, B59 und B230 übernehmen den Rest. Wer hier zur Arbeit fährt, legt fast immer Landstraßenkilometer zurück, und das prägt die Schäden, die dabei entstehen. Nach einem unverschuldeten Unfall begutachten wir Ihr Fahrzeug vor Ort, ohne Kosten für Sie.` },
    { vorort: true, text: `Zwischen den Ortsteilen liegen freie Landstraßen mit langen Geraden und wenigen Kurven — die Bedingungen, unter denen Überholmanöver und Abbiegevorgänge zu schweren Kollisionen führen. Im Kern und in der Südstadt sieht es anders aus: Dort geht es um Parkraum, Einfahrten und den Verkehr rund um Schulen und Einzelhandel. Wevelinghoven und Kapellen haben gewachsene Ortsdurchfahrten mit engen Querschnitten; Gustorf, Elsen und Orken gehören zu den größeren Ortslagen und tragen entsprechend viel Alltagsverkehr. Und in den kleineren Lagen wie Hemmerden oder Neuenhausen kommt landwirtschaftlicher Verkehr dazu, der Fahrbahnen verschmutzt und Sichtverhältnisse verändert.` },
    { h3: 'Warum sind Landstraßenschäden anders zu bewerten?', text: `Bei höherer Geschwindigkeit verteilt sich die Energie tief ins Fahrzeug. Was von außen nach Kotflügel und Scheinwerfer aussieht, betrifft oft Längsträger, Achsgeometrie und Sicherheitssysteme, also Positionen, die eine Sichtprüfung nicht erfasst. Hinzu kommt, dass bei einem Anstoß in Schrägrichtung — typisch beim Abbiegen oder Überholen — die Kraft die Struktur verwindet statt sie sauber zu stauchen. Solche Verzüge zeigen sich nicht an der Delle, sondern an Spaltmaßen, Türfunktionen und Diagonalmaßen. Deshalb messen wir, statt zu schätzen:`, liste: LEISTUNGS_LISTE },
    { h3: 'Reifen, Felgen und das Reifendruckkontrollsystem', text: `Die Position, die am häufigsten fehlt. Eine beschädigte Alufelge darf nur außerhalb des tragenden Bereichs instand gesetzt werden — Risse oder Verformungen am Felgenstern oder Hornbereich schließen eine Reparatur aus. Beim Reifen zählt nicht nur die sichtbare Beschädigung: Ein Reifen, der einen harten Schlag abbekommen hat, kann innen geschädigt sein, ohne dass außen etwas zu sehen ist. Wird nur ein Reifen ersetzt, entsteht auf der Achse ein Profilunterschied, der bei vielen Fahrzeugen — besonders mit Allradantrieb — nicht zulässig ist; dann ist achsweiser Ersatz nötig. Dazu kommt das Reifendruckkontrollsystem: Bei direkt messenden Systemen sitzt ein Sensor im Ventil, der übernommen oder ersetzt und anschließend angelernt werden muss. Für gebrauchte Reifen wird ein Abzug neu für alt angesetzt — auch das gehört transparent ins Gutachten.` },
    { h3: 'Es hat gar nicht gekracht — zählt das trotzdem als Unfall?', text: `Ja, das kann es. Wer auf einer schmalen Landstraße einem entgegenkommenden Fahrzeug ausweicht und dabei in den Graben oder gegen den Bordstein gerät, hat einen berührungslosen Unfall — und der Verursacher kann dafür einstehen müssen, wenn sein Fahrverhalten das Ausweichen herausgefordert hat. Der Haken: Es gibt keinen Lackübertrag und keine gegenüberliegende Schadenstelle, also fehlt der übliche Beweis. Umso wichtiger sind Spuren am eigenen Fahrzeug und am Ort: Unterbodenschäden, Reifenabrieb, Bodenkontakt an Schweller und Radhaus, dazu Fotos von Fahrspuren und Endlage. Melden Sie einen solchen Fall unbedingt der Polizei und lassen Sie ihn zeitnah aufnehmen — später lässt sich der Verlauf kaum noch rekonstruieren.` },
    { h3: 'Reparieren oder ersetzen — was ist bei einem älteren Fahrzeug sinnvoll?', text: `Je älter das Fahrzeug, desto schneller übersteigen die Reparaturkosten seinen Wert. Dann geht es nicht mehr um die Werkstattrechnung, sondern um die Differenz zwischen Wiederbeschaffungswert und Restwert — das ist der Betrag, der Ihnen zusteht. Sie dürfen ihn auch dann verlangen, wenn Sie das Fahrzeug behalten und nur notdürftig instand setzen lassen. Voraussetzung ist, dass beide Werte sauber ermittelt sind: Der Wiederbeschaffungswert bemisst sich danach, was ein vergleichbares Fahrzeug am regionalen Markt tatsächlich kostet, nicht nach einer Tabelle. Bei seltenen Modellen und sehr gepflegten Fahrzeugen liegt er oft deutlich höher, als eine schnelle Bewertung vermuten lässt.` },
    { h3: 'Was, wenn die Versicherung kürzt?', text: `Kürzungen kommen fast immer mit derselben Begründung: nicht erforderlich, nicht ortsüblich, nicht unfallbedingt. Gegen jede dieser drei Behauptungen hilft dasselbe — eine Dokumentation, die den Zusammenhang zwischen Anstoß und Schaden zeigt. Bleibt die Versicherung dabei, prüfen wir die Kürzung Position für Position und stellen eine Stellungnahme bereit, mit der ein Verkehrsrechtsanwalt weiterarbeiten kann.` },
    { h3: 'Wie schnell sind wir bei Ihnen im Erftland?', text: `Auch in den äußeren Ortsteilen in der Regel am selben Tag. Melden Sie sich telefonisch oder über WhatsApp und sagen Sie, wo das Fahrzeug steht — alles Weitere klären wir dann.` },
    { text: `Kfz-Gutachter Grevenbroich — unabhängig, gerichtsfest, im gesamten Rhein-Kreis Neuss unterwegs.` },
  ],
}

export function seoBodyFor(slug: string): SeoAbsatz[] {
  return SEO_BODY[slug] ?? []
}

// Per-Stadt-metaHook (Lever 2): kurzer, unique lokaler Aufhaenger fuer die Meta-
// Description (seo.ts) statt des recycelten h1Sub -> killt near-duplicate-Snippets.
// Distilliert aus SEO_BODY, <=40 Z. Fehlt ein Slug -> Fallback auf city.h1Sub.
export const META_HOOKS: Record<string, string> = {
  duesseldorf: 'Landeshauptstadt am Rhein, A57/A52/A46',
  neuss: 'Linksrheinisch im Rhein-Kreis, A57/A46',
  hilden: 'Autobahnkreuz A3/A46, Kreis Mettmann',
  erkrath: 'Neandertal-Rand, A3 & A46',
  langenfeld: 'Zwischen Düsseldorf & Köln, A3',
  monheim: 'Am Rhein zw. Düsseldorf & Leverkusen',
  ratingen: 'AD A3/A44/A52, Kreis Mettmann',
  meerbusch: 'Linksrheinisch zw. Düsseldorf & Neuss',
  grevenbroich: 'Rhein-Kreis-Westrand, A540 & A46',
}
