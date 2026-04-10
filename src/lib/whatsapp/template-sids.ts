// KFZ-181: Twilio WhatsApp Content Template SIDs.
// Jeder Eintrag mapped einen internen Template-Namen auf einen Twilio Content-SID.
// SIDs werden erst gesetzt wenn Aaron die Templates in der Twilio Console
// angelegt und genehmigt hat. Bis dahin: Legacy-Text-Fallback.
//
// Env-Var Format: TWILIO_TPL_<NAME>=HXxxxxxxxxxxxxx
// Aaron setzt die Werte in Vercel nachdem Twilio die Templates genehmigt hat.

export type TemplateName =
  | 'fall_eroeffnet'
  | 'flowlink_versand'
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

type TemplateConfig = {
  envKey: string
  variableCount: number
  beschreibung: string
}

export const TEMPLATE_CONFIGS: Record<TemplateName, TemplateConfig> = {
  fall_eroeffnet:         { envKey: 'TWILIO_TPL_FALL_EROEFFNET', variableCount: 2, beschreibung: 'Fall eroeffnet (Kunde-Vorname, Mandatsnr)' },
  flowlink_versand:       { envKey: 'TWILIO_TPL_FLOWLINK_VERSAND', variableCount: 2, beschreibung: 'Flow-Link an Kunde (Vorname, Link)' },
  sv_beauftragt:          { envKey: 'TWILIO_TPL_SV_BEAUFTRAGT', variableCount: 2, beschreibung: 'SV beauftragt (Kunde-Vorname, SV-Vorname)' },
  termin_bestaetigt:      { envKey: 'TWILIO_TPL_TERMIN_BESTAETIGT', variableCount: 3, beschreibung: 'Termin bestaetigt (Vorname, SV-Name, Datum+Uhrzeit)' },
  reminder_24h:           { envKey: 'TWILIO_TPL_REMINDER_24H', variableCount: 2, beschreibung: '24h Erinnerung (Vorname, Uhrzeit)' },
  reminder_2h:            { envKey: 'TWILIO_TPL_REMINDER_2H', variableCount: 2, beschreibung: '2h Erinnerung (Vorname, Uhrzeit)' },
  sv_tagesroute:          { envKey: 'TWILIO_TPL_SV_TAGESROUTE', variableCount: 2, beschreibung: 'SV auf dem Weg (Vorname, ETA)' },
  gutachten_fertig:       { envKey: 'TWILIO_TPL_GUTACHTEN_FERTIG', variableCount: 1, beschreibung: 'Gutachten fertig (Vorname)' },
  kanzlei_uebergabe:      { envKey: 'TWILIO_TPL_KANZLEI_UEBERGABE', variableCount: 1, beschreibung: 'An Kanzlei uebergeben (Vorname)' },
  as_gesendet:            { envKey: 'TWILIO_TPL_AS_GESENDET', variableCount: 1, beschreibung: 'Anschlussschreiben gesendet (Vorname)' },
  regulierung_angekuendigt: { envKey: 'TWILIO_TPL_REGULIERUNG_ANGEKUENDIGT', variableCount: 1, beschreibung: 'Regulierung angekuendigt (Vorname)' },
  zahlung_eingegangen:    { envKey: 'TWILIO_TPL_ZAHLUNG_EINGEGANGEN', variableCount: 2, beschreibung: 'Zahlung eingegangen (Vorname, Betrag)' },
  fall_abgeschlossen:     { envKey: 'TWILIO_TPL_FALL_ABGESCHLOSSEN', variableCount: 1, beschreibung: 'Fall abgeschlossen (Vorname)' },
  eskalation_tag14:       { envKey: 'TWILIO_TPL_ESKALATION_TAG14', variableCount: 1, beschreibung: 'VS Eskalation 14 Tage (Vorname)' },
  eskalation_tag28:       { envKey: 'TWILIO_TPL_ESKALATION_TAG28', variableCount: 1, beschreibung: 'VS Eskalation 28 Tage (Vorname)' },
  eskalation_tag42:       { envKey: 'TWILIO_TPL_ESKALATION_TAG42', variableCount: 1, beschreibung: 'VS Eskalation 42 Tage (Vorname)' },
  chat_fallback_kunde:    { envKey: 'TWILIO_TPL_CHAT_FALLBACK_KUNDE', variableCount: 1, beschreibung: 'Chat Fallback Kunde (Vorname)' },
  chat_fallback_kb:       { envKey: 'TWILIO_TPL_CHAT_FALLBACK_KB', variableCount: 1, beschreibung: 'Chat Fallback KB (Vorname)' },
  kuerzung_eingetragen:   { envKey: 'TWILIO_TPL_KUERZUNG_EINGETRAGEN', variableCount: 1, beschreibung: 'Kuerzung eingetragen (Vorname)' },
  sv_losgefahren:         { envKey: 'TWILIO_TPL_SV_LOSGEFAHREN', variableCount: 2, beschreibung: 'SV losgefahren (Vorname, ETA Minuten)' },
  sv_fast_da:             { envKey: 'TWILIO_TPL_SV_FAST_DA', variableCount: 2, beschreibung: 'SV fast da (Vorname, SV-Vorname)' },
  sv_angekommen:          { envKey: 'TWILIO_TPL_SV_ANGEKOMMEN', variableCount: 2, beschreibung: 'SV angekommen (Vorname, SV-Vorname)' },
  termin_storniert:       { envKey: 'TWILIO_TPL_TERMIN_STORNIERT', variableCount: 3, beschreibung: 'Termin storniert (Vorname, SV-Name, Datum)' },
  sv_verspaetet:          { envKey: 'TWILIO_TPL_SV_VERSPAETET', variableCount: 3, beschreibung: 'SV verspaetet sich (Vorname, SV-Name, Minuten)' },
  dokumente_nachreichen:  { envKey: 'TWILIO_TPL_DOKUMENTE_NACHREICHEN', variableCount: 3, beschreibung: 'Dokumente nachreichen (Vorname, Dok-Liste, Link)' },
  rechnung_verfuegbar:    { envKey: 'TWILIO_TPL_RECHNUNG_VERFUEGBAR', variableCount: 2, beschreibung: 'Rechnung verfuegbar (Vorname, Link)' },
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
