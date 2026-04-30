// KFZ-181: Twilio WhatsApp Content Template SIDs.
// Jeder Eintrag mapped einen internen Template-Namen auf einen Twilio Content-SID.
// SIDs werden erst gesetzt wenn Aaron die Templates in der Twilio Console
// angelegt und genehmigt hat. Bis dahin: Legacy-Text-Fallback.
//
// Env-Var Format: TWILIO_TPL_<NAME>=HXxxxxxxxxxxxxx
// Aaron setzt die Werte in Vercel nachdem Twilio die Templates genehmigt hat.

export type TemplateName =
  | 'flowlink_versand'
  | 'fall_eroeffnet'
  // AAR-312: Info-Nachricht direkt nach SA-Unterschrift — Erklärung Zwei-Stufen-Zahlung
  | 'info_nach_sa'
  | 'sv_beauftragt'
  | 'termin_bestaetigt'
  | 'reminder_24h'
  | 'reminder_2h'
  | 'sv_tagesroute'
  | 'gutachten_fertig'
  | 'kanzlei_uebergabe'
  | 'as_gesendet'
  | 'regulierung_angekuendigt'
  | 'zahlung_eingegangen'
  | 'fall_abgeschlossen'
  | 'eskalation_tag14'
  | 'eskalation_tag28'
  | 'chat_fallback_kunde'
  | 'chat_fallback_kb'
  | 'kuerzung_eingetragen'
  | 'sv_losgefahren'
  | 'sv_fast_da'
  | 'sv_angekommen'
  | 'termin_storniert'
  | 'sv_verspaetet'
  | 'dokumente_nachreichen'
  | 'rechnung_verfuegbar'
  | 'kb_termin_bestaetigt'
  | 'kb_termin_reminder_24h'
  | 'kb_termin_reminder_1h'
  | 'no_show_kunde'
  | 'eskalation_tag21'
  | 'nachbesichtigung_angefordert'
  | 'nachbesichtigung_termin'
  | 'nachbesichtigung_abgeschlossen'
  // AAR-352: Multi-Slot-Upload-Anfrage (Vorname + Upload-Link)
  | 'dokumente_upload_anfrage'
  // AAR-559 (C10): SV erhält Auftrag zur Technischen Stellungnahme
  | 'stellungnahme_beauftragt'
  // AAR-561 (C12): SV erhält Anfrage für Konfrontations-Termin bei Nachbesichtigung
  | 'sv_konfrontation_anfrage'
  // AAR-561 (C12): Kunde wird informiert dass SV seinen Konfrontations-Termin bestätigt hat
  | 'sv_konfrontation_bestaetigt_kunde'
  // AAR-864: Termin-Verlegung — vier neue Templates (T31-T34)
  | 'termin_verlegung_request'
  | 'termin_verlegung_bestaetigt'
  | 'termin_verlegung_abgelehnt'
  | 'termin_verlegung_eskalation'
  // KFZ-200 → KFZ-201: SV-Navigation Templates konsolidiert zu T21-T25:
  //   sv_nav_unterwegs    → sv_losgefahren (T21)
  //   sv_nav_15min        → sv_fast_da (T22)
  //   sv_nav_5min         → sv_angekommen (T23)
  //   sv_nav_angekommen   → consolidated into sv_angekommen (T23)
  //   sv_begutachtung_fertig → gutachten_fertig (T8) for Begutachtung-done notification

type TemplateConfig = {
  envKey: string
  variableCount: number
  beschreibung: string
}

// Variable-Counts abgeglichen mit Notion-Page 33e1da4c-9124-817b (10.04.2026)
export const TEMPLATE_CONFIGS: Record<TemplateName, TemplateConfig> = {
  flowlink_versand:       { envKey: 'TWILIO_TPL_FLOWLINK_VERSAND', variableCount: 6, beschreibung: 'T1: FlowLink-Versand (Vorname, SV-Vorname, SV-Nachname, Datum, Uhrzeit, FlowLink-URL)' },
  fall_eroeffnet:         { envKey: 'TWILIO_TPL_FALL_EROEFFNET', variableCount: 2, beschreibung: 'T2: Fall eroeffnet (Vorname, Portal-Link)' },
  // AAR-312: Direkt nach SA-Unterschrift — Erklärung "Sie zahlen nichts, Zahlung
  // läuft oft in 2 Schritten, Gutachter kommt zu Ihnen". Variablen: Vorname, Portal-Link
  info_nach_sa:           { envKey: 'TWILIO_TPL_INFO_NACH_SA', variableCount: 2, beschreibung: 'T2b: Info nach SA — Zwei-Stufen-Zahlung-Erklaerung (Vorname, Portal-Link)' },
  sv_beauftragt:          { envKey: 'TWILIO_TPL_SV_BEAUFTRAGT', variableCount: 3, beschreibung: 'T3: SV beauftragt (Vorname, SV-Vorname, Portal-Link)' },
  termin_bestaetigt:      { envKey: 'TWILIO_TPL_TERMIN_BESTAETIGT', variableCount: 6, beschreibung: 'T4: Termin bestaetigt (Vorname, Datum, Uhrzeit, SV-Vorname, Adresse, Portal-Link)' },
  reminder_24h:           { envKey: 'TWILIO_TPL_REMINDER_24H', variableCount: 4, beschreibung: 'T5: 24h Erinnerung (Vorname, SV-Vorname, Uhrzeit, Portal-Link)' },
  reminder_2h:            { envKey: 'TWILIO_TPL_REMINDER_2H', variableCount: 3, beschreibung: 'T6: 2h Erinnerung (Vorname, SV-Vorname, Portal-Link)' },
  sv_tagesroute:          { envKey: 'TWILIO_TPL_SV_TAGESROUTE', variableCount: 4, beschreibung: 'T7: SV Tagesroute (SV-Vorname, Anzahl-Termine, Erster-Uhrzeit, Heute-Link)' },
  gutachten_fertig:       { envKey: 'TWILIO_TPL_GUTACHTEN_FERTIG', variableCount: 3, beschreibung: 'T8: Gutachten fertig (Vorname, Betrag, Portal-Link)' },
  kanzlei_uebergabe:      { envKey: 'TWILIO_TPL_KANZLEI_UEBERGABE', variableCount: 2, beschreibung: 'T9: Kanzlei-Uebergabe (Vorname, Portal-Link)' },
  as_gesendet:            { envKey: 'TWILIO_TPL_AS_GESENDET', variableCount: 2, beschreibung: 'T10: AS gesendet (Vorname, Portal-Link)' },
  regulierung_angekuendigt: { envKey: 'TWILIO_TPL_REGULIERUNG_ANGEKUENDIGT', variableCount: 2, beschreibung: 'T11: Regulierung angekuendigt (Vorname, Portal-Link)' },
  zahlung_eingegangen:    { envKey: 'TWILIO_TPL_ZAHLUNG_EINGEGANGEN', variableCount: 3, beschreibung: 'T12: Zahlung eingegangen (Vorname, Betrag, Portal-Link)' },
  fall_abgeschlossen:     { envKey: 'TWILIO_TPL_FALL_ABGESCHLOSSEN', variableCount: 2, beschreibung: 'T13: Fall abgeschlossen (Vorname, Google-Review-Link)' },
  eskalation_tag14:       { envKey: 'TWILIO_TPL_ESKALATION_TAG14', variableCount: 2, beschreibung: 'T14: Eskalation 14 Tage (Vorname, Portal-Link)' },
  eskalation_tag28:       { envKey: 'TWILIO_TPL_ESKALATION_TAG28', variableCount: 2, beschreibung: 'T15: Eskalation 28 Tage (Vorname, Portal-Link)' },
  chat_fallback_kunde:    { envKey: 'TWILIO_TPL_CHAT_FALLBACK_KUNDE', variableCount: 3, beschreibung: 'T17: Chat Fallback Kunde (Vorname, Nachricht-Preview, Portal-Link)' },
  chat_fallback_kb:       { envKey: 'TWILIO_TPL_CHAT_FALLBACK_KB', variableCount: 3, beschreibung: 'T18: Chat Fallback KB (KB-Vorname, Kunden-Name, Nachricht-Preview)' },
  kuerzung_eingetragen:   { envKey: 'TWILIO_TPL_KUERZUNG_EINGETRAGEN', variableCount: 4, beschreibung: 'T19: Kuerzung eingetragen (Vorname, Kuerzungs-Betrag, Original-Betrag, Portal-Link)' },
  sv_losgefahren:         { envKey: 'TWILIO_TPL_SV_LOSGEFAHREN', variableCount: 5, beschreibung: 'T21: SV losgefahren (Vorname, SV-Vorname, ETA-Min, Adresse, Tracking-Link)' },
  sv_fast_da:             { envKey: 'TWILIO_TPL_SV_FAST_DA', variableCount: 2, beschreibung: 'T22: SV fast da (Vorname, SV-Vorname)' },
  sv_angekommen:          { envKey: 'TWILIO_TPL_SV_ANGEKOMMEN', variableCount: 2, beschreibung: 'T23: SV angekommen (Vorname, SV-Vorname)' },
  termin_storniert:       { envKey: 'TWILIO_TPL_TERMIN_STORNIERT', variableCount: 4, beschreibung: 'T24: Termin storniert (Vorname, SV-Vorname, Datum, Portal-Link)' },
  sv_verspaetet:          { envKey: 'TWILIO_TPL_SV_VERSPAETET', variableCount: 4, beschreibung: 'T25: SV verspaetet (Vorname, SV-Vorname, Minuten, Portal-Link)' },
  dokumente_nachreichen:  { envKey: 'TWILIO_TPL_DOKUMENTE_NACHREICHEN', variableCount: 3, beschreibung: 'T26: Dokumente nachreichen (Vorname, Dok-Liste, Portal-Link)' },
  rechnung_verfuegbar:    { envKey: 'TWILIO_TPL_RECHNUNG_VERFUEGBAR', variableCount: 2, beschreibung: 'T27: Rechnung verfuegbar (Vorname, Portal-Link)' },
  kb_termin_bestaetigt:   { envKey: 'TWILIO_TPL_KB_TERMIN_BESTAETIGT', variableCount: 6, beschreibung: 'T28: KB-Termin bestaetigt (Vorname, Datum, Uhrzeit, Kanal, Video-Link, Portal-Link)' },
  kb_termin_reminder_24h: { envKey: 'TWILIO_TPL_KB_TERMIN_REMINDER_24H', variableCount: 4, beschreibung: 'T29: KB-Termin 24h-Erinnerung (Vorname, Datum, Uhrzeit, Kanal)' },
  kb_termin_reminder_1h:  { envKey: 'TWILIO_TPL_KB_TERMIN_REMINDER_1H', variableCount: 3, beschreibung: 'T30: KB-Termin 1h-Erinnerung (Vorname, Uhrzeit, Video-Link-oder-leer)' },
  no_show_kunde:          { envKey: 'TWILIO_TPL_NO_SHOW_KUNDE', variableCount: 2, beschreibung: 'No-Show: Kunde nicht erschienen (Vorname, Portal-Link)' },
  eskalation_tag21:       { envKey: 'TWILIO_TPL_ESKALATION_TAG21', variableCount: 2, beschreibung: 'Eskalation 21 Tage — Direktanfrage (Vorname, Portal-Link)' },
  nachbesichtigung_angefordert: { envKey: 'TWILIO_TPL_NACHBESICHTIGUNG_ANGEFORDERT', variableCount: 2, beschreibung: 'Nachbesichtigung angefordert (Vorname, Portal-Link)' },
  nachbesichtigung_termin:      { envKey: 'TWILIO_TPL_NACHBESICHTIGUNG_TERMIN', variableCount: 3, beschreibung: 'Nachbesichtigung Termin (Vorname, Datum, Portal-Link)' },
  nachbesichtigung_abgeschlossen: { envKey: 'TWILIO_TPL_NACHBESICHTIGUNG_ABGESCHLOSSEN', variableCount: 2, beschreibung: 'Nachbesichtigung abgeschlossen (Vorname, Portal-Link)' },
  // AAR-352: Multi-Slot-Upload-Anfrage — Vorname + Upload-Link
  dokumente_upload_anfrage:     { envKey: 'TWILIO_TPL_DOKUMENTE_UPLOAD_ANFRAGE', variableCount: 2, beschreibung: 'AAR-352: Multi-Slot-Upload-Anfrage (Vorname, Upload-Link)' },
  // AAR-559 (C10): SV-WA für Stellungnahme-Auftrag — SV-Vorname, Fall-Nummer, Kürzungs-Grund-Kurzform, Portal-Link
  stellungnahme_beauftragt:     { envKey: 'TWILIO_TPL_STELLUNGNAHME_BEAUFTRAGT', variableCount: 4, beschreibung: 'AAR-559 (C10): SV-WA Stellungnahme-Auftrag (SV-Vorname, Fall-Nr, Grund-Kurzform, Portal-Link)' },
  // AAR-561 (C12): SV-WA für Konfrontations-Termin-Anfrage — SV-Vorname, Fall-Nummer, Termin-Datum+Uhrzeit, Portal-Link
  sv_konfrontation_anfrage:     { envKey: 'TWILIO_TPL_SV_KONFRONTATION_ANFRAGE', variableCount: 4, beschreibung: 'AAR-561 (C12): SV-WA Konfrontations-Termin-Anfrage (SV-Vorname, Fall-Nr, Termin, Portal-Link)' },
  // AAR-561 (C12): Kunde-WA — SV hat Konfrontations-Termin bestätigt — Kunden-Vorname, SV-Vorname, Termin-Datum+Uhrzeit, Portal-Link
  sv_konfrontation_bestaetigt_kunde: { envKey: 'TWILIO_TPL_SV_KONFRONTATION_BESTAETIGT_KUNDE', variableCount: 4, beschreibung: 'AAR-561 (C12): Kunde-WA SV-Konfrontations-Zusage (Kunden-Vorname, SV-Vorname, Termin, Portal-Link)' },
  // AAR-864: Termin-Verlegung
  termin_verlegung_request:     { envKey: 'TWILIO_TPL_TERMIN_VERLEGUNG_REQUEST',     variableCount: 7, beschreibung: 'T31: SV bittet um Verlegung (Vorname, alterDatum, alterUhrzeit, neuesDatum, neuesUhrzeit, SV-Vorname, Portal-Link)' },
  termin_verlegung_bestaetigt:  { envKey: 'TWILIO_TPL_TERMIN_VERLEGUNG_BESTAETIGT',  variableCount: 4, beschreibung: 'T32: SV-WA Verlegung bestätigt (SV-Vorname, neuesDatum, neuesUhrzeit, Kunden-Vorname)' },
  termin_verlegung_abgelehnt:   { envKey: 'TWILIO_TPL_TERMIN_VERLEGUNG_ABGELEHNT',   variableCount: 3, beschreibung: 'T33: SV-WA Verlegung abgelehnt (SV-Vorname, Kunden-Vorname, Grund/leer)' },
  termin_verlegung_eskalation:  { envKey: 'TWILIO_TPL_TERMIN_VERLEGUNG_ESKALATION',  variableCount: 4, beschreibung: 'T34: KB-Eskalation 48h vor altem Termin (Vorname, alterDatum, alterUhrzeit, Portal-Link)' },
}

/**
 * Liest den Twilio Content-SID aus der Env-Var. Returnt null wenn nicht gesetzt.
 */
export function getTemplateSid(name: TemplateName): string | null {
  const cfg = TEMPLATE_CONFIGS[name]
  if (!cfg) return null
  const sid = process.env[cfg.envKey]
  return sid && sid.startsWith('HX') ? sid : null
}
