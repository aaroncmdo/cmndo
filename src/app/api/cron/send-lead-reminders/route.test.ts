import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Regression-Guard: Nurture/Timeout-Asymmetrie-Fix (#3489) + 4. Reminder (Follow-up 1)
// + Kaskaden-Gate (17.07.2026). Die Kaskade erreicht alle kundengetriebenen Akquise-
// Channels; der channel-agnostische 10-Tage-Timeout disqualifiziert dahinter. Das Gate
// verhindert den Alt-Lead-Burst: ein nie genurtureter Bestands-Lead (>168h) matcht sonst
// ALLE vier Kohorten im selben Cron-Tick -> bis zu 4 Mails auf einmal.
const src = () => readFileSync('src/app/api/cron/send-lead-reminders/route.ts', 'utf8')

describe('send-lead-reminders — Nurture/Timeout + 4. Reminder', () => {
  it('nurtured NICHT nur self_service (Asymmetrie gefixt)', () => {
    expect(src()).not.toContain(".eq('source_channel', 'self_service')")
  })

  it('schliesst von der Nurture nur makler/manuell aus', () => {
    expect(src()).toContain(".not('source_channel', 'in', '(makler-anfrage,manuell)')")
  })

  it('der Timeout bleibt intakt (mark_expired_leads)', () => {
    expect(src()).toContain('mark_expired_leads')
  })

  it('hat eine 4. Reminder-Kohorte (reminder_4_sent_at + cohort4, 168h/Tag 7)', () => {
    expect(src()).toContain('reminder_4_sent_at')
    expect(src()).toContain('cohort4')
    expect(src()).toContain('168 * 60 * 60 * 1000')
  })

  // 31.08.2026: die Kaskade erreichte /check, oeffentlichen Rueckruf und mcp NIE —
  // beide Filter unten schlossen sie aus. Ein echter Kunde lief so ins Leere.
  it('nurtured auch Leads OHNE E-Mail (Telefon reicht)', () => {
    expect(src()).not.toContain(".not('email', 'is', null)")
    expect(src()).toContain(".or('email.not.is.null,telefon.not.is.null')")
  })

  it('schliesst flow-gesendet NICHT aus (erfolgreicher Versand != erledigt)', () => {
    // Bewusst nur auf ANWESENHEIT geprueft. Eine Abwesenheits-Assertion auf
    // `.eq('status','neu')` waere falsch: der Timeout-Block (mark_expired_leads,
    // weiter unten) filtert weiterhin korrekt auf 'neu' und darf das auch.
    // Erster Versuch hing zudem an einem `\n` im Suchstring — auf Windows (CRLF)
    // gruen, in der CI (LF) rot. Zeilenenden gehoeren nicht in eine Assertion.
    expect(src()).toContain(".in('status', ['neu', 'flow-gesendet'])")
  })

  it('WhatsApp nur auf Stufe 2+3 — vier WA-Nachrichten/Woche waeren Belaestigung', () => {
    expect(src()).toContain('WHATSAPP_STUFEN')
    expect(src()).toContain('new Set([2, 3])')
  })

  it('markiert Nicht-WhatsApp-Stufen still, statt sie zu ueberspringen', () => {
    // Sonst reisst die Kaskade: Stufe N verlangt reminder_(N-1)_sent_at IS NOT NULL.
    expect(src()).toContain('if (!WHATSAPP_STUFEN.has(step)) return null')
    expect(src()).toContain('stillMarkiert')
  })
})

describe('send-lead-reminders — Kaskaden-Gate (17.07.2026)', () => {
  it('Stufe N laedt Kandidaten nur mit gesendeter Stufe N-1 (kein Multi-Mail-Burst im selben Tick)', () => {
    expect(src()).toContain("'reminder_2_sent_at', 'reminder_1_sent_at'")
    expect(src()).toContain("'reminder_3_sent_at', 'reminder_2_sent_at'")
    expect(src()).toContain("'reminder_4_sent_at', 'reminder_3_sent_at'")
  })

  it('Mindestabstand zwischen zwei Stufen existiert (Alt-Lead-Drossel statt Stufen-Treppe im Stundentakt)', () => {
    expect(src()).toContain('MIN_STUFEN_ABSTAND_MS')
  })
})

describe('send-lead-reminders — Doppelsend-Guard (20.09.2026)', () => {
  // Auf prod GEMESSEN: zwei Lead-Zeilen derselben Person (beide source_channel=mcp, 15 Minuten
  // auseinander angelegt) erzeugten im selben Lauf zwei identische WhatsApps an dieselbe Nummer
  // (18:45:03.976 + 18:45:04.424, 0,45 s Abstand). Die Stufen-Marker haengen an der LEAD-Zeile
  // und koennen das grundsaetzlich nicht verhindern — der Guard muss am EMPFAENGER sitzen.
  it('dedupliziert pro Lauf auf Empfaenger-Ebene, nicht auf Lead-Ebene', () => {
    expect(src()).toContain('const bereitsErinnert = new Set<string>()')
    expect(src()).toContain('bereitsErinnert.has(empfaengerKey)')
    expect(src()).toContain('bereitsErinnert.add(empfaengerKey)')
  })

  it('trennt die Kanaele (Telefon-Suffix bzw. E-Mail) statt sie zu vermischen', () => {
    expect(src()).toContain(".replace(/[^0-9]/g, '').slice(-9)")
    expect(src()).toContain("(perWhatsApp ? 'wa:' : 'mail:') + rohKey")
  })

  it('setzt den Stufen-Marker trotzdem — sonst feuert die Stufe im naechsten Lauf nach', () => {
    // schonErinnert -> ok === null -> processStep nimmt den Markier-Pfad, NICHT den
    // failed-Pfad (der kehrte ohne Marker zurueck und wuerde beim naechsten Tick erneut senden).
    expect(src()).toContain('const ok = schonErinnert')
    expect(src()).toContain('doppelsend_unterdrueckt')
  })

  it('verbraucht den Platz nur bei einem echten Sendeversuch', () => {
    // Eine still markierte Stufe (Nicht-WhatsApp-Stufe, Konversations-Guard) hat niemanden
    // erreicht — sie darf die eine echte Erinnerung des Empfaengers nicht verdraengen.
    expect(src()).toContain("} else if (ok !== null && empfaengerKey !== '') {")
  })
})
