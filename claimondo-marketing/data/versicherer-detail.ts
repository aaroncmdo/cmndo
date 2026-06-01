/**
 * Versicherer-Detail — strukturierte Hub-Daten je Versicherer (Sprint 1, Welle 2).
 *
 * Prosa (Profil-Intro, Signature-Taktik, „Was tun") + FAQ leben im MD-Body
 * (src/content/claimondo/versicherer/<slug>.md). Strukturierte Daten (Urteile,
 * Kontakt, Schadens-Netzwerk, Sentiment) liegen hier — der Frontmatter-Parser
 * kann kein verschachteltes YAML.
 *
 * Quellen: R5 (Urteile), R7 (Kontakt), R3 (Prüfdienste), R6 (Sentiment) +
 * 02-r2 Annexe. Belegbarkeit B2/K9: Az + Gericht + Datum = Zitat; Sentiment nur
 * als zitierte Drittquelle. KEIN AggregateRating-Schema (UWG/Google-Policy).
 */
import type { Urteil } from '@/components/content/UrteilsListe'

export interface VersichererKontakt {
  hotline247?: string
  hotlineAusland?: string
  schadenUrl: string
  postanschrift: string
  email?: string
}

export interface VersichererSchadensNetzwerk {
  pruefdienste: string[]
  restwertboerse?: string
  werkstattnetz?: string
  mietwagenpartner?: string
  kalkulationssoftware?: string[]
  /** Allianz-ControlExpert-Mehrheit-Callout (F-25). */
  controlExpertHinweis?: boolean
}

export interface VersichererSentiment {
  /** Zitierte Drittquellen-Scores (1-5), nur wo belegt — KEIN eigenes Rating-Schema. */
  trustpilot?: number
  google?: number
  scoreStand?: string
  topBeschwerden: string[]
  topLob?: string[]
  /** Forsa/DAV-Befragung 2017, vollständig zitiert. */
  davForsa?: string
}

export interface VersichererDetail {
  urteile: Urteil[]
  kontakt: VersichererKontakt
  schadensNetzwerk: VersichererSchadensNetzwerk
  sentiment?: VersichererSentiment
}

export const VERSICHERER_DETAIL: Partial<Record<string, VersichererDetail>> = {
  'huk-coburg-allgemeine': {
    urteile: [
      { az: 'BGH VI ZB 22/08', datum: '2008-11-18', gericht: 'BGH', streitthema: 'Fälligkeit erst nach 6-monatiger Weiternutzung (130 %)', ergebnis: 'HUK-Praxis als rechtswidrig verworfen.' },
      { az: 'LG Düsseldorf 20 S 109/18', datum: '2019-02-15', gericht: 'LG Düsseldorf', streitthema: 'ControlExpert-Prüfbericht, Kürzung 1.675,74 €', ergebnis: 'Kürzung verworfen, volle Erstattung.' },
      { az: 'AG Köln 275 C 179/15', datum: '2016-02-25', gericht: 'AG Köln', streitthema: 'Kürzung des Sachverständigenhonorars', ergebnis: 'Unzulässig — der Klage stattgegeben.' },
      { az: 'AG Coburg 15 C 696/17', datum: '2017-07-14', gericht: 'AG Coburg', streitthema: 'Allgemeine Schadensersatzgrundsätze', ergebnis: 'Gericht rügt HUK ausdrücklich, zugunsten der Geschädigten.' },
    ],
    kontakt: {
      hotline247: '0800 248 54 45',
      hotlineAusland: '+49 9561 96 108',
      schadenUrl: 'https://www.huk.de/service/schaden/unfallhilfe.html',
      postanschrift: 'Willi-Hussong-Str. 2, 96444 Coburg',
      email: 'info@huk-coburg.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['DEKRA', 'Innovation Group', 'ControlExpert (sekundär)'],
      restwertboerse: 'CarTV / AUTOonline',
      werkstattnetz: 'Schadensteuerung HUK (intern)',
      kalkulationssoftware: ['DAT', 'Audatex'],
    },
    sentiment: {
      trustpilot: 1.8,
      google: 2.9,
      scoreStand: '2024',
      topBeschwerden: [
        'Stundenverrechnungssätze nach eigenem Prüfbericht gekürzt',
        'Zahlung erst nach Klagezustellung',
        'UPE-Aufschläge, Verbringungskosten und Beilackierung gestrichen',
      ],
      topLob: ['Niedriger Beitrag', 'Guter Tarifvergleich'],
      davForsa:
        '68 % der 1.072 befragten Verkehrsanwälte nennen die HUK-Coburg als Versicherer mit häufigen Problemen bei der Haftpflichtregulierung (Forsa im Auftrag der AG Verkehrsrecht im DAV, Oktober/November 2017, Stern 49/2017).',
    },
  },

  allianz: {
    urteile: [
      { az: 'AG Hagen 16 C 371/05', datum: '2006-05-24', gericht: 'AG Hagen', streitthema: 'ControlExpert-Kalkulation', ergebnis: 'Gericht: Kalkulation „völlig losgelöst vom konkreten Unfallschaden" — Kürzung verworfen.' },
      { az: 'LG Frankfurt (Oder) 72 O 10/15', datum: '2016-07-18', gericht: 'LG Frankfurt (Oder)', streitthema: 'Verzögerungstaktik / Nutzungsausfall', ergebnis: 'Verzögerung führt zu erhöhtem Nutzungsausfall zulasten der Allianz.' },
      { az: 'LG Düsseldorf 20 S 109/18', datum: '2019-02-15', gericht: 'LG Düsseldorf', streitthema: 'ControlExpert-Prüfbericht als Kürzungsgrundlage', ergebnis: 'Prüfbericht-gestützte Kürzung verworfen.' },
    ],
    kontakt: {
      hotline247: '0800 11 22 33 44',
      hotlineAusland: '+49 89 3800-2300',
      schadenUrl: 'https://www.allianz.de/service/schaden-melden/kfz/',
      postanschrift: 'Königinstr. 28, 80802 München',
      email: 'sachschaden@allianz.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['ControlExpert', 'LOGICHECK', 'AZT (Allianz-Zentrum für Technik)'],
      werkstattnetz: 'Allianz-Werkstattnetz (aktives Schadenmanagement)',
      mietwagenpartner: 'LOGICHECK (Fraunhofer statt Schwacke)',
      controlExpertHinweis: true,
    },
    sentiment: {
      topBeschwerden: [
        'SV-Honorar mit Verweis auf fehlende BVSK-Mitgliedschaft gekürzt (seit 2024)',
        'Mietwagenkürzung über LOGICHECK (Fraunhofer)',
        'Vorgerichtliche 50-%-Vergleichsangebote bei SV-Honorar-Streit',
      ],
      davForsa:
        '44 % der 1.072 befragten Verkehrsanwälte nennen die Allianz (Platz 3 hinter HUK-Coburg und VHV; Forsa/AG Verkehrsrecht im DAV, Stern 49/2017).',
    },
  },

  axa: {
    urteile: [
      { az: 'AG Heinsberg 18 C 32/22', datum: '2022-04-11', gericht: 'AG Heinsberg', streitthema: 'SV-Honorar-Kürzung auf LOGICHECK-Basis', ergebnis: 'Kürzung verworfen.' },
      { az: 'AG Frankfurt 32 C 2787/15', datum: '2015-10-19', gericht: 'AG Frankfurt am Main', streitthema: 'Fiktive Abrechnung, Unkostenpauschale, SV-Kosten', ergebnis: 'Zugunsten der Geschädigten.' },
      { az: 'AG Düsseldorf 36 C 10926/12', datum: '2013-08-02', gericht: 'AG Düsseldorf', streitthema: 'Werkstattverweisung', ergebnis: 'Verweisung verworfen.' },
    ],
    kontakt: {
      hotline247: '0800 2920333',
      hotlineAusland: '+49 221 148-35803',
      schadenUrl: 'https://schadenservice.axa.de/Schadenmeldung/schaden-online-melden-axa',
      postanschrift: 'Colonia-Allee 10-20, 51067 Köln',
      email: 'schaden@axa.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['LOGICHECK', 'DEKRA', 'ControlExpert'],
      mietwagenpartner: 'LOGICHECK',
    },
    sentiment: {
      topBeschwerden: [
        'SV-Honorar-Kürzung plus nachträgliche Regressforderungen an Gutachter (seit 2022)',
        'Keine Reaktion auf Anwaltsschreiben vor Klagezustellung',
        'LOGICHECK-Prüfberichte als Kürzungsgrundlage',
      ],
    },
  },

  huk24: {
    urteile: [
      { az: 'AG Speyer 31 C 272/15', datum: '2015-10-02', gericht: 'AG Speyer', streitthema: 'Mietwagen (Schwacke) + Sachverständigenkosten', ergebnis: 'Zugunsten der Geschädigten.' },
      { az: 'AG Mayen 2d C 403/16', datum: '2016-12-16', gericht: 'AG Mayen', streitthema: 'Verbringungskosten bei konkreter Abrechnung', ergebnis: 'Zugunsten der Geschädigten.' },
      { az: 'AG Grimma 4 C 154/11', datum: '2013-07-09', gericht: 'AG Grimma', streitthema: 'Restliche Mietwagen- und Sachverständigenkosten', ergebnis: 'Zugunsten der Geschädigten.' },
    ],
    kontakt: {
      hotline247: '0800 248 54 45',
      schadenUrl: 'https://www.huk24.de/schaden-melden',
      postanschrift: 'Willi-Hussong-Str. 2, 96440 Coburg',
      email: 'info@huk-coburg.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['DEKRA', 'ControlExpert'],
      restwertboerse: 'CarTV / AUTOonline',
      werkstattnetz: 'HUK-Gruppenapparat (Coburg)',
      kalkulationssoftware: ['DAT', 'Audatex'],
    },
    sentiment: {
      topBeschwerden: [
        'Identische Kürzungspraxis wie HUK-Coburg (gemeinsamer Schadenapparat)',
        'Erstanschreiben empfiehlt Kostenvoranschlag statt Gutachten',
        'Mietwagen nach eigener Tabelle statt Schwacke',
      ],
      davForsa:
        'HUK24 teilt den Schadenapparat der HUK-Coburg-Gruppe, die in der Forsa-Befragung 2017 (AG Verkehrsrecht im DAV) von 68 % der Verkehrsanwälte als Problemversicherer genannt wurde.',
    },
  },

  'r-plus-v': {
    urteile: [
      { az: 'AG Frankfurt 32 C 3278/15', datum: '2015-10-22', gericht: 'AG Frankfurt am Main', streitthema: 'Willkürliche SV-Honorar-Kürzung', ergebnis: 'Zugunsten der Geschädigten.' },
      { az: 'AG Nürnberg 20 C 10301/12', datum: '2014-03-31', gericht: 'AG Nürnberg', streitthema: 'Wertminderung (Gerichtsgutachter gegen Carexpert)', ergebnis: 'Wertminderung durchgesetzt.' },
    ],
    kontakt: {
      hotline247: '0800 533-1111',
      hotlineAusland: '+49 611 1675-0507',
      schadenUrl: 'https://www.ruv.de/service/schadenservice',
      postanschrift: 'Raiffeisenplatz 1, 65189 Wiesbaden',
      email: 'ruv@ruv.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['Carexpert'],
      werkstattnetz: 'R+V-Partnerwerkstätten (Volksbanken-Raiffeisen-Verbund)',
    },
    sentiment: {
      topBeschwerden: [
        'Mandanten-Druck-Fragebogen mit Suggestivfragen zur Anwaltswahl (DAV-Protest 2020)',
        'Carexpert-Prüfberichte als Kürzungsgrundlage',
        'Telefonische Verzögerung („dauert so lange wie es dauert")',
      ],
      davForsa:
        'Trotz dokumentierter Einzelfälle (Mandanten-Fragebogen, versicherungsbote.de 2020) liegt die BaFin-Quote der R+V mit 0,77 deutlich unter dem Branchenschnitt — unterdurchschnittliche Beschwerdedichte.',
    },
  },

  generali: {
    urteile: [
      { az: 'AG Koblenz 161 C 611/13', datum: '2013-07-29', gericht: 'AG Koblenz', streitthema: 'Restliche Sachverständigenkosten', ergebnis: 'Zur Zahlung verurteilt.' },
      { az: 'AG Aachen 120 C 168/14', datum: '2014-07-31', gericht: 'AG Aachen', streitthema: 'Gekürzte SV-Kosten (AachenMünchener/Generali)', ergebnis: 'Zum Ausgleich verurteilt.' },
    ],
    kontakt: {
      hotline247: '089 5121-4477',
      schadenUrl: 'https://www.generali.de/service-kontakt/schaden-melden/',
      postanschrift: 'Adenauerring 7, 81737 München',
      email: 'service@generali.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['ClaimsControlling', 'Carexpert'],
      werkstattnetz: 'Generali WerkstattservicePLUS-Partnernetz',
    },
    sentiment: {
      topBeschwerden: [
        'Werkstattsteuerung über das Partnernetz („Hol- und Bringservice" als Lockmittel)',
        'Standard-Kürzungen UPE/Verbringung bei fiktiver Abrechnung',
        'Regulierung teils erst nach Klagezustellung',
      ],
    },
  },

  cosmosdirekt: {
    urteile: [
      { az: 'AG Koblenz 161 C 611/13', datum: '2013-07-29', gericht: 'AG Koblenz', streitthema: 'Restliche SV-Kosten (Generali-Verbund)', ergebnis: 'Zur Zahlung verurteilt.' },
    ],
    kontakt: {
      hotline247: '0681 966 6815',
      schadenUrl: 'https://www.cosmosdirekt.de/services/schaden-melden/',
      postanschrift: 'Halbergstraße 50-60, 66121 Saarbrücken',
      email: 'info@cosmosdirekt.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['Carexpert'],
      werkstattnetz: 'WerkstattservicePLUS (Generali-Apparat, Saarbrücken)',
    },
    sentiment: {
      topBeschwerden: [
        'Lange Bearbeitungs- und Telefonwartezeiten im Schadenfall',
        '„7-Tage-Versprechen" gilt nur für eigene Kasko-Kunden, nicht für Drittgeschädigte',
        'Drittschaden-Bearbeitung über den Generali-Apparat',
      ],
    },
  },

  lvm: {
    urteile: [
      { az: 'AG Hagen 11 C 281/13', datum: '2014-01-22', gericht: 'AG Hagen', streitthema: 'Kürzung um 14,76 € (SV-Nebenkosten)', ergebnis: 'LVM verliert mit Mehrkosten von mehreren hundert Euro.' },
      { az: 'AG Starnberg (RA Schüll)', datum: '2019-01-01', gericht: 'AG Starnberg', streitthema: 'Kürzung trotz Leasingfahrzeug unter 2 Jahre', ergebnis: 'Zugunsten der Geschädigten.' },
    ],
    kontakt: {
      hotline247: '0251 702-70200',
      hotlineAusland: '0251 702-4765',
      schadenUrl: 'https://www.lvm.de/schaden-melden/app/ui/melden',
      postanschrift: 'Kolde-Ring 21, 48126 Münster',
      email: 'post@lvm.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['ControlExpert'],
      werkstattnetz: 'Schadensteuerung über 2.200 LVM-Agenturen (ohne Werkstattbindungstarif)',
    },
    sentiment: {
      topBeschwerden: [
        'Kürzungsschreiben mit unzutreffender Bezugnahme auf BGH-Urteile (Kanzlei Schleyer)',
        '„Passiver Rechtsschutz" — Aufforderung, Schriftwechsel nur mit der LVM zu führen',
        'Vorgerichtlich hartleibig, schnelle Zahlung nach Klage',
      ],
      davForsa:
        'Die BaFin-Quote der LVM ist mit 0,76 die branchenbeste; gleichwohl dokumentiert die Kanzlei Schleyer wiederholt Kürzungsschreiben mit falschen BGH-Zitaten — dokumentierte Einzelfälle bei unterdurchschnittlicher Beschwerdedichte.',
    },
  },

  ergo: {
    urteile: [
      { az: 'AG Heinsberg 18 C 403/13', datum: '2014-02-04', gericht: 'AG Heinsberg', streitthema: 'SV-Honorar-Kürzung (Carexpert)', ergebnis: 'Kürzung verworfen.' },
      { az: 'AG Leipzig 109 C 9047/11', datum: '2012-01-13', gericht: 'AG Leipzig', streitthema: 'Umgang mit dem eingereichten Gutachten', ergebnis: 'Zugunsten der Geschädigten.' },
      { az: 'AG Mitte (Berlin)', datum: '2016-12-01', gericht: 'AG Mitte Berlin', streitthema: 'Restzahlung nach Carexpert-Kürzung', ergebnis: 'ERGO zur Nachzahlung von 619,43 € + Anwaltskosten verurteilt.' },
    ],
    kontakt: {
      hotline247: '0800 3746-000',
      hotlineAusland: '+49 211 477-1330',
      schadenUrl: 'https://www.ergo.de/de/Service/ereignis-melden/schadenfall-melden/kfz',
      postanschrift: 'ERGO-Platz 1, 40477 Düsseldorf',
      email: 'schaden@ergo.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['Carexpert (Munich-Re-Verbund, exklusiv für ERGO + DKV)'],
      werkstattnetz: 'ERGO-Schadenmanagement',
    },
    sentiment: {
      topBeschwerden: [
        'Restwert-„Hochsetzung" über Carexpert-Nachbesichtigung (Schleyer-Fall: 0 € → 34.620 €)',
        'Wertminderung pauschal auf Carexpert-Standardsätze gekürzt',
        'Reparaturdauer-Korrektur; Zahlung häufig erst nach Klage',
      ],
      davForsa:
        'Die BaFin-Statistik 2024 weist für die ERGO eine Quote von 4,7 Beschwerden je 100.000 Verträge aus (125 Beschwerden) — der höchste Wert unter den großen Kfz-Versicherern (transparent-beraten.de auf BaFin-Basis).',
    },
  },

  vhv: {
    urteile: [
      { az: 'AG Offenbach 36 C 248/15', datum: '2016-02-04', gericht: 'AG Offenbach', streitthema: 'Kürzung 45,57 € SV + 328,60 € Reparatur', ergebnis: 'Zugunsten der Geschädigten.' },
      { az: 'AG Chemnitz 15 C 928/15', datum: '2015-07-30', gericht: 'AG Chemnitz', streitthema: 'SV-Honorar-Kürzung 92,41 €', ergebnis: 'VHV unterliegt.' },
      { az: 'AG Salzgitter 22 C 57/15', datum: '2015-10-14', gericht: 'AG Salzgitter', streitthema: 'ControlExpert-Prüfbericht als Beweismittel', ergebnis: 'Prüfbericht als ungeeignet bewertet.' },
    ],
    kontakt: {
      hotline247: '0511 65505020',
      hotlineAusland: '+49 221 827 73 04',
      schadenUrl: 'https://www.vhv.de/kundenservice/schaden-melden',
      postanschrift: 'VHV-Platz 1, 30177 Hannover',
      email: 'info@vhv.de',
    },
    schadensNetzwerk: {
      pruefdienste: ['Carexpert'],
      werkstattnetz: 'Eigenes Schadenmanagement (Kooperation mit HUK-Coburg dokumentiert)',
    },
    sentiment: {
      topBeschwerden: [
        'Offene „Grundsatzentscheidung des Hauses": SV-Honorar nach eigenem Gebührenrechner statt BVSK',
        'Prüfdienstleister laut Kanzlei Voigt „weisungsgebunden, ohne eigenen Prüfungsspielraum"',
        'Prozessbereite Klageerwiderung; Sofortzahlung erst nach Klage gegen den VN',
      ],
      davForsa:
        '46 % der 1.072 befragten Verkehrsanwälte nennen die VHV (Platz 2 hinter HUK-Coburg; Forsa/AG Verkehrsrecht im DAV, Stern 49/2017).',
    },
  },

  zurich: {
    urteile: [
      { az: 'AG Frankfurt 31 C 646/12', datum: '2012-05-10', gericht: 'AG Frankfurt am Main', streitthema: 'SV-Honorar-Kürzung', ergebnis: 'Kürzung verworfen.' },
      { az: 'AG Iserlohn 40 C 159/09', datum: '2009-09-21', gericht: 'AG Iserlohn', streitthema: 'Mietwagen (Schwacke statt Fraunhofer)', ergebnis: 'Schwacke durchgesetzt.' },
      { az: 'AG Bonn 101 C 292/12', datum: '2013-03-07', gericht: 'AG Bonn', streitthema: 'SV-Honorar', ergebnis: 'Zugunsten der Geschädigten.' },
    ],
    kontakt: {
      hotline247: '0221 7715-7780',
      schadenUrl: 'https://www.zurich.de/de-de/formulare/schaden-melden_geschaedigter-kfz-haftpflicht',
      postanschrift: 'Deutzer Allee 1, 50679 Köln',
      email: 'schaden@zurich.com',
    },
    schadensNetzwerk: {
      pruefdienste: ['LOGICHECK', 'ControlExpert', 'DEKRA'],
      mietwagenpartner: 'LOGICHECK (Fraunhofer)',
    },
    sentiment: {
      topBeschwerden: [
        'Mietwagen-Kürzung über Fraunhofer statt Schwacke',
        'SV-Honorar-Kürzung mit Standard-„Erforderlichkeits"-Argumenten',
        'Hartleibig auf Anwaltsebene, Vergleich/Anerkenntnis meist erst nach Klage',
      ],
    },
  },

  'da-direkt': {
    urteile: [
      { az: 'AG München 343 C 7350/10', datum: '2011-11-09', gericht: 'AG München', streitthema: 'Gekürzte SV-Kosten (sechs verbundene Verfahren)', ergebnis: 'In voller Höhe geschuldet.' },
      { az: 'AG Siegburg 113 C 63/13', datum: '2013-07-24', gericht: 'AG Siegburg', streitthema: 'SV-Honorar-Kürzung 74,20 €', ergebnis: 'Zur Zahlung verurteilt.' },
      { az: 'AG Koblenz 161 C 611/13', datum: '2013-07-29', gericht: 'AG Koblenz', streitthema: 'Restliche SV-Kosten', ergebnis: 'Zur Zahlung verurteilt.' },
    ],
    kontakt: {
      hotline247: '0221 7715-7766',
      schadenUrl: 'https://www.da-direkt.de/schadenservice',
      postanschrift: 'DA Versicherung, 60322 Frankfurt am Main',
    },
    schadensNetzwerk: {
      pruefdienste: ['LOGICHECK', 'ControlExpert', 'DEKRA'],
      werkstattnetz: 'Zurich-Schadenapparat (Mutterkonzern)',
    },
    sentiment: {
      topBeschwerden: [
        'SV-Honorar-Kürzung mit Standardbegründung „nicht erforderlich i. S. v. § 249 BGB" (seit 2011 dokumentiert)',
        'Bezugnahme auf BGH-Urteile zum SV-Honorar mit unzutreffender Interpretation',
        'Schadenapparat gemeinsam mit der Zurich (Mutterkonzern, nicht Generali)',
      ],
    },
  },
}

export function getVersichererDetail(slug: string): VersichererDetail | undefined {
  return VERSICHERER_DETAIL[slug]
}
