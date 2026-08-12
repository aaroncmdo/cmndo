import { describe, it, expect } from 'vitest'
import {
  istHaenger,
  ermittleImStatusSeit,
  tageImStatus,
  baueHaengerTaskText,
  HAENGER_SCHWELLE_TAGE,
} from '../haenger-detektor'

const JETZT = new Date('2026-08-12T12:00:00.000Z')

/** Basis: ein Fall, der seit 10 Tagen steht — also klar ein Haenger. */
const haengend = {
  imStatusSeit: '2026-08-02T12:00:00.000Z',
  hatAktivenTermin: false,
  operativeStatus: 'ersterfassung',
  abgeschlossenAm: null,
  kundeName: 'Maria Musterfrau',
  kundeEmail: 'maria@example-kunde.de',
}

describe('istHaenger', () => {
  it('erkennt einen Fall ohne Bewegung und ohne Termin', () => {
    expect(istHaenger(haengend, JETZT)).toBe(true)
  })

  it('frisch bewegter Fall ist kein Haenger', () => {
    expect(istHaenger({ ...haengend, imStatusSeit: '2026-08-11T12:00:00.000Z' }, JETZT)).toBe(false)
  })

  // Ein Fall mit Termin in zwei Wochen haengt nicht — er wartet planmaessig.
  it('aktiver Termin zaehlt als Bewegung', () => {
    expect(istHaenger({ ...haengend, hatAktivenTermin: true }, JETZT)).toBe(false)
  })

  it('abgeschlossener Fall ist nie ein Haenger', () => {
    expect(istHaenger({ ...haengend, abgeschlossenAm: '2026-08-03T00:00:00.000Z' }, JETZT)).toBe(false)
  })

  it.each(['abgeschlossen', 'storniert', 'archiviert', 'abgelehnt'])(
    'Status %s ist nicht handlungspflichtig',
    (status) => {
      expect(istHaenger({ ...haengend, operativeStatus: status }, JETZT)).toBe(false)
    },
  )

  it('Fall ohne operative_status wird trotzdem geprueft', () => {
    // In prod existieren Claims mit operative_status = NULL — die duerfen nicht
    // durchrutschen, nur weil kein Status gesetzt ist.
    expect(istHaenger({ ...haengend, operativeStatus: null }, JETZT)).toBe(true)
  })

  // Ohne diesen Filter meldet der Detektor taeglich die E2E-Fixtures und wird
  // selbst zum Rauschen — genau der Fehler, der die Task-Liste geflutet hat.
  it.each([
    ['smoke-kunde@claimondo.de', 'Smoke Kunde'],
    ['test-kunde@claimondo.de', 'Test Person'],
    ['irgendwer@example.de', 'DEMO Fixture'],
  ])('filtert Test-/Smoke-Accounts (%s)', (email, name) => {
    expect(istHaenger({ ...haengend, kundeEmail: email, kundeName: name }, JETZT)).toBe(false)
  })

  it('faengt keine echten Namen mit test-aehnlichen Wortteilen', () => {
    // Word-Boundary: "Contest" darf NICHT als Test-Account gelten.
    expect(istHaenger({ ...haengend, kundeName: 'Contest Sieger', kundeEmail: 'c@web.de' }, JETZT)).toBe(true)
  })

  it('respektiert die Schwelle exakt', () => {
    const knappDrunter = new Date(JETZT.getTime() - (HAENGER_SCHWELLE_TAGE * 24 - 1) * 60 * 60_000)
    const knappDrueber = new Date(JETZT.getTime() - (HAENGER_SCHWELLE_TAGE * 24 + 1) * 60 * 60_000)
    expect(istHaenger({ ...haengend, imStatusSeit: knappDrunter }, JETZT)).toBe(false)
    expect(istHaenger({ ...haengend, imStatusSeit: knappDrueber }, JETZT)).toBe(true)
  })

  it('ungueltiger Zeitstempel meldet nicht (fail-quiet statt Fehlalarm)', () => {
    expect(istHaenger({ ...haengend, imStatusSeit: 'kein-datum' }, JETZT)).toBe(false)
  })

  it('abweichende Schwelle wird beachtet', () => {
    expect(istHaenger(haengend, JETZT, 30)).toBe(false)
  })
})

describe('ermittleImStatusSeit', () => {
  it('nimmt den juengsten Uebergang IN den aktuellen Status', () => {
    const t = [
      { to_phase: 'ersterfassung', created_at: '2026-07-01T00:00:00.000Z' },
      { to_phase: 'sv-zugewiesen', created_at: '2026-08-08T00:00:00.000Z' },
      { to_phase: 'ersterfassung', created_at: '2026-07-29T00:00:00.000Z' },
    ]
    expect(ermittleImStatusSeit(t, 'ersterfassung', '2026-06-01T00:00:00.000Z'))
      .toBe('2026-07-29T00:00:00.000Z')
  })

  // Der Anlassfall CLM-2026-01011: Uebergang nach sv-zugewiesen am 08.08., der Claim
  // steht aber wieder auf ersterfassung. Die juengste Transition ist 4 Tage alt — der
  // Fall steht seit der Anlage still. Ein Rueckfall ist keine Bewegung.
  it('ignoriert Uebergaenge, die NICHT im aktuellen Status enden (Rueckfall)', () => {
    const t = [{ to_phase: 'sv-zugewiesen', created_at: '2026-08-08T00:00:00.000Z' }]
    expect(ermittleImStatusSeit(t, 'ersterfassung', '2026-07-29T00:00:00.000Z'))
      .toBe('2026-07-29T00:00:00.000Z')
  })

  it('faellt ohne passenden Uebergang auf die Anlage zurueck', () => {
    expect(ermittleImStatusSeit([], 'ersterfassung', '2026-07-29T00:00:00.000Z'))
      .toBe('2026-07-29T00:00:00.000Z')
  })

  it('behandelt NULL-Status als eigenen Zustand', () => {
    const t = [{ to_phase: null, created_at: '2026-08-05T00:00:00.000Z' }]
    expect(ermittleImStatusSeit(t, null, '2026-07-01T00:00:00.000Z'))
      .toBe('2026-08-05T00:00:00.000Z')
  })

  it('ueberspringt Eintraege ohne Zeitstempel', () => {
    const t = [
      { to_phase: 'ersterfassung', created_at: null },
      { to_phase: 'ersterfassung', created_at: '2026-08-01T00:00:00.000Z' },
    ]
    expect(ermittleImStatusSeit(t, 'ersterfassung', '2026-07-01T00:00:00.000Z'))
      .toBe('2026-08-01T00:00:00.000Z')
  })
})

describe('tageImStatus', () => {
  it('rechnet ganze Tage', () => {
    expect(tageImStatus('2026-08-02T12:00:00.000Z', JETZT)).toBe(10)
  })

  it('klemmt Zukunfts-Zeitstempel auf 0', () => {
    expect(tageImStatus('2026-09-01T00:00:00.000Z', JETZT)).toBe(0)
  })

  it('ungueltiger Wert ergibt 0', () => {
    expect(tageImStatus('quatsch', JETZT)).toBe(0)
  })
})

describe('baueHaengerTaskText', () => {
  it('nennt Fallnummer, Dauer und Status', () => {
    const t = baueHaengerTaskText({ claimNummer: 'CLM-2026-01011', operativeStatus: 'ersterfassung', tage: 14 })
    expect(t.titel).toBe('CLM-2026-01011 steht seit 14 Tagen still')
    expect(t.beschreibung).toContain('ersterfassung')
    expect(t.beschreibung).toContain('14 Tagen')
  })

  it('bleibt lesbar ohne Nummer und ohne Status', () => {
    const t = baueHaengerTaskText({ claimNummer: null, operativeStatus: null, tage: 7 })
    expect(t.titel).toBe('Fall steht seit 7 Tagen still')
    expect(t.beschreibung).toContain('ohne Status')
  })

  it('nutzt echte Umlaute (Frontend-Text)', () => {
    const t = baueHaengerTaskText({ claimNummer: 'CLM-1', operativeStatus: 'filmcheck', tage: 9 })
    expect(t.beschreibung).toContain('prüfen')
    expect(t.beschreibung).toContain('nächsten')
    expect(t.beschreibung).not.toMatch(/pruefen|naechsten/)
  })
})
