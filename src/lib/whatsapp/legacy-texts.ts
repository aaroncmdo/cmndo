import type { TemplateName } from './template-sids'

// KFZ-181: Legacy-Texte fuer WhatsApp-Templates.
// Werden genutzt wenn kein Twilio Content-SID gesetzt ist (Fallback).
// Die Texte entsprechen den deutschen Vorlagen die spaeter in Twilio
// als Content Templates angelegt werden.

const TEMPLATES: Record<TemplateName, (vars: Record<string, string>) => string> = {
  fall_eroeffnet: (v) =>
    `Hallo ${v['1'] ?? 'Kunde'}, Ihr Fall ${v['2'] ?? ''} wurde bei Claimondo eroeffnet. Wir kuemmern uns um alles Weitere. Bei Fragen antworten Sie einfach auf diese Nachricht.`,

  // AAR-312: Direkt nach SA — erklärt Zwei-Stufen-Zahlung + Sachverständiger kommt.
  // Variablen: 1=Vorname, 2=Portal-Link
  info_nach_sa: (v) =>
    `Noch ein kurzer Hinweis, ${v['1'] ?? ''}: Sie zahlen für die Schadenabwicklung NICHTS. Die gegnerische Versicherung übernimmt alle Kosten. Die Auszahlung erfolgt häufig in zwei Schritten (erste Teilzahlung schnell, Rest nach Abschluss). Der Gutachter kommt direkt zu Ihnen — Sie müssen nirgendwo hinfahren. Alle Updates in Ihrem Portal: ${v['2'] ?? ''}`,

  flowlink_versand: (v) =>
    // AAR-116: Template erwartet 6 Variablen (Vorname, SV-Vorname, SV-Nachname, Datum, Uhrzeit, FlowLink-URL)
    `Hallo ${v['1'] ?? ''}, Ihr Gutachtertermin mit ${v['2'] ?? ''} ${v['3'] ?? ''} am ${v['4'] ?? ''} um ${v['5'] ?? ''} Uhr steht. Bitte füllen Sie jetzt das Formular aus um Ihren Schadenfall zu vervollständigen: ${v['6'] ?? ''}`,

  sv_beauftragt: (v) =>
    `Gute Nachrichten, ${v['1'] ?? ''}! Wir haben den Gutachter ${v['2'] ?? ''} fuer Sie beauftragt. Er wird sich in Kuerze bei Ihnen melden um einen Besichtigungstermin zu vereinbaren.`,

  termin_bestaetigt: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihr Gutachtertermin mit ${v['2'] ?? ''} ist bestaetigt fuer ${v['3'] ?? ''}. Der Gutachter kommt direkt zu Ihnen. Bitte stellen Sie sicher, dass das Fahrzeug zugaenglich ist.`,

  reminder_24h: (v) =>
    `Erinnerung: Morgen um ${v['2'] ?? ''} Uhr kommt Ihr Gutachter. Bitte halten Sie Fahrzeugschein, Personalausweis und das Fahrzeug bereit, ${v['1'] ?? ''}.`,

  reminder_2h: (v) =>
    `${v['1'] ?? ''}, in ca. 2 Stunden ist Ihr Gutachtertermin. Der Gutachter ist auf dem Weg zu Ihnen.`,

  sv_tagesroute: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihr Gutachter hat seine Tagesroute gestartet und wird in ca. ${v['2'] ?? ''} Minuten bei Ihnen eintreffen.`,

  gutachten_fertig: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihr Gutachten ist fertiggestellt und wird jetzt an die Anwaltskanzlei uebergeben. Sie muessen nichts weiter tun.`,

  kanzlei_uebergabe: (v) =>
    `${v['1'] ?? ''}, Ihr Fall wurde an unsere Partnerkanzlei uebergeben. Die Kanzlei wird die Regulierung mit der gegnerischen Versicherung fuer Sie durchsetzen.`,

  as_gesendet: (v) =>
    `${v['1'] ?? ''}, das Anschlussschreiben an die Versicherung wurde versendet. Jetzt laeuft die regulaere Bearbeitungsfrist der Versicherung (4-6 Wochen).`,

  regulierung_angekuendigt: (v) =>
    `Tolle Neuigkeiten, ${v['1'] ?? ''}! Die Versicherung hat die Regulierung angekuendigt. Wir pruefen den Betrag und melden uns mit Details.`,

  zahlung_eingegangen: (v) =>
    `${v['1'] ?? ''}, eine Zahlung von ${v['2'] ?? ''} EUR ist fuer Ihren Fall eingegangen. Details finden Sie in Ihrem Kundenportal.`,

  fall_abgeschlossen: (v) =>
    `${v['1'] ?? ''}, Ihr Schadensfall ist erfolgreich abgeschlossen. Vielen Dank fuer Ihr Vertrauen in Claimondo! Wir wuerden uns ueber eine Google-Bewertung freuen.`,

  eskalation_tag14: (v) =>
    `${v['1'] ?? ''}, die Versicherung hat noch nicht auf unser Anschlussschreiben reagiert (14 Tage). Wir haben nachgehakt.`,

  eskalation_tag28: (v) =>
    `${v['1'] ?? ''}, nach 28 Tagen ohne Antwort der Versicherung haben wir eine foermliche Fristsetzung gesendet.`,


  chat_fallback_kunde: (v) =>
    `Hallo ${v['1'] ?? ''}, Sie haben eine neue Nachricht in Ihrem Claimondo-Portal. Bitte pruefen Sie Ihr Postfach.`,

  chat_fallback_kb: (v) =>
    `Neue Kundennachricht fuer Fall von ${v['1'] ?? ''}. Bitte im Portal antworten.`,

  kuerzung_eingetragen: (v) =>
    `${v['1'] ?? ''}, die Versicherung hat eine Kuerzung vorgenommen. Unser Team prueft ob wir dagegen vorgehen. Details im Kundenportal.`,

  sv_losgefahren: (v) =>
    `${v['1'] ?? ''}, Ihr Gutachter ist losgefahren und wird in ca. ${v['2'] ?? ''} Minuten bei Ihnen eintreffen.`,

  sv_fast_da: (v) =>
    `${v['1'] ?? ''}, Ihr Gutachter ${v['2'] ?? ''} ist fast bei Ihnen. Bitte halten Sie das Fahrzeug bereit.`,

  sv_angekommen: (v) =>
    `${v['1'] ?? ''}, Ihr Gutachter ${v['2'] ?? ''} ist angekommen. Die Besichtigung beginnt jetzt.`,

  // ─── Neue Templates 24-27 (KFZ-181) ─────────────────────────────

  termin_storniert: (v) =>
    `Hallo ${v['1'] ?? ''}, leider muss der Gutachtertermin mit ${v['2'] ?? ''} am ${v['3'] ?? ''} storniert werden. Wir melden uns kurzfristig mit einem Ersatztermin.`,

  sv_verspaetet: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihr Gutachter ${v['2'] ?? ''} verspaetet sich um ca. ${v['3'] ?? ''} Minuten. Wir bitten um Verstaendnis.`,

  dokumente_nachreichen: (v) =>
    `Hallo ${v['1'] ?? ''}, fuer Ihren Schadensfall fehlen noch folgende Dokumente: ${v['2'] ?? ''}. Bitte laden Sie diese hier hoch: ${v['3'] ?? ''}`,

  rechnung_verfuegbar: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihre Rechnung steht zum Download bereit: ${v['2'] ?? ''}`,

  // ─── KFZ-193: KB-Beratungstermin Templates ───────────────────────────────

  kb_termin_bestaetigt: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihr Beratungstermin am ${v['2'] ?? ''} um ${v['3'] ?? ''} Uhr (${v['4'] === 'video' ? 'Video-Call' : 'Telefon'}) ist bestätigt.${v['5'] ? ` Video-Link: ${v['5']}` : ''} Ihr Claimondo-Team`,

  kb_termin_reminder_24h: (v) =>
    `Erinnerung: ${v['1'] ?? ''}, morgen ${v['2'] ?? ''} um ${v['3'] ?? ''} Uhr haben Sie einen Beratungstermin mit Ihrem Claimondo-Betreuer (${v['4'] === 'video' ? 'Video-Call' : 'Telefon'}).`,

  kb_termin_reminder_1h: (v) =>
    `${v['1'] ?? ''}, in ca. 1 Stunde (${v['2'] ?? ''} Uhr) ${v['3'] ? `startet Ihr Video-Gespräch. Link: ${v['3']}` : 'ruft Ihr Claimondo-Betreuer Sie an. Bitte halten Sie Ihr Telefon bereit.'}`,

  // KFZ-202: No-Show
  no_show_kunde: (v) =>
    `Hallo ${v['1'] ?? ''}, wir haben Sie leider beim vereinbarten Gutachtertermin nicht angetroffen. Bitte melden Sie sich, damit wir einen neuen Termin fuer Sie vereinbaren koennen.`,

  // KFZ-207: Eskalation Tag 21
  eskalation_tag21: (v) =>
    `Hallo ${v['1'] ?? ''}, wir verfolgen Ihren Fall aktiv. Wir haben die Versicherung heute erneut kontaktiert und erwarten zeitnah eine Antwort. Portal: ${v['2'] ?? ''}`,

  // KFZ-210: Nachbesichtigung
  nachbesichtigung_angefordert: (v) =>
    `Hallo ${v['1'] ?? ''}, die Versicherung hat eine erneute Besichtigung Ihres Fahrzeugs angefordert. Bitte waehlen Sie einen Termin in Ihrem Portal: ${v['2'] ?? ''}`,
  nachbesichtigung_termin: (v) =>
    `Hallo ${v['1'] ?? ''}, Ihr Nachbesichtigungstermin ist bestaetigt fuer ${v['2'] ?? ''}. Bitte stellen Sie Ihr Fahrzeug bereit. Details: ${v['3'] ?? ''}`,
  nachbesichtigung_abgeschlossen: (v) =>
    `Hallo ${v['1'] ?? ''}, die Nachbesichtigung Ihres Fahrzeugs ist abgeschlossen. Wir informieren Sie sobald das Ergebnis vorliegt. Portal: ${v['2'] ?? ''}`,

  // AAR-352: Multi-Slot-Upload-Anfrage — 1=Vorname, 2=Upload-Link
  dokumente_upload_anfrage: (v) =>
    `Hallo ${v['1'] ?? ''}, bitte laden Sie die angefragten Dokumente über folgenden Link hoch: ${v['2'] ?? ''} (Link gültig 7 Tage). Claimondo`,

}
// KFZ-200 → KFZ-201: SV-Navigation Templates (sv_nav_unterwegs, sv_nav_15min,
// sv_nav_5min, sv_nav_angekommen, sv_begutachtung_fertig) wurden konsolidiert:
//   sv_nav_unterwegs    → sv_losgefahren (T21)
//   sv_nav_15min        → sv_fast_da (T22)
//   sv_nav_5min         → sv_angekommen (T23)
//   sv_nav_angekommen   → sv_angekommen (T23)
//   sv_begutachtung_fertig → gutachten_fertig (T8)

/**
 * Returnt den Legacy-Text fuer einen Template-Namen mit Variablen-Substitution.
 * Null wenn kein Legacy-Text existiert.
 */
export function getLegacyTemplateText(
  templateName: TemplateName,
  variables: Record<string, string>,
): string | null {
  const fn = TEMPLATES[templateName]
  if (!fn) return null
  return fn(variables)
}
