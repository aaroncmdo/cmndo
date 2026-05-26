// HANDGESCHRIEBEN — nicht generiert (anders als pseo-data.generated.ts).
// Lokal-Content je PSEO-Stadt (WP-5-Gate). Keys = PSEO_CITY_SLUGS.
// HARTE REGEL: jeder Fakt MUSS eine quelle tragen; Schätzungen als "ca." labeln.
//
// Kuratierung (2026-05-26): Die Bloecke fokussieren auf DURABLE, distinktive
// Geographie/Infrastruktur (Autobahnen, Kreuze, Haefen, Bruecken, Umweltzonen).
// Bewusst NICHT enthalten: Unfall-Gesamtzahlen (die besitzt die Stats-Tabelle der
// Seite -> sonst Widerspruch), sowie Gericht/SV (ebenfalls in der Tabelle).
// Bewusst variierende Formulierung je Stadt (Cross-City-Duplicate-Gate).
// Fakten via Web-Recherche belegt; vor dem Index-Flip Aaron-Review der Quellen.
export type LocalFact = {
  label: string
  value: string
  quelle: string
  url?: string
}
export type PseoLocal = {
  /** echter Lokal-Kontext, additiv zum Template. */
  intro: string
  /** belegte Fakten (Geographie/Infrastruktur). */
  facts: LocalFact[]
}

export const PSEO_LOCAL: Record<string, PseoLocal> = {
  berlin: {
    intro:
      'Über 1,2 Millionen zugelassene Pkw teilen sich das dichteste Straßennetz Deutschlands — Berlin kennt keine klar abgegrenzten Stoßzeiten, sondern ein durchgehend hohes Grundrauschen. Den härtesten Prüfstein bildet die A100: Deutschlands meistbefahrene Stadtautobahn fädelt am Dreieck Funkturm Fern- und Innenstadtverkehr auf engem Raum zusammen, während der äußere Berliner Ring (A10) den Transit um die Stadt leitet. In der Fläche dominieren Abbiege- und Vorfahrtkonflikte an den unzähligen Lichtsignal-Kreuzungen das Geschehen — typisch für eine Metropole mit weiten Pendlerströmen aus dem Umland.',
    facts: [
      { label: 'Stadtautobahn A100', value: 'rund 21 km Stadtautobahn durch den Westen; einer der meistbelasteten Autobahnabschnitte Deutschlands, in der Verlängerung Richtung Treptow ausgebaut', quelle: 'ADAC Verkehrsinformationen A100', url: 'https://www.adac.de/verkehr/verkehrsinformationen/' },
      { label: 'Dreieck Funkturm', value: 'Knoten A100 × A115 (AVUS) am Messegelände — notorischer Engpass des westlichen Stadtrings', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Berliner Ring (A10)', value: 'orbitale Umfahrung um das gesamte Stadtgebiet; bündelt den Fern- und Schwerverkehr außen herum', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'A113 Südost-Zubringer', value: 'verbindet die A100 mit dem Berliner Ring und dem Flughafen BER — stark befahrene Pendel- und Flughafenachse', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  bielefeld: {
    intro:
      'Bielefeld sitzt im Sattel des Teutoburger Waldes — eine Topografie, die den Verkehr in wenige Korridore zwingt. Die A33 quert den Höhenzug mit spürbaren Steigungen und einem Lärmschutztunnel im südlichen Verlauf; quer durch die Stadt führt der Ostwestfalendamm (OWD) als kreuzungsfreie Schnellstraße. Am Autobahnkreuz Bielefeld verdichtet sich der Ost-West-Fernverkehr der A2 mit regionalem Pendelverkehr zu einem der stauanfälligsten Knoten Ostwestfalen-Lippes.',
    facts: [
      { label: 'Autobahnkreuz Bielefeld (A2 × A33)', value: 'verknüpft die Ost-West-Achse A2 (Dortmund–Hannover) mit der A33 (Osnabrück–Paderborn); bekannte Engstelle des OWL-Netzes', quelle: 'stau.info / ADAC', url: 'https://stau.info/autobahnkreuz/kreuz-bielefeld' },
      { label: 'A33 durch den Teutoburger Wald', value: 'Streckenabschnitt mit Geländesteigungen und Lärmschutztunnel; witterungsbedingt erhöhtes Risiko bei Nässe und Glätte', quelle: 'Bundesautobahn 33 (Streckenbeschreibung)', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_33' },
      { label: 'Ostwestfalendamm (OWD)', value: 'innerstädtische kreuzungsfreie Schnellstraße, die den Durchgangsverkehr bündelt — hohe Verkehrsdichte mit häufigen Auffahrkonstellationen', quelle: 'Stadt Bielefeld, Verkehr', url: 'https://www.bielefeld.de/' },
      { label: 'Bundesstraßen B61/B66', value: 'sternförmig auf das Zentrum zulaufende Hauptachsen, die das Pendleraufkommen aus dem Umland einspeisen', quelle: 'Stadt Bielefeld, Verkehr', url: 'https://www.bielefeld.de/' },
    ],
  },
  bochum: {
    intro:
      'Bochum liegt am Herz des Ruhrschnellwegs: Die A40 quert das Stadtgebiet von West nach Ost und führt nahe dem Ruhrstadion entlang der Innenstadt — auf Spitzenabschnitten eine der dichtest befahrenen Strecken der Republik. Am Autobahnkreuz Bochum bündeln sich A40 und A43 (Münster–Wuppertal); südlich entlastet die jüngere A448 (Bochumer Lösung) den innerstädtischen Verkehr.',
    facts: [
      { label: 'Autobahnkreuz Bochum (A40 × A43)', value: 'rund 164.000 Fahrzeugbewegungen täglich; Schwerverkehrsanteil ca. 7 %', quelle: 'Autobahnkreuz Bochum (Verkehrsdaten)', url: 'https://de.wikipedia.org/wiki/Autobahnkreuz_Bochum' },
      { label: 'A40 Ruhrschnellweg', value: 'abschnittsweise über 100.000 Fahrzeuge pro Tag; gilt als einer der staureichsten Korridore Deutschlands', quelle: 'Bundesautobahn 40', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_40' },
      { label: 'A448 (Bochumer Lösung)', value: 'jüngere Stadtautobahn zur Entlastung des innerstädtischen Ost-West-Verkehrs parallel zur A40', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'A43 Richtung Münster/Wuppertal', value: 'Nord-Süd-Verbindung mit Anschluss ans Kreuz Bochum; hoher Pendel- und Lkw-Durchgangsverkehr', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  bonn: {
    intro:
      'Bonn ist zwischen Rhein und Voreifel gewachsen — die Topografie bündelt den Verkehr auf wenige Achsen. Die A565 schneidet das Stadtgebiet von Nordost nach Südwest, quert den Rhein und gehört zu den meistbelasteten vierspurigen Autobahnabschnitten Deutschlands. Nach Köln führt die A555, Deutschlands historisch erste Autobahn (1932), schnurgerade nach Norden; im Süden bindet die A562 die rechtsrheinischen Stadtteile an.',
    facts: [
      { label: 'A565 Stadtautobahn', value: 'Abschnitt Lengsdorf–Kreuz Bonn-Nord mit über 100.000 Fahrzeugen täglich, Rheinquerung über die Friedrich-Ebert-Brücke', quelle: 'Bundesautobahn 565', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_565' },
      { label: 'A555 Köln–Bonn', value: 'Deutschlands erste Autobahn (eröffnet 1932); werktags rund 80.000 Fahrzeuge auf der Pendelachse', quelle: 'Bundesautobahn 555', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_555' },
      { label: 'Rheinquerungen', value: 'Friedrich-Ebert-Brücke (A565), Konrad-Adenauer-Brücke und Südbrücke verteilen den Querverkehr über den Strom', quelle: 'Stadt Bonn, Verkehr', url: 'https://www.bonn.de/' },
      { label: 'A562 rechtsrheinisch', value: 'kurze Autobahn über die Friedrich-Ebert-Brücke, die die rechtsrheinischen Stadtteile und die A59 anbindet', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  bremen: {
    intro:
      'Als Hafenstadt mit direkter Schiene zum Überseehafen Bremerhaven zieht Bremen erheblich mehr Schwerlastverkehr an als vergleichbar große Binnenstädte — die A27 ist die Lebensader zwischen Container und Binnenland. Am Bremer Kreuz treffen A1 (Hamburg–Osnabrück) und A27 aufeinander; den inneren Verkehr fängt der bislang nur teilfertige Stadtring A281 samt Wesertunnel ab.',
    facts: [
      { label: 'Bremer Kreuz (A1 × A27)', value: 'verknüpft den Fernverkehr der A1 mit der Hafenachse A27 — intensiver Güterverkehr durch die Anbindung an Bremerhaven', quelle: 'ADAC / stau.info Bremen', url: 'https://stau.info/stadt/bremen' },
      { label: 'A281 Stadtring mit Wesertunnel', value: 'teilfertiger Stadtring; der Wesertunnel unterquert die Weser, der Ringschluss ist in Planung', quelle: 'Bundesautobahn 281', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_281' },
      { label: 'Hafen- und Schwerlastverkehr', value: 'die Güterdichte aus Industriehäfen und Bremerhaven-Zubringer erhöht den Lkw-Anteil auf den Zufahrtsstraßen', quelle: 'Wirtschaftsförderung Bremen', url: 'https://www.wfb-bremen.de/' },
      { label: 'A27 als Hafenachse', value: 'durchgehende Verbindung Bremerhaven–Bremen–Binnenland mit hohem Container- und Lkw-Aufkommen', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  dortmund: {
    intro:
      'Dortmund ist der bedeutendste Straßenknoten Westfalens: Sechs Bundesautobahnen — A1, A2, A40, A42, A44 und A45 — berühren das Stadtgebiet oder seinen Rand. Das nahe Kamener Kreuz (A1 × A2) zählt zu den meistbefahrenen Autobahnknoten Deutschlands, das Kreuz Dortmund/Unna gilt als Dauerbaustelle. Mitten durch die Stadt führt die B1 als Ruhrschnellweg, deren Veranstaltungsverkehr rund um Westfalenhalle und Stadion regelmäßig die Belastungsgrenze erreicht.',
    facts: [
      { label: 'Autobahndichte', value: 'sechs Autobahnen am Stadtgebiet: A1, A2, A40, A42, A44, A45', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Kamener Kreuz (A1 × A2)', value: 'rund 160.000 Fahrzeuge täglich an einem der größten Knoten der Region', quelle: 'stau.info Kamener Kreuz', url: 'https://stau.info/autobahndreieck/kamener-kreuz' },
      { label: 'Kreuz Dortmund/Unna (A1 × A44)', value: 'rund 187.000 Fahrzeuge täglich; laufendes Ausbauprojekt mit Engstellen', quelle: 'Autobahn GmbH — Ausbau Kreuz Dortmund/Unna', url: 'https://www.autobahn.de/planen-bauen/projekt/ausbau-autobahnkreuz-dortmund-unna' },
      { label: 'B1 Ruhrschnellweg', value: 'innerstädtische Hauptachse mit starkem Veranstaltungsverkehr (Westfalenhalle, Stadion)', quelle: 'Stadt Dortmund, Verkehr', url: 'https://www.dortmund.de/' },
    ],
  },
  dresden: {
    intro:
      'Dresden liegt am Schnittpunkt der A4 — Sachsens wichtigster Ost-West-Achse — und der A17 zum tschechischen Grenzübergang, die am Dreieck Dresden-West zusammenfinden. Die Elbe zerschneidet die Stadt; acht innerstädtische Brücken verteilen den Querverkehr. Seit dem Teileinsturz der Carolabrücke im September 2024 verdichtet sich der Umleitungsverkehr auf die verbliebenen Querungen, allen voran die Waldschlösschenbrücke.',
    facts: [
      { label: 'Autobahnnetz', value: 'A4 (Ost-West), A13 (Berlin) und A17 (Prag) mit dem Dreieck Dresden-West als zentralem Verknüpfungspunkt', quelle: 'stau.info Dreieck Dresden-West', url: 'https://stau.info/autobahndreieck/dreieck-dresden-west' },
      { label: 'A17 Grenztransit', value: 'Gebirgsstrecke Richtung Tschechien mit Tunneln und Talbrücken; bei Schnee und Nässe erhöht unfallträchtig', quelle: 'Bundesautobahn 17', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_17' },
      { label: 'Elbquerungen', value: 'acht innerstädtische Brücken; nach dem Carolabrücken-Teileinsturz 2024 angespannte Querungslage mit verlagertem Verkehr', quelle: 'Landeshauptstadt Dresden — Carolabrücke', url: 'https://www.dresden.de/de/stadtraum/zentrale-projekte/carolabruecke/einsturz.php' },
      { label: 'A4 Elbtalquerung', value: 'die sechsstreifig ausgebaute A4 quert nördlich der Stadt das Elbtal und trägt den überregionalen Ost-West-Transit', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  duesseldorf: {
    intro:
      'Als Landeshauptstadt und Messestandort ist Düsseldorf von fünf Bundesautobahnen umschlossen — A3, A44, A46, A52 und A59. Der Rhein teilt die Stadt; Theodor-Heuss-Brücke, Oberkasseler Brücke und Rheinkniebrücke schultern den städtischen Querverkehr, während die Flughafenbrücke (A44) den Fernverkehr nördlich über den Strom leitet. Seit der Gewichtssperrung der Theodor-Heuss-Brücke konzentriert sich der schwere Verkehr auf die übrigen Querungen.',
    facts: [
      { label: 'Autobahnring', value: 'fünf Autobahnen erschließen das Stadtgebiet: A3, A44, A46, A52, A59', quelle: 'Autobahn GmbH des Bundes / ADAC NRW', url: 'https://www.adac.de/der-adac/regionalclubs/nrw/' },
      { label: 'Rheinquerungen', value: 'drei innerstädtische Brücken plus die Flughafenbrücke (A44) für den Fernverkehr', quelle: 'Landeshauptstadt Düsseldorf, Pressedienst', url: 'https://www.duesseldorf.de/medienportal/' },
      { label: 'Theodor-Heuss-Brücke', value: 'wegen struktureller Defizite für schwere Fahrzeuge gesperrt — Lkw-Verkehr verlagert sich auf die anderen Rheinbrücken', quelle: 'Landeshauptstadt Düsseldorf', url: 'https://www.duesseldorf.de/' },
      { label: 'A52/A44 Messe- und Flughafenanbindung', value: 'führen den Besucher- und Frachtverkehr zu Messe und Flughafen im Norden der Stadt — Spitzen bei Großmessen', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  duisburg: {
    intro:
      'Duisburg ist der Logistikmotor des Ruhrgebiets: duisport in Ruhrort ist mit 21 Hafenbecken und rund 40 Kilometern Kaianlage der größte Binnenhafen Europas. Diese Güterdichte schlägt direkt auf die Straße durch — täglich rollen Tausende Lkw über A3, A40, A42 und A59. Das Autobahnkreuz Duisburg-Kaiserberg (A3 × A40) und die A40-Rheinbrücke Neuenkamp gehören zu den größten Dauerbaustellen Nordrhein-Westfalens.',
    facts: [
      { label: 'duisport — Europas größter Binnenhafen', value: '21 Hafenbecken, rund 40 km Kai; Jahresumschlag in der Größenordnung von 100 Mio. Tonnen', quelle: 'duisport (Unternehmensangaben)', url: 'https://www.duisport.de/' },
      { label: 'Kreuz Duisburg-Kaiserberg (A3 × A40)', value: 'bis zu rund 130.000 Fahrzeuge täglich; laufender Komplettumbau', quelle: 'Autobahn GmbH — Umbau Kaiserberg', url: 'https://www.autobahn.de/planen-bauen/projekt/umbau-des-autobahnkreuzes-duisburg-kaiserberg' },
      { label: 'A59 Berliner Brücke', value: 'rund 90.000–100.000 Fahrzeuge täglich, hoher Lkw-Anteil; Brückenneubau in Umsetzung', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'A40-Rheinbrücke Neuenkamp', value: 'einer der größten Brückenneubauten NRWs; bündelt den West-Verkehr über den Rhein bei hohem Schwerlastanteil', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  essen: {
    intro:
      'Die A40 — der „Ruhrschnellweg" — durchquert Essen auf ganzer Breite von West nach Ost und führt die ADAC-Staubilanz für Nordrhein-Westfalen regelmäßig an. Am Autobahndreieck Essen-Ost mündet die A52 aus Düsseldorf ein; eine einspurige Einfädelung macht das Dreieck zum bekannten Stau- und Konfliktpunkt. Essen sitzt damit an der Nahtstelle zweier der meistbelasteten Korridore des Reviers.',
    facts: [
      { label: 'A40 — staureichste Autobahn NRW', value: 'der Abschnitt Duisburg–Essen führt die ADAC-Staubilanz nach Staukilometern an', quelle: 'Regionalverband Ruhr (RVR) / ADAC-Staubilanz', url: 'https://www.rvr.ruhr/' },
      { label: 'Dreieck Essen-Ost (A40 × A52)', value: 'rund 120.000 Fahrzeuge täglich; einspurige Einfädelung als chronische Engstelle', quelle: 'Autobahndreieck Essen-Ost', url: 'https://de.wikipedia.org/wiki/Autobahndreieck_Essen-Ost' },
      { label: 'A52-Korridor Essen–Düsseldorf', value: 'einer der staustärksten Pendelkorridore NRWs mit hoher Staustundenzahl je Kilometer', quelle: 'RVR / ADAC-Staubilanz', url: 'https://www.rvr.ruhr/' },
      { label: 'A40 als Stadtautobahn', value: 'die A40 verläuft mitten durch das Stadtgebiet ohne Standstreifen-Reserven — kleinste Störung führt zu Rückstau', quelle: 'Bundesautobahn 40', url: 'https://de.wikipedia.org/wiki/Bundesautobahn_40' },
    ],
  },
  frankfurt: {
    intro:
      'Frankfurt ist Finanz- und Verkehrszentrum zugleich: Das Frankfurter Kreuz (A3 × A5) zählt mit mehreren Hunderttausend Fahrzeugen täglich zu den meistbefahrenen Straßenknoten Europas. Der Flughafen liegt direkt an der A3/A5-Achse und erzeugt rund um die Uhr Anlieferungs- und Pendelverkehr; die A648 führt als „Messeautobahn" bis an die Innenstadt heran, die A661 schließt den östlichen Bogen.',
    facts: [
      { label: 'Frankfurter Kreuz (A3 × A5)', value: 'in der Größenordnung von 320.000–370.000 Fahrzeugen täglich — einer der meistbefahrenen Knoten Europas', quelle: 'Hessen Mobil — Das Frankfurter Kreuz', url: 'https://mobil.hessen.de/Planung-und-Bau/Projekte/Besondere-Projekte/Das-Frankfurter-Kreuz' },
      { label: 'Flughafen-Anbindung', value: 'A3 und A5 führen unmittelbar am Drehkreuz vorbei — durchgehend hohes Fracht- und Pendleraufkommen', quelle: 'Fraport / Hessen Mobil', url: 'https://www.fraport.de/' },
      { label: 'Umweltzone', value: 'seit 2008 (eine der ersten Deutschlands), begrenzt durch A5, A3 und A661', quelle: 'Stadt Frankfurt — Grenzen der Umweltzone', url: 'https://frankfurt.de/themen/umwelt-und-gruen/umwelt-und-gruen-a-z/luft/umweltzone' },
      { label: 'A661 Ost-Bogen', value: 'führt mit dem geplanten Riederwaldtunnel den östlichen Stadtverkehr und verbindet A3 und A66', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  hamburg: {
    intro:
      'Hamburg presst Hafen, Stadtautobahn und Fernverkehr auf engsten Raum. Die A7 mit dem Elbtunnel ist das meistbelastete Nadelöhr im Stadtgebiet — die Tunnelröhren tauchen über 28 Meter unter den Normalnull-Pegel. Im Hafen verbindet die markante Köhlbrandbrücke die Terminals; an den Elbbrücken bündeln sich A1, A24 und A25 zur Anbindung von Osten.',
    facts: [
      { label: 'A7 Elbtunnel', value: 'Abschnitt Dreieck Nordwest–Stellingen mit im Schnitt rund 140.000 Fahrzeugen täglich; Tunnel über 28 m unter NN', quelle: 'hamburg.de — A7 und Elbtunnel', url: 'https://www.hamburg.de/verkehr/' },
      { label: 'Hafenverkehr', value: 'täglich Zehntausende Fahrzeuge im Hafengebiet mit überdurchschnittlichem Lkw-Anteil; Köhlbrandbrücke als zentrale Verbindung', quelle: 'Hamburg Port Authority — Masterplan Straßenverkehr Hafen', url: 'https://www.hamburg-port-authority.de/' },
      { label: 'Autobahn-Anbindung', value: 'A1, A7, A23, A24 und A25 fächern den Verkehr in alle Himmelsrichtungen — A7 und A1 tragen die Hauptlast', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Köhlbrandbrücke', value: 'weithin sichtbare Hafenquerung vor dem Ersatzneubau — hoher Schwerlastanteil aus dem Containerumschlag', quelle: 'Hamburg Port Authority', url: 'https://www.hamburg-port-authority.de/' },
    ],
  },
  hannover: {
    intro:
      'Hannover liegt am Kreuz zweier Fernachsen: A2 (Ruhrgebiet–Berlin) und A7 (Flensburg–Würzburg) treffen östlich der Stadt am Dreieck Hannover-Ost zusammen, wo zusätzlich A37 und A352 in kurzer Folge einmünden. Ins Zentrum führen Messeschnellweg, West- und Südschnellweg als kreuzungsarme Stadtstraßen; rund um die Hannover Messe — die flächenmäßig größte Industriemesse der Welt — steuert die Verkehrsmanagementzentrale Niedersachsen ein eigenes Messe-Leitsystem.',
    facts: [
      { label: 'Knoten Hannover-Ost', value: 'A2 × A7 sowie A37 und A352 in direkter Folge — dichte Verflechtung mit kurzen Verflechtungsstrecken', quelle: 'Verkehrsmanagementzentrale Niedersachsen (VMZNDS)', url: 'https://www.vmz-niedersachsen.de/wissenswertes/messe/' },
      { label: 'Schnellwege-System', value: 'Messe-, West- und Südschnellweg führen als kreuzungsarme Stadtschnellstraßen den Zentrums- und Messeverkehr', quelle: 'Stadt Hannover / VMZNDS', url: 'https://www.hannover.de/' },
      { label: 'Messeverkehr-Steuerung', value: 'Wechselwegweisung auf A2/A7/A37 plus eigenes Leitsystem bei der Hannover Messe', quelle: 'VMZNDS', url: 'https://www.vmz-niedersachsen.de/wissenswertes/messe/' },
      { label: 'A2 als Ost-West-Fernachse', value: 'Hauptverbindung Ruhrgebiet–Berlin mit sehr hohem Lkw-Anteil; nördlich an der Stadt vorbeigeführt', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  koeln: {
    intro:
      'Den Kölner Autobahnring bilden A1, A3 und A4 in einem engen Halbbogen um die Stadt. Der A3-Abschnitt zwischen Kreuz Köln-Ost und Dreieck Heumar gehört seit jeher zu den am stärksten belasteten Autobahnstrecken Deutschlands. Über den Rhein spannen sich Severinsbrücke, Deutzer Brücke und Zoobrücke; im Norden sorgte die jahrelange Lkw-Sperrung der A1-Rheinbrücke Leverkusen für massiven Umwegverkehr.',
    facts: [
      { label: 'A3 Kölner Ring (Köln-Ost–Heumar)', value: 'historisch einer der meistbefahrenen Autobahnabschnitte Deutschlands', quelle: 'Kölner Autobahnring (Verkehrsdaten)', url: 'https://de.wikipedia.org/wiki/K%C3%B6lner_Autobahnring' },
      { label: 'A1 Leverkusener Rheinbrücke', value: '2014–2024 für Lkw über 3,5 t gesperrt; Neubau seit 2024 für Schwerverkehr offen', quelle: 'ADAC NRW — Leverkusener Brücke', url: 'https://www.adac.de/der-adac/regionalclubs/nrw/' },
      { label: 'Innerstädtische Rheinbrücken', value: 'Severinsbrücke, Deutzer Brücke und Zoobrücke verteilen den Querverkehr zwischen links- und rechtsrheinischer Stadt', quelle: 'Stadt Köln, Verkehr', url: 'https://www.stadt-koeln.de/' },
      { label: 'A4 Rodenkirchener Brücke', value: 'südliche Autobahn-Rheinquerung des Rings mit hoher Tagesbelastung im Pendelverkehr', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  leipzig: {
    intro:
      'Leipzig ist der Logistik-Drehpunkt Mitteldeutschlands: A9 (Berlin–München), A14 (Halle–Chemnitz) und A38 (Südumfahrung) fassen die Stadt von drei Seiten zu einem Autobahnring, der am Schkeuditzer Kreuz (A9 × A14) zusammenläuft. Am Flughafen Leipzig/Halle betreibt DHL sein weltweit größtes Express-Frachtdrehkreuz — der nächtliche Frachtverkehr prägt die zuführenden Bundesstraßen bis weit nach Mitternacht.',
    facts: [
      { label: 'Autobahnring A9/A14/A38', value: 'dreiseitiger Ring um die Stadt mit dem Schkeuditzer Kreuz (A9 × A14) als nördlichem Knoten', quelle: 'Stadt Leipzig — Wirtschaft/Logistik', url: 'https://www.leipzig.de/wirtschaft/' },
      { label: 'Frachtdrehkreuz Leipzig/Halle', value: 'größtes DHL-Express-Hub weltweit; starker Nacht- und Schwerverkehr auf den Zubringern', quelle: 'DHL — Hub Leipzig', url: 'https://www.dhl.com/de-de/microsites/express/hubs/hub-leipzig.html' },
      { label: 'A9 Berlin–München', value: 'eine der wichtigsten Nord-Süd-Fernachsen Deutschlands tangiert die Stadt im Westen mit hohem Transitanteil', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Innerstädtische Bundesstraßen B2/B6', value: 'führen den Durchgangs- und Pendelverkehr ringförmig um die Innenstadt — dichte Kreuzungsfolge', quelle: 'Stadt Leipzig, Verkehr', url: 'https://www.leipzig.de/' },
    ],
  },
  muenchen: {
    intro:
      'München bündelt als größte Stadt Bayerns einen der verkehrsintensivsten Räume Deutschlands; jeden Werktag pendeln Hunderttausende überwiegend mit dem Pkw in die Stadt. Der Autobahnring A99 verteilt die einmündenden A8 (Stuttgart/Salzburg), A9 (Nürnberg/Berlin), A92 und A94 und trägt auf Abschnitten weit über 100.000 Fahrzeuge täglich. Im Inneren übernehmen Mittlerer Ring und Altstadtring die Tangentialfunktion — der Mittlere Ring ist der meistbefahrene Straßenzug der Stadt.',
    facts: [
      { label: 'A99 Autobahnring', value: 'auf dem östlichen Abschnitt bis zu rund 110.000 Fahrzeuge täglich; teils sechs- bis achtspuriger Ausbau', quelle: 'Autobahn GmbH des Bundes (A99-Ausbau)', url: 'https://www.autobahn.de/' },
      { label: 'Mittlerer Ring', value: 'innerstädtische Tangente mit Tunnelstrecken (u. a. Richard-Strauss-Tunnel); meistbefahrener Straßenzug der Landeshauptstadt', quelle: 'Landeshauptstadt München — Mobilität', url: 'https://stadt.muenchen.de/' },
      { label: 'Alpennahe Pendlerachsen', value: 'A8 und A95 führen Richtung Voralpenland — bei Wintereinbruch und Reiseverkehr erhöhtes Stau- und Unfallaufkommen', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Allacher Tunnel (A99)', value: 'einer der meistbefahrenen Autobahntunnel Deutschlands im Nordwesten des Rings', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  muenster: {
    intro:
      'Münster gilt als Fahrradhauptstadt Deutschlands — rechnerisch kommt mehr als ein Rad auf jeden Einwohner. Diese Verkehrskultur prägt die Schadenlage: Rad-Kfz-Konflikte stellen einen ungewöhnlich hohen Anteil der Unfälle mit Personenschaden, oft an der ringförmigen Promenade und den Hauptausfallstraßen. Das ländliche Münsterland entlang A1 und A43 ist zugleich für Wildwechsel bekannt, der nächtliche Fahrten auf Land- und Kreisstraßen riskant macht.',
    facts: [
      { label: 'Fahrradstadt', value: 'mehr als ein zugelassenes Fahrrad je Einwohner — entsprechend hoher Anteil an Rad-Kfz-Konflikten im Stadtverkehr', quelle: 'Stadt Münster — Radverkehr', url: 'https://www.stadt-muenster.de/verkehrsplanung/radverkehr' },
      { label: 'A1/A43 am Stadtrand', value: 'die Autobahnen tangieren die Stadt; das Kreuz Münster-Süd verknüpft sie für den Fern- und Pendelverkehr', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Münsterland — Wildwechsel', value: 'ländliche Land- und Kreisstraßen mit erhöhtem Wildunfall-Risiko in der Dämmerung', quelle: 'Unfallatlas der Statistischen Ämter', url: 'https://unfallatlas.statistikportal.de/' },
      { label: 'Promenade als Radring', value: 'die historische Wallanlage führt als ringförmiger Radweg um die Altstadt und kreuzt zahlreiche Kfz-Hauptstraßen', quelle: 'Stadt Münster — Verkehrsplanung', url: 'https://www.stadt-muenster.de/' },
    ],
  },
  nuernberg: {
    intro:
      'Nürnberg ist einer der wichtigsten Autobahnknoten Süddeutschlands: A3 (Frankfurt–Passau), A6 (Heilbronn–Amberg) und A9 (München–Berlin) umschließen die Stadt, ergänzt durch den Frankenschnellweg (A73), der als kreuzungsarme Hochleistungsstraße mitten ins Stadtgebiet führt. Das hohe Transitaufkommen aus drei Fernrichtungen trifft hier auf dichten Berufs- und Messeverkehr — ein Mix, der die Einfallstraßen dauerhaft belastet.',
    facts: [
      { label: 'Autobahn-Dreigestirn A3/A6/A9', value: 'drei Fernautobahnen umschließen die Stadt; ihre Kreuze tragen starken überregionalen Transitverkehr', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Frankenschnellweg (A73)', value: 'kreuzungsarme Stadtdurchfahrt als belastete Hauptschlagader — bekannter Stau- und Konfliktkorridor', quelle: 'Stadt Nürnberg — Verkehrsplanung', url: 'https://www.nuernberg.de/' },
      { label: 'Innerstädtische Brennpunkte', value: 'stark befahrene Einfallstraßen wie die Fürther Straße zählen zu den unfallträchtigsten Achsen der Stadt', quelle: 'Allianz-Unfallanalyse (lokale Berichterstattung)', url: 'https://nuernberg.t-online.de/' },
      { label: 'Kreuz Nürnberg (A3 × A9)', value: 'südöstlicher Knoten des Fernverkehrs Richtung München, Passau und Berlin mit hohem Lkw-Aufkommen', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
  stuttgart: {
    intro:
      'Stuttgart liegt in einem von Hügeln umschlossenen Talkessel, der den Verkehr auf wenige Ein- und Ausfahrtkorridore presst. A8 (Karlsruhe–München) und A81 (Heilbronn–Singen) treffen westlich am Dreieck Leonberg zusammen, wo der Engelbergtunnel die A81 durch den Höhenzug führt. Innerstädtisch stehen B14 und B27 als Kesselrandstraßen unter Dauerlast; die Kessellage hemmt den Luftaustausch und befördert die bekannte Feinstaubdebatte am Neckartor.',
    facts: [
      { label: 'A8/A81 am Dreieck Leonberg', value: 'westlicher Zusammenschluss der beiden Fernautobahnen; der Engelbergtunnel führt die A81 durch den Höhenzug', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
      { label: 'Kessel-Hauptachsen B14/B27', value: 'die Kesselrandstraßen bündeln den Pendelverkehr auf engen, kurvigen Korridoren — hohe Auffahr- und Spurwechseldichte', quelle: 'Stadt Stuttgart, Verkehr', url: 'https://www.stuttgart.de/' },
      { label: 'Feinstaub am Neckartor', value: 'die Kessellage konzentriert verkehrsbedingte Emissionen — Spitzenwerte an der Messstelle Neckartor', quelle: 'LUBW Baden-Württemberg — Messstelle Am Neckartor', url: 'https://www.lubw.baden-wuerttemberg.de/' },
      { label: 'Tunnelstrecken im Kessel', value: 'zahlreiche Tunnel (u. a. Heslacher Tunnel an der B14) führen den Verkehr durch die Hanglagen — enge Ein- und Ausfahrten', quelle: 'Stadt Stuttgart, Verkehr', url: 'https://www.stuttgart.de/' },
    ],
  },
  wuppertal: {
    intro:
      'Wuppertal ist eine Tallage-Stadt: Barmen und Elberfeld wuchsen entlang des engen Wuppertals zusammen, sodass steile Hänge, enge Kurven und dichte Bebauung das Straßennetz bis heute prägen. Die B7 folgt als Talachse dem Flusslauf, während die A46 die Stadt in West-Ost-Richtung quert und am Sonnborner Kreuz sogar die historische Schwebebahn unterfährt; die A1 tangiert den nördlichen Stadtrand.',
    facts: [
      { label: 'A46 am Sonnborner Kreuz', value: 'West-Ost-Durchquerung der Tallage; die Schwebebahn überspannt hier die Autobahn — markante, beengte Verkehrsführung', quelle: 'Stadt Wuppertal / Schwebebahn (Sonnborner Kreuz)', url: 'https://www.wuppertal.de/' },
      { label: 'B7 Talachse', value: 'folgt dem engen Wuppertal als zentrale Hauptverkehrsstraße — kurvig, eng und dauerhaft belastet', quelle: 'Stadt Wuppertal, Verkehr', url: 'https://www.wuppertal.de/' },
      { label: 'Tallage-Topografie', value: 'steile Hänge und enge Kurvenstraßen erhöhen das Risiko bei Nässe und Glätte', quelle: 'Unfallatlas der Statistischen Ämter', url: 'https://unfallatlas.statistikportal.de/' },
      { label: 'A1 am Nordrand', value: 'tangiert die Stadt im Norden und bindet sie an den Fernverkehr Köln–Dortmund an — Anschlussstellen mit kurzen Rampen', quelle: 'Autobahn GmbH des Bundes', url: 'https://www.autobahn.de/' },
    ],
  },
}
