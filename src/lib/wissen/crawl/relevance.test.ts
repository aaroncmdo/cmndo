import { describe, it, expect } from 'vitest'
import { isRelevantB2B } from './relevance'

describe('isRelevantB2B', () => {
  it('gibt true fuer einen Kfz-Artikel (Unfall + Gutachten + Schadenregulierung)', () => {
    const item = {
      title: 'Nach dem Unfall: Gutachten und Schadenregulierung',
      summary: 'Was Geschaedigte wissen muessen, wenn der Versicherer den Sachverstaendigen ablehnt.',
    }
    expect(isRelevantB2B(item)).toBe(true)
  })

  it('gibt false fuer ein off-topic Medienrecht-Thema ohne Kfz-Bezug', () => {
    const item = {
      title: 'Untersagung von Russia Today — Medienrecht',
      summary:
        'Das Bundesverwaltungsgericht hat die Zulassung des Senders Russia Today Deutschland widerrufen. Pressefreiheit und Regulierung.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })

  it('gibt true fuer einen Artikel mit Versicherer/Versicherung', () => {
    const item = {
      title: 'Versicherer lehnt Totalschaden ab',
      summary: 'Wie Betroffene reagieren, wenn die Versicherung den Restwert zu hoch ansetzt.',
    }
    expect(isRelevantB2B(item)).toBe(true)
  })

  // --- Grenzfaelle: Word-Boundary-Schutz ---

  it('gibt false fuer "automatisch" ohne Kfz-Kontext (word-boundary-Schutz fuer "auto")', () => {
    const item = {
      title: 'Automatisch optimierte Lieferketten in der Logistik',
      summary: 'Neue KI-Algorithmen ermoglichen automatische Dispositionsplanung ohne manuellen Eingriff.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })

  it('gibt true fuer "Auto" als Standalone-Wort', () => {
    const item = {
      title: 'Mein Auto ist nach dem Hagel ein Totalschaden',
      summary: 'Karosserieschaeden und Wertminderung bei Hagelschlag.',
    }
    expect(isRelevantB2B(item)).toBe(true)
  })

  it('gibt true fuer KFZ-Haftpflicht-Thema', () => {
    const item = {
      title: 'KFZ-Haftpflicht: Was zahlt die Kfz-Versicherung wirklich?',
      summary: 'Mietwagen, Nutzungsausfall und Reparaturkosten im Ueberblick.',
    }
    expect(isRelevantB2B(item)).toBe(true)
  })

  it('gibt true fuer DEKRA/TUeV-Pruefartikel', () => {
    const item = {
      title: 'DEKRA und GTU: Unterschiede bei der Hauptuntersuchung',
      summary: 'Wann DEKRA, wann GTU oder Kues — Pruefstellen im Vergleich.',
    }
    expect(isRelevantB2B(item)).toBe(true)
  })

  it('gibt true fuer Artikel mit "Fahrzeug"', () => {
    const item = {
      title: 'Fahrzeugbewertung nach Unfall',
      summary: 'Der Restwert eines Fahrzeugs haengt von vielen Faktoren ab.',
    }
    expect(isRelevantB2B(item)).toBe(true)
  })

  it('gibt false fuer rein politische Meldung ohne Kfz-Kontext', () => {
    const item = {
      title: 'Bundesrat beschliesst neues Steuergesetz',
      summary: 'Die Laender einigten sich auf eine Reform der Grunderwerbsteuer.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })

  // --- E2E-Smoke-Regressionen (02.07.): "verkehr"/"gutacht" als breite Terme
  // erzeugten diese False-Positives; jetzt nur noch Kfz-spezifische Komposita. ---

  it('gibt false fuer "Verkehrsverbot" (Tabakrecht, kein Verkehrsunfall)', () => {
    const item = {
      title: 'Verkehrsverbot fuer Wasserpfeifentabak: Zusatzstoffdefinition',
      summary:
        'Ein Stoff ist nach dem TabakerzG als Zusatzstoff einzustufen, wenn er dem Tabakerzeugnis planmaessig beigefuegt wird.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })

  it('gibt false fuer "Gutachterausschuss" (Immobilienbewertung, kein Kfz-Gutachten)', () => {
    const item = {
      title: 'Immobilienbewertung fuer die Erbschaft- und Schenkungsteuer und der Gutachterausschuss',
      summary:
        'Nach dem BewG duerfen Finanzgerichte die vom Gutachterausschuss mitgeteilten Vergleichspreise im Vergleichswertverfahren zugrunde legen.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })

  // --- Ausschluss-Filter (E2E-Diagnostik 02.07.): Motorsport/Event + Personen-Unfallversicherung
  // matchen zwar einen Kfz-Anker (küs/unfall), sind aber themenfremd. ---

  it('gibt false fuer Motorsport trotz Kfz-Anker (KÜS-Rennteam)', () => {
    const item = {
      title: 'Manthey: Podium am Lausitzring',
      summary: 'Das KÜS-Team feiert einen Podiumsplatz im GT-Rennsport.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })

  it('gibt false fuer Personen-Unfallversicherung (kein Kfz-Unfall)', () => {
    const item = {
      title: 'Unfallversicherer: Diese Anbieter werden haeufig weiterempfohlen',
      summary: 'Vergleich privater Unfallversicherung — Leistungen und Beitraege im Ueberblick.',
    }
    expect(isRelevantB2B(item)).toBe(false)
  })
})
