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
}

export function getVersichererDetail(slug: string): VersichererDetail | undefined {
  return VERSICHERER_DETAIL[slug]
}
