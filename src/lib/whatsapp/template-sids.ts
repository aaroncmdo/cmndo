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
  | 'eskalation_tag42'
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
  eskalation_tag42:       { envKey: 'TWILIO_TPL_ESKALATION_TAG42', variableCount: 2, beschreibung: 'T16: Eskalation 42 Tage (Vorname, Portal-Link)' },
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
