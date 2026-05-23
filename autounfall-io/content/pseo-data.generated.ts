// AUTO-GENERIERT von scripts/port-pseo.py — NICHT von Hand editieren.
// WP-5 PSEO: 100 kfz-unfall/[stadt]/[typ]-Seiten (20 Staedte x 5 Typen).
// Quelle: PSEO-<stadt>-<typ>.html (Prototyp). typ_count wird zur Render-Zeit
// berechnet: Math.round(unfaelle * pct/100) — im Quell-HTML verifiziert (100/100).

export type PseoCity = {
  slug: string; name: string; einwohner: string; pkw: string;
  unfaelle: string; svs: string; gericht: string
}
export type PseoType = {
  slug: string; label: string; pct: number; schaden: string; bgh: string;
  /** Kontrolliertes HTML (<strong>/<span>) — via dangerouslySetInnerHTML. */
  definition: string
}

export const PSEO_CITIES: Record<string, PseoCity> = {
  "berlin": {
    "slug": "berlin",
    "name": "Berlin",
    "einwohner": "3.676.000",
    "pkw": "1.245.000",
    "unfaelle": "98.700",
    "svs": "ca. 142",
    "gericht": "Amtsgericht Mitte · Landgericht Berlin"
  },
  "bielefeld": {
    "slug": "bielefeld",
    "name": "Bielefeld",
    "einwohner": "334.000",
    "pkw": "156.000",
    "unfaelle": "11.200",
    "svs": "ca. 13",
    "gericht": "Amtsgericht Bielefeld · Landgericht Bielefeld"
  },
  "bochum": {
    "slug": "bochum",
    "name": "Bochum",
    "einwohner": "365.000",
    "pkw": "168.000",
    "unfaelle": "12.400",
    "svs": "ca. 15",
    "gericht": "Amtsgericht Bochum · Landgericht Bochum"
  },
  "bonn": {
    "slug": "bonn",
    "name": "Bonn",
    "einwohner": "331.000",
    "pkw": "158.000",
    "unfaelle": "11.500",
    "svs": "ca. 14",
    "gericht": "Amtsgericht Bonn · Landgericht Bonn"
  },
  "bremen": {
    "slug": "bremen",
    "name": "Bremen",
    "einwohner": "567.000",
    "pkw": "245.000",
    "unfaelle": "18.200",
    "svs": "ca. 22",
    "gericht": "Amtsgericht Bremen · Landgericht Bremen"
  },
  "dortmund": {
    "slug": "dortmund",
    "name": "Dortmund",
    "einwohner": "588.000",
    "pkw": "261.000",
    "unfaelle": "21.300",
    "svs": "ca. 28",
    "gericht": "Amtsgericht Dortmund · Landgericht Dortmund"
  },
  "dresden": {
    "slug": "dresden",
    "name": "Dresden",
    "einwohner": "562.000",
    "pkw": "225.000",
    "unfaelle": "15.200",
    "svs": "ca. 18",
    "gericht": "Amtsgericht Dresden · Landgericht Dresden"
  },
  "duesseldorf": {
    "slug": "duesseldorf",
    "name": "Düsseldorf",
    "einwohner": "619.000",
    "pkw": "285.000",
    "unfaelle": "24.800",
    "svs": "ca. 31",
    "gericht": "Amtsgericht Düsseldorf · Landgericht Düsseldorf"
  },
  "duisburg": {
    "slug": "duisburg",
    "name": "Duisburg",
    "einwohner": "502.000",
    "pkw": "218.000",
    "unfaelle": "16.800",
    "svs": "ca. 21",
    "gericht": "Amtsgericht Duisburg · Landgericht Duisburg"
  },
  "essen": {
    "slug": "essen",
    "name": "Essen",
    "einwohner": "581.000",
    "pkw": "255.000",
    "unfaelle": "20.100",
    "svs": "ca. 25",
    "gericht": "Amtsgericht Essen · Landgericht Essen"
  },
  "frankfurt": {
    "slug": "frankfurt",
    "name": "Frankfurt",
    "einwohner": "773.000",
    "pkw": "365.000",
    "unfaelle": "28.900",
    "svs": "ca. 42",
    "gericht": "Amtsgericht Frankfurt am Main · Landgericht Frankfurt"
  },
  "hamburg": {
    "slug": "hamburg",
    "name": "Hamburg",
    "einwohner": "1.845.000",
    "pkw": "810.000",
    "unfaelle": "64.500",
    "svs": "ca. 78",
    "gericht": "Amtsgericht Hamburg · Landgericht Hamburg"
  },
  "hannover": {
    "slug": "hannover",
    "name": "Hannover",
    "einwohner": "535.000",
    "pkw": "234.000",
    "unfaelle": "17.800",
    "svs": "ca. 24",
    "gericht": "Amtsgericht Hannover · Landgericht Hannover"
  },
  "koeln": {
    "slug": "koeln",
    "name": "Köln",
    "einwohner": "1.085.000",
    "pkw": "478.000",
    "unfaelle": "38.400",
    "svs": "ca. 47",
    "gericht": "Amtsgericht Köln · Landgericht Köln"
  },
  "leipzig": {
    "slug": "leipzig",
    "name": "Leipzig",
    "einwohner": "605.000",
    "pkw": "248.000",
    "unfaelle": "16.400",
    "svs": "ca. 19",
    "gericht": "Amtsgericht Leipzig · Landgericht Leipzig"
  },
  "muenchen": {
    "slug": "muenchen",
    "name": "München",
    "einwohner": "1.488.000",
    "pkw": "705.000",
    "unfaelle": "52.800",
    "svs": "ca. 68",
    "gericht": "Amtsgericht München · Landgericht München I"
  },
  "muenster": {
    "slug": "muenster",
    "name": "Münster",
    "einwohner": "316.000",
    "pkw": "148.000",
    "unfaelle": "10.800",
    "svs": "ca. 13",
    "gericht": "Amtsgericht Münster · Landgericht Münster"
  },
  "nuernberg": {
    "slug": "nuernberg",
    "name": "Nürnberg",
    "einwohner": "525.000",
    "pkw": "234.000",
    "unfaelle": "17.600",
    "svs": "ca. 23",
    "gericht": "Amtsgericht Nürnberg · Landgericht Nürnberg-Fürth"
  },
  "stuttgart": {
    "slug": "stuttgart",
    "name": "Stuttgart",
    "einwohner": "632.000",
    "pkw": "302.000",
    "unfaelle": "23.400",
    "svs": "ca. 34",
    "gericht": "Amtsgericht Stuttgart · Landgericht Stuttgart"
  },
  "wuppertal": {
    "slug": "wuppertal",
    "name": "Wuppertal",
    "einwohner": "355.000",
    "pkw": "164.000",
    "unfaelle": "11.800",
    "svs": "ca. 14",
    "gericht": "Amtsgericht Wuppertal · Landgericht Wuppertal"
  }
}

export const PSEO_TYPES: Record<string, PseoType> = {
  "auffahrunfall": {
    "slug": "auffahrunfall",
    "label": "Auffahrunfall",
    "pct": 24,
    "schaden": "4.200 €",
    "bgh": "VI ZR 32/16",
    "definition": "Ein <strong>Auffahrunfall</strong> ist ein Verkehrsunfall, bei dem ein Fahrzeug auf das vorausfahrende auffährt — der Anscheinsbeweis spricht regelmäßig gegen den Auffahrenden (§ 4 Abs. 1 StVO)."
  },
  "parkplatzunfall": {
    "slug": "parkplatzunfall",
    "label": "Parkplatzunfall",
    "pct": 18,
    "schaden": "2.100 €",
    "bgh": "VI ZR 162/13",
    "definition": "Ein <strong>Parkplatzunfall</strong> ist ein Verkehrsunfall, bei dem ein Fahrzeug auf privatem oder öffentlich zugänglichem Parkraum mit einem anderen Fahrzeug oder festem Hindernis kollidiert — typisch beim Ein-/Ausparken."
  },
  "spurwechsel": {
    "slug": "spurwechsel",
    "label": "Spurwechsel",
    "pct": 11,
    "schaden": "3.800 €",
    "bgh": "VI ZR 192/19",
    "definition": "Ein <strong>Spurwechsel</strong> ist ein Verkehrsunfall, bei dem ein Fahrzeug beim Fahrstreifenwechsel mit einem anderen Verkehrsteilnehmer kollidiert — der Spurwechselnde trägt nach § 7 Abs. 5 StVO grundsätzlich die Haftung."
  },
  "vorfahrtsverletzung": {
    "slug": "vorfahrtsverletzung",
    "label": "Vorfahrtsverletzung",
    "pct": 9,
    "schaden": "6.700 €",
    "bgh": "VI ZR 281/06",
    "definition": "Ein <strong>Vorfahrtsverletzung</strong> ist ein Verkehrsunfall, bei dem ein Fahrzeug die Vorfahrt eines anderen Verkehrsteilnehmers verletzt — § 8 StVO regelt die Vorfahrt an Kreuzungen."
  },
  "wildunfall": {
    "slug": "wildunfall",
    "label": "Wildunfall",
    "pct": 6,
    "schaden": "3.450 €",
    "bgh": "IV ZR 295/13",
    "definition": "Ein <strong>Wildunfall</strong> ist ein Verkehrsunfall, bei dem ein Fahrzeug mit einem Wildtier auf einer öffentlichen Straße kollidiert — Erstattung typischerweise über die Teilkasko-Versicherung."
  }
}

export const PSEO_CITY_SLUGS = ["berlin", "bielefeld", "bochum", "bonn", "bremen", "dortmund", "dresden", "duesseldorf", "duisburg", "essen", "frankfurt", "hamburg", "hannover", "koeln", "leipzig", "muenchen", "muenster", "nuernberg", "stuttgart", "wuppertal"] as const
export const PSEO_TYPE_SLUGS = ["auffahrunfall", "parkplatzunfall", "spurwechsel", "vorfahrtsverletzung", "wildunfall"] as const
