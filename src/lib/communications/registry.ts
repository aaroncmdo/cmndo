// KFZ-201: Central Communications Registry
// Maps trigger names to their communication configuration.
// Template names reference keys from src/lib/whatsapp/template-sids.ts.

import type { TriggerConfig } from './types'

export const COMMUNICATION_REGISTRY: Record<string, TriggerConfig> = {
  // ─── WhatsApp: Kunde ──────────────────────────────────────────────────────

  flowlink_versand: {
    trigger_name: 'flowlink_versand',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 1,
    whatsapp_template_name: 'flowlink_versand',
    has_attachment: false,
    description: 'T1: FlowLink an Kunden versenden',
  },

  fall_eroeffnet: {
    trigger_name: 'fall_eroeffnet',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 2,
    whatsapp_template_name: 'fall_eroeffnet',
    has_attachment: false,
    description: 'T2: Fall wurde eroeffnet — Willkommensnachricht',
  },

  termin_bestaetigt: {
    trigger_name: 'termin_bestaetigt',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 4,
    whatsapp_template_name: 'termin_bestaetigt',
    has_attachment: false,
    description: 'T4: Gutachtertermin bestaetigt',
  },

  reminder_24h: {
    trigger_name: 'reminder_24h',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 5,
    whatsapp_template_name: 'reminder_24h',
    has_attachment: false,
    description: 'T5: 24h-Erinnerung an Kunden',
  },

  reminder_2h: {
    trigger_name: 'reminder_2h',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 6,
    whatsapp_template_name: 'reminder_2h',
    has_attachment: false,
    description: 'T6: 2h-Erinnerung an Kunden',
  },

  gutachten_fertig: {
    trigger_name: 'gutachten_fertig',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 8,
    whatsapp_template_name: 'gutachten_fertig',
    has_attachment: false,
    description: 'T8: Gutachten fertiggestellt',
  },

  kanzlei_uebergabe: {
    trigger_name: 'kanzlei_uebergabe',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 9,
    whatsapp_template_name: 'kanzlei_uebergabe',
    has_attachment: false,
    description: 'T9: Fall an Kanzlei uebergeben',
  },

  as_gesendet: {
    trigger_name: 'as_gesendet',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 10,
    whatsapp_template_name: 'as_gesendet',
    has_attachment: false,
    description: 'T10: Anspruchsschreiben an Versicherung gesendet',
  },

  regulierung_angekuendigt: {
    trigger_name: 'regulierung_angekuendigt',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 11,
    whatsapp_template_name: 'regulierung_angekuendigt',
    has_attachment: false,
    description: 'T11: Versicherung hat Regulierung angekuendigt',
  },

  zahlung_eingegangen: {
    trigger_name: 'zahlung_eingegangen',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 12,
    whatsapp_template_name: 'zahlung_eingegangen',
    has_attachment: false,
    description: 'T12: Zahlung eingegangen',
  },

  fall_abgeschlossen: {
    trigger_name: 'fall_abgeschlossen',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 13,
    whatsapp_template_name: 'fall_abgeschlossen',
    has_attachment: false,
    description: 'T13: Fall erfolgreich abgeschlossen',
  },

  eskalation_tag14: {
    trigger_name: 'eskalation_tag14',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 14,
    whatsapp_template_name: 'eskalation_tag14',
    has_attachment: false,
    description: 'T14: Eskalation nach 14 Tagen ohne Versicherungsantwort',
  },

  eskalation_tag28: {
    trigger_name: 'eskalation_tag28',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 15,
    whatsapp_template_name: 'eskalation_tag28',
    has_attachment: false,
    description: 'T15: Eskalation nach 28 Tagen ohne Versicherungsantwort',
  },

  eskalation_tag42: {
    trigger_name: 'eskalation_tag42',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 16,
    whatsapp_template_name: 'eskalation_tag42',
    has_attachment: false,
    description: 'T16: Eskalation nach 42 Tagen — rechtliche Schritte',
  },

  chat_fallback_kunde: {
    trigger_name: 'chat_fallback_kunde',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 17,
    whatsapp_template_name: 'chat_fallback_kunde',
    has_attachment: false,
    description: 'T17: Chat-Fallback: neue Nachricht im Portal (an Kunde)',
  },

  kuerzung_eingetragen: {
    trigger_name: 'kuerzung_eingetragen',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 19,
    whatsapp_template_name: 'kuerzung_eingetragen',
    has_attachment: false,
    description: 'T19: Versicherungskuerzung eingetragen',
  },

  // ─── WhatsApp: Kunde — SV-Navigation (T21-T25) ───────────────────────────

  sv_losgefahren: {
    trigger_name: 'sv_losgefahren',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 21,
    whatsapp_template_name: 'sv_losgefahren',
    has_attachment: false,
    description: 'T21: SV ist losgefahren (ETA, Tracking)',
  },

  sv_fast_da: {
    trigger_name: 'sv_fast_da',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 22,
    whatsapp_template_name: 'sv_fast_da',
    has_attachment: false,
    description: 'T22: SV ist fast beim Kunden',
  },

  sv_angekommen: {
    trigger_name: 'sv_angekommen',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 23,
    whatsapp_template_name: 'sv_angekommen',
    has_attachment: false,
    description: 'T23: SV ist angekommen',
  },

  termin_storniert: {
    trigger_name: 'termin_storniert',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 24,
    whatsapp_template_name: 'termin_storniert',
    has_attachment: false,
    description: 'T24: Gutachtertermin storniert',
  },

  sv_verspaetet: {
    trigger_name: 'sv_verspaetet',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 25,
    whatsapp_template_name: 'sv_verspaetet',
    has_attachment: false,
    description: 'T25: SV verspaetet sich',
  },

  dokumente_nachreichen: {
    trigger_name: 'dokumente_nachreichen',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 26,
    whatsapp_template_name: 'dokumente_nachreichen',
    has_attachment: false,
    description: 'T26: Dokumente fehlen und muessen nachgereicht werden',
  },

  rechnung_verfuegbar: {
    trigger_name: 'rechnung_verfuegbar',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 27,
    whatsapp_template_name: 'rechnung_verfuegbar',
    has_attachment: false,
    description: 'T27: Rechnung steht zum Download bereit',
  },

  kb_termin_bestaetigt: {
    trigger_name: 'kb_termin_bestaetigt',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 28,
    whatsapp_template_name: 'kb_termin_bestaetigt',
    has_attachment: false,
    description: 'T28: KB-Beratungstermin bestaetigt',
  },

  kb_termin_reminder_24h: {
    trigger_name: 'kb_termin_reminder_24h',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 29,
    whatsapp_template_name: 'kb_termin_reminder_24h',
    has_attachment: false,
    description: 'T29: 24h-Erinnerung KB-Beratungstermin',
  },

  kb_termin_reminder_1h: {
    trigger_name: 'kb_termin_reminder_1h',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: 30,
    whatsapp_template_name: 'kb_termin_reminder_1h',
    has_attachment: false,
    description: 'T30: 1h-Erinnerung KB-Beratungstermin',
  },

  no_show_kunde: {
    trigger_name: 'no_show_kunde',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: null,
    whatsapp_template_name: 'no_show_kunde',
    has_attachment: false,
    description: 'Kunde ist nicht zum Gutachtertermin erschienen — Kontaktaufnahme',
  },

  nachbesserung_gutachten: {
    trigger_name: 'nachbesserung_gutachten',
    channel: 'whatsapp',
    recipient: 'kunde',
    t_number: null,
    whatsapp_template_name: 'gutachten_fertig',
    has_attachment: false,
    description: 'Gutachten-Nachbesserung — Kunde wird informiert',
  },

  // ─── WhatsApp: SV ────────────────────────────────────────────────────────

  sv_tagesroute: {
    trigger_name: 'sv_tagesroute',
    channel: 'whatsapp',
    recipient: 'sv',
    t_number: 7,
    whatsapp_template_name: 'sv_tagesroute',
    has_attachment: false,
    description: 'T7: Tagesroute an SV',
  },

  // ─── WhatsApp: KB ────────────────────────────────────────────────────────

  chat_fallback_kb: {
    trigger_name: 'chat_fallback_kb',
    channel: 'whatsapp',
    recipient: 'kb',
    t_number: 18,
    whatsapp_template_name: 'chat_fallback_kb',
    has_attachment: false,
    description: 'T18: Chat-Fallback: neue Kundennachricht (an KB)',
  },

  // ─── Email-only: Kunde ───────────────────────────────────────────────────

  welcome_kunde: {
    trigger_name: 'welcome_kunde',
    channel: 'email',
    recipient: 'kunde',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Willkommens-Email an Kunden mit Portal-Zugangsdaten',
  },

  // ─── Email-only: SV ─────────────────────────────────────────────────────

  welcome_sv_solo: {
    trigger_name: 'welcome_sv_solo',
    channel: 'email',
    recipient: 'sv',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Willkommens-Email an Solo-SV',
  },

  welcome_sv_buero: {
    trigger_name: 'welcome_sv_buero',
    channel: 'email',
    recipient: 'sv',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Willkommens-Email an SV-Buero',
  },

  welcome_sv_sub: {
    trigger_name: 'welcome_sv_sub',
    channel: 'email',
    recipient: 'sv',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Willkommens-Email an SV-Subunternehmer',
  },

  sv_termin_bestaetigung: {
    trigger_name: 'sv_termin_bestaetigung',
    channel: 'email',
    recipient: 'sv',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'S-E6: Terminbestaetigung per Email an SV',
  },

  sv_monatsabrechnung: {
    trigger_name: 'sv_monatsabrechnung',
    channel: 'email',
    recipient: 'sv',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: true,
    description: 'Monatsabrechnung an SV (mit PDF-Anhang)',
  },

  // ─── Email-only: Kanzlei ─────────────────────────────────────────────────

  kanzlei_monatsabrechnung: {
    trigger_name: 'kanzlei_monatsabrechnung',
    channel: 'email',
    recipient: 'kanzlei',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: true,
    description: 'Monatsabrechnung an Kanzlei (mit PDF-Anhang)',
  },

  // ─── Email-only: Admin ───────────────────────────────────────────────────

  admin_backup_failed: {
    trigger_name: 'admin_backup_failed',
    channel: 'email',
    recipient: 'admin',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Admin-Alert: Backup fehlgeschlagen',
  },

  admin_einzug_failed: {
    trigger_name: 'admin_einzug_failed',
    channel: 'email',
    recipient: 'admin',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Admin-Alert: Stripe-Einzug fehlgeschlagen',
  },

  mitarbeiter_einladung: {
    trigger_name: 'mitarbeiter_einladung',
    channel: 'email',
    recipient: 'admin',
    t_number: null,
    whatsapp_template_name: null,
    has_attachment: false,
    description: 'Einladungs-Email an neuen Mitarbeiter',
  },
}
