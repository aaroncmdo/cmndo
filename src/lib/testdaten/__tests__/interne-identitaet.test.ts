import { describe, it, expect } from 'vitest'
import { istInterneEmail, istInterneIdentitaet, nurExterneEmpfaenger, nurZustellbareEmpfaenger, istOperativerEmpfaenger, letzte9Ziffern, istAbnahmeInbox } from '../interne-identitaet'

// Regression-Guard fuer den Test-SV-Guard (2026-07-03): interne/Test-Leads duerfen NIE
// einen echten Sachverstaendigen buchen/benachrichtigen. Firmendomain @claimondo.de = intern
// (Aaron-Entscheid) — genau die aaron.sprafke@ / info@claimondo.de-Leads hatten den echten
// SV (UnfallSafe/Koeln) gebucht.
describe('istInterneEmail — Firmendomain + Test-Marker', () => {
  it('erkennt @claimondo.de (Gruender-Test-Leads) als intern', () => {
    expect(istInterneEmail('aaron.sprafke@claimondo.de')).toBe(true)
    expect(istInterneEmail('info@claimondo.de')).toBe(true)
    expect(istInterneEmail('aaron.sprafke+kunde15@claimondo.de')).toBe(true)
    expect(istInterneEmail('NICOLAS.KITTA@Claimondo.de')).toBe(true) // case-insensitiv
  })

  it('erkennt @claimondo.test und @claimondo-test.de als intern', () => {
    expect(istInterneEmail('smoke-sv@claimondo.test')).toBe(true)
    expect(istInterneEmail('max.fresh@claimondo-test.de')).toBe(true)
  })

  // Prod-Audit 04.07.: diese Test-Leads rutschten als "extern" durch (False-Negatives).
  it('erkennt RFC-Test-Domains (example.*) + lex-drive.com als intern', () => {
    expect(istInterneEmail('prodtest-dedup@example.de')).toBe(true)
    expect(istInterneEmail('foo@example.com')).toBe(true)
    expect(istInterneEmail('bar@example.org')).toBe(true)
    expect(istInterneEmail('baz@example.net')).toBe(true)
    expect(istInterneEmail('Aaron.Sprafke@lex-drive.com')).toBe(true)
  })

  it('erkennt test/smoke/e2e-Marker auf Fremd-Domains als intern', () => {
    expect(istInterneEmail('test-user@example.com')).toBe(true)
    expect(istInterneEmail('e2e-runner@gmail.com')).toBe(true)
    expect(istInterneEmail('claude.smoke@gmail.com')).toBe(true)
  })

  it('laesst echte externe Kunden durch (nicht intern)', () => {
    expect(istInterneEmail('anja.harig@icloud.com')).toBe(false)
    expect(istInterneEmail('hans.mueller@gmail.com')).toBe(false)
    expect(istInterneEmail('kontakt@autohaus-koeln.de')).toBe(false)
  })

  it('keine False-Positives bei test-aehnlichen echten Adressen', () => {
    expect(istInterneEmail('testarossa@ferrari.de')).toBe(false)
    expect(istInterneEmail('contest@web.de')).toBe(false)
    expect(istInterneEmail('qadir@gmail.com')).toBe(false)
  })

  it('leere/fehlende Email ist nicht intern (fail-open)', () => {
    expect(istInterneEmail(null)).toBe(false)
    expect(istInterneEmail(undefined)).toBe(false)
    expect(istInterneEmail('')).toBe(false)
    expect(istInterneEmail('   ')).toBe(false)
    expect(istInterneEmail('keine-email')).toBe(false)
  })
})

describe('istInterneIdentitaet — Email ODER Platzhalter-Name', () => {
  it('erkennt Platzhalter-Namen (Mustermann) auch bei externer Email', () => {
    expect(istInterneIdentitaet('irgendwer@gmail.com', 'Max Mustermann')).toBe(true)
    expect(istInterneIdentitaet(null, 'Mustermann')).toBe(true)
  })

  it('echter Kunde mit echtem Namen ist nicht intern', () => {
    expect(istInterneIdentitaet('anja.harig@icloud.com', 'Anja Harig')).toBe(false)
    expect(istInterneIdentitaet(null, null)).toBe(false)
  })
})

describe('nurExterneEmpfaenger — interne/Test-Adressen rausfiltern (Send-Guard)', () => {
  it('leert bei rein internen Empfaengern', () => {
    expect(nurExterneEmpfaenger('aaron.sprafke@claimondo.de')).toEqual([])
    expect(nurExterneEmpfaenger(['info@claimondo.de', 'smoke@claimondo.test'])).toEqual([])
  })
  it('behaelt echte externe Empfaenger', () => {
    expect(nurExterneEmpfaenger('anja.harig@icloud.com')).toEqual(['anja.harig@icloud.com'])
  })
  it('filtert gemischt auf externe', () => {
    expect(nurExterneEmpfaenger(['aaron.sprafke@claimondo.de', 'kunde@gmail.com'])).toEqual(['kunde@gmail.com'])
  })
  it('ignoriert leere Eintraege', () => {
    expect(nurExterneEmpfaenger(['', 'kunde@gmail.com'])).toEqual(['kunde@gmail.com'])
  })
})

describe('letzte9Ziffern — robuste Telefon-Normalisierung', () => {
  it('extrahiert die letzten 9 Ziffern formatunabhaengig', () => {
    expect(letzte9Ziffern('+491735633541')).toBe('735633541')
    expect(letzte9Ziffern('+49 173 5633541')).toBe('735633541')
    expect(letzte9Ziffern('0173 5633541')).toBe('735633541')
  })
  it('matcht malformte und korrekte Schreibweise auf dieselben 9 Ziffern', () => {
    // Anja: gespeichert "+49016093388133" vs korrekt "+4916093388133"
    expect(letzte9Ziffern('+49016093388133')).toBe(letzte9Ziffern('+4916093388133'))
  })
  it('leer bei zu wenigen Ziffern / leerer Eingabe', () => {
    expect(letzte9Ziffern('123')).toBe('')
    expect(letzte9Ziffern('')).toBe('')
    expect(letzte9Ziffern(null)).toBe('')
  })
})

// Operational-Allowlist (Send-Isolation-Kollateral-Fix): info@/schaden@ sind gewollte
// operative Alert-Ziele, NIE Matching-Bystander -> beim Senden zustellbar, aber fuer die
// LEAD-Identitaet (Matching) weiter intern (istInterneEmail unveraendert, s. oben Zeile 11).
describe('istOperativerEmpfaenger — operative Betriebs-Inbox-Allowlist (Send-Pfad)', () => {
  it('erkennt info@ und schaden@ als operativ (case-insensitiv)', () => {
    expect(istOperativerEmpfaenger('info@claimondo.de')).toBe(true)
    expect(istOperativerEmpfaenger('schaden@claimondo.de')).toBe(true)
    expect(istOperativerEmpfaenger('INFO@Claimondo.de')).toBe(true)
  })
  it('Founder-Adressen sind NICHT operativ (Dual-Use als Test-Lead-Mail -> per-call-Flag)', () => {
    expect(istOperativerEmpfaenger('aaron.sprafke@claimondo.de')).toBe(false)
    expect(istOperativerEmpfaenger('aaron@claimondo.de')).toBe(false)
  })
  it('externe/leere Adressen sind nicht operativ', () => {
    expect(istOperativerEmpfaenger('kunde@gmail.com')).toBe(false)
    expect(istOperativerEmpfaenger(null)).toBe(false)
    expect(istOperativerEmpfaenger('')).toBe(false)
  })
})

describe('nurZustellbareEmpfaenger — extern ODER operative Inbox (Send-Isolation)', () => {
  it('behaelt operative Inboxen — im Gegensatz zum puren nurExterneEmpfaenger', () => {
    expect(nurZustellbareEmpfaenger('info@claimondo.de')).toEqual(['info@claimondo.de'])
    expect(nurZustellbareEmpfaenger('schaden@claimondo.de')).toEqual(['schaden@claimondo.de'])
    // Gegenprobe: der pure Klassifikator filtert dieselbe Adresse weiter raus (unveraendert)
    expect(nurExterneEmpfaenger('info@claimondo.de')).toEqual([])
  })
  it('filtert nicht-operative interne (Test-SV, Founder) weiter raus', () => {
    expect(nurZustellbareEmpfaenger('smoke-sv@claimondo.test')).toEqual([])
    expect(nurZustellbareEmpfaenger('aaron.sprafke@claimondo.de')).toEqual([])
  })
  it('behaelt externe + operative gemischt, droppt Test-SV', () => {
    expect(nurZustellbareEmpfaenger(['kunde@gmail.com', 'info@claimondo.de', 'smoke@claimondo.test']))
      .toEqual(['kunde@gmail.com', 'info@claimondo.de'])
  })
})

// Abnahme-Inbox (05.09.2026): das eine Postfach, das Test-Mails wirklich empfaengt (Regel-4-Mail-Nachweis).
// Identitaet bleibt intern (Matching-Guard), nur die Zustellung ist erlaubt.
describe('istAbnahmeInbox — Abnahme-Postfach (Send-Pfad)', () => {
  it('erkennt abnahme@ und Plus-Adressen abnahme+<tag>@ (case-insensitiv)', () => {
    expect(istAbnahmeInbox('abnahme@claimondo.de')).toBe(true)
    expect(istAbnahmeInbox('abnahme+e6-kasko-1725000000@claimondo.de')).toBe(true)
    expect(istAbnahmeInbox('Abnahme+Smoke@Claimondo.de')).toBe(true)
  })
  it('erkennt noreply@ und dessen Plus-Adressen (Aaron 05.09.: Alternative ohne neues Konto)', () => {
    expect(istAbnahmeInbox('noreply@claimondo.de')).toBe(true)
    expect(istAbnahmeInbox('noreply+e6-kasko@claimondo.de')).toBe(true)
    expect(istAbnahmeInbox('NoReply+Smoke@Claimondo.de')).toBe(true)
  })
  it('bleibt fuer die Lead-Identitaet intern (Matching-Guard unveraendert)', () => {
    expect(istInterneEmail('abnahme+e6@claimondo.de')).toBe(true)
  })
  it('kein anderes Postfach, keine andere Domain, kein Praefix-Treffer', () => {
    expect(istAbnahmeInbox('abnahme@gmail.com')).toBe(false)
    expect(istAbnahmeInbox('abnahmeleitung@claimondo.de')).toBe(false)
    expect(istAbnahmeInbox('noreply-alt@claimondo.de')).toBe(false)
    expect(istAbnahmeInbox('noreply@sub.claimondo.de')).toBe(false)
    expect(istAbnahmeInbox('info@claimondo.de')).toBe(false)
    expect(istAbnahmeInbox(null)).toBe(false)
    expect(istAbnahmeInbox('')).toBe(false)
  })
  it('nurZustellbareEmpfaenger behaelt die Abnahme-Inbox, filtert andere interne weiter weg', () => {
    expect(nurZustellbareEmpfaenger(['abnahme+e6@claimondo.de', 'aaron.sprafke@claimondo.de', 'kunde@gmail.com'])).toEqual([
      'abnahme+e6@claimondo.de',
      'kunde@gmail.com',
    ])
  })
})
