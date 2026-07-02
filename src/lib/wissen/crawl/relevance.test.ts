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
})
