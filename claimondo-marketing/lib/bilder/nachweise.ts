// Bildnachweis fuer die Schadenfotos unter /img/schaeden/ (Wikimedia Commons).
//
// ⚠ RECHTLICH BINDEND: Bei CC BY und CC BY-SA ist die Nennung von Urheber und Lizenz
// Bedingung der Lizenz — ohne sie ist die Nutzung eine Urheberrechtsverletzung, auch
// wenn das Bild "frei" heisst. Nur CC0 und Public Domain sind nennungsfrei; sie stehen
// hier trotzdem drin, damit die Herkunft nachvollziehbar bleibt.
//
// ⚠ Beim Erzeugen dieser Liste aus der Markdown-Tabelle gingen zuerst 6 von 28 Eintraegen
// STILL verloren: die Commons-URLs enthalten selbst Klammern ("..._C3_(2).jpg"), und ein
// Muster, das bis zur ersten schliessenden Klammer greift, bricht dort ab. Vier der sechs
// waren nennungspflichtig. Wer die Liste neu erzeugt: hinterher die ANZAHL gegen die
// Dateien in public/img/schaeden pruefen, nicht der Konvertierung vertrauen.
//
// Die Seite /bildnachweis rendert diese Liste. Wer ein Bild einbindet, das hier nicht
// steht, muss den Eintrag ergaenzen — sonst fehlt die Nennung.
//
// Rohdaten: docs/marketing/bildnachweis-kfz-bilder.md (mit dem Bildsatz geliefert).

export type Bildnachweis = {
  /** Dateiname ohne Format-Suffix und Breite, z. B. 'unfall-zwei-fahrzeuge-winter' */
  datei: string
  gruppe: string
  lizenz: string
  /** Leer bei Public domain / Attribution ohne kanonische URL */
  lizenzUrl: string
  urheber: string
  quelle: string
  /** false nur bei CC0 / Public domain */
  nennungPflicht: boolean
}

export const BILDNACHWEISE: Bildnachweis[] = [
  {
    datei: 'unfall-baumkollision-kleinwagen',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY-SA 3.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    urheber: 'Tommi Nummelin',
    quelle: 'https://commons.wikimedia.org/wiki/File:Crashed_Citro%C3%ABn_C3_(2).jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-frontschaden-abschleppdienst',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'JoachimKohler-HB',
    quelle: 'https://commons.wikimedia.org/wiki/File:Getunter_Skoda_Octavia_abgeschleppt.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-frontschaden-schwarzer-pkw',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY-SA 3.0 de',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/3.0/de/',
    urheber: 'Alexander Hauk / www.alexander-hauk.de',
    quelle: 'https://commons.wikimedia.org/wiki/File:Autounfall1.JPG',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-frontschaden-vw-beetle',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY 3.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/3.0/',
    urheber: 'Ryanandlenny',
    quelle: 'https://commons.wikimedia.org/wiki/File:New_Beetle_Accident.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-graben-seitenschaden',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'Santeri Viinamäki',
    quelle: 'https://commons.wikimedia.org/wiki/File:Car_accident_Lada_20190610.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-heckschaden-abschleppwagen',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'KOMUnews',
    quelle: 'https://commons.wikimedia.org/wiki/File:Two_car_accident_temporarily_closes_Rock_Quarry_Road_(15468891310).jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-mehrere-fahrzeuge-kreuzung',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'Sillerkiil',
    quelle: 'https://commons.wikimedia.org/wiki/File:Autoavarii_elektritakso_ja_kahe_pargitud_s%C3%B5idukiga_Tartus,_%C3%9Clikooli_t%C3%A4naval,_2014._aasta_juuni.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-totalschaden-front-sportwagen',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'JoachimKohler-HB',
    quelle: 'https://commons.wikimedia.org/wiki/File:Challenge_failed_-_Dodge_Challenger.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'unfall-zwei-fahrzeuge-winter',
    gruppe: 'Unfallschäden / Totalschaden',
    lizenz: 'CC0',
    lizenzUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    urheber: 'Pete from Liverpool, UK',
    quelle: 'https://commons.wikimedia.org/wiki/File:A_Bit_Of_A_Car_Crash_(53531028758).jpg',
    nennungPflicht: false,
  },
  {
    datei: 'auffahrunfall-frontschaden-landstrasse',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY-SA 3.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/3.0/',
    urheber: 'M. Prinz',
    quelle: 'https://commons.wikimedia.org/wiki/File:Auffahrunfall_-_Frontschaden.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'glasschaden-hagel-windschutzscheibe',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'James St. John',
    quelle: 'https://commons.wikimedia.org/wiki/File:Hailstone-smashed_front_windshield_of_a_car_from_4_July_2010_hailstorm_(Limon,_eastern_Colorado,_USA).jpg',
    nennungPflicht: true,
  },
  {
    datei: 'leichter-schaden-delle-heck',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY-SA 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/2.0/',
    urheber: 'CarSpotter from New York',
    quelle: 'https://commons.wikimedia.org/wiki/File:Dented_-_Flickr_-_CarSpotter.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'leichter-schaden-front-delle',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'Public domain',
    lizenzUrl: '',
    urheber: 'Nyttend',
    quelle: 'https://commons.wikimedia.org/wiki/File:Oh_deer!.jpg',
    nennungPflicht: false,
  },
  {
    datei: 'leichter-schaden-front-wildunfall',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'Greg Gjerdingen from Willmar, USA',
    quelle: 'https://commons.wikimedia.org/wiki/File:2017_Toyota_Rav4_XLE_Hybrid_AWD-I_(36942379162).jpg',
    nennungPflicht: true,
  },
  {
    datei: 'leichter-schaden-kotfluegel-delle',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'Ildar Sagdejev (Specious)',
    quelle: 'https://commons.wikimedia.org/wiki/File:2008-12-23_1989_Saab_900_Turbo_fender_damage.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'leichter-schaden-kratzer-lack-tuer',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'Athol Mullen',
    quelle: 'https://commons.wikimedia.org/wiki/File:KeyedPaintOnCar.JPG',
    nennungPflicht: true,
  },
  {
    datei: 'leichter-schaden-scheinwerfer-lackabplatzer',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'Shixart1985',
    quelle: 'https://commons.wikimedia.org/wiki/File:Close_view_of_a_damaged_car_front_in_an_outdoor_setting_during_daylight_hours_near_a_road_in_a_city_area_with_visible_wear_and_tear.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'leichter-schaden-stossstange',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'Øyvind Holmstad',
    quelle: 'https://commons.wikimedia.org/wiki/File:PermaLiv_r%C3%A5dyrkr%C3%A6sj_16-08-20.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'mittlerer-schaden-stossstange-gebrochen',
    gruppe: 'Leichte & mittlere Schäden',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'Santeri Viinamäki',
    quelle: 'https://commons.wikimedia.org/wiki/File:Broken_car_front_bumper.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-karosserie-front-demontiert',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/4.0/',
    urheber: '4300streetcar',
    quelle: 'https://commons.wikimedia.org/wiki/File:Tesla_Model_Y_without_front_bumper_at_Tesla_Collision_Boston_June_2026_1.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-karosserie-heck-demontiert',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/4.0/',
    urheber: '4300streetcar',
    quelle: 'https://commons.wikimedia.org/wiki/File:Grey_Tesla_Model_Y_without_rear_bumper_at_Tesla_Collision_Boston_June_2026.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-karosserie-heck-instandsetzung',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/4.0/',
    urheber: 'Scientificranking',
    quelle: 'https://commons.wikimedia.org/wiki/File:Rear_End_Tesla_Model_X_Collision_Damage_Repair.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-lackierkabine-abgeklebt',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'Attribution',
    lizenzUrl: '',
    urheber: 'selbst fotografiert / HAUK MEDIEN ARCHIV / Alexander Hauk',
    quelle: 'https://commons.wikimedia.org/wiki/File:Lackiererei.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-lackierkabine-lackierung',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC0',
    lizenzUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    urheber: 'Michael Mroczek mroczekm',
    quelle: 'https://commons.wikimedia.org/wiki/File:Rebirth_(Unsplash).jpg',
    nennungPflicht: false,
  },
  {
    datei: 'reparatur-lackierung-spritzpistole',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY-SA 4.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    urheber: 'KelvinJM',
    quelle: 'https://commons.wikimedia.org/wiki/File:A_man_is_painting_a_car.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-schleifen-lackvorbereitung',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'Nenad Stojkovic',
    quelle: 'https://commons.wikimedia.org/wiki/File:A_man_who_sanding_with_a_grinder_and_prepares_the_paint_for_the_car_in_a_home_service._-_Flickr_-_shixart1985.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-werkstatt-diagnose',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'Shixart1985',
    quelle: 'https://commons.wikimedia.org/wiki/File:Young_mechanic_with_laptop_doing_car_diagnostic_at_automobile_repair_shop_close.jpg',
    nennungPflicht: true,
  },
  {
    datei: 'reparatur-werkstatt-schleifen',
    gruppe: 'Reparatur & Wiederherstellung',
    lizenz: 'CC BY 2.0',
    lizenzUrl: 'https://creativecommons.org/licenses/by/2.0/',
    urheber: 'Shixart1985',
    quelle: 'https://commons.wikimedia.org/wiki/File:Man_on_grinding_machine_in_car_workshop.jpg',
    nennungPflicht: true,
  },
]

/** Nachweis zu einem Dateinamen (ohne Suffix). Fehlt er, ist das ein Fehler, kein Fallback. */
export function findeNachweis(datei: string): Bildnachweis | undefined {
  return BILDNACHWEISE.find((b) => b.datei === datei)
}

/** Kurzform fuer die Bildunterschrift: "Urheber · CC BY-SA 4.0" */
export function nachweisKurz(b: Bildnachweis): string {
  return `${b.urheber} · ${b.lizenz}`
}
