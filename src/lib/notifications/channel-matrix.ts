// AAR-497 N2: Default-Channel-Matrix aus Notion-Taxonomie §5. Pro Event × Rolle
// definiert welche Channels defaulthaft senden. N5 (Preferences) wird später
// pro User override-Defaults zulassen — bis dahin sind das die Hardcodes.
//
// Legende: [] = kein Push für diese Rolle bei diesem Event.

import type { EventType, Channel, Role, Priority } from './types'

type ChannelsByRole = Partial<Record<Role, Channel[]>>

type EventConfig = {
  priority: Priority
  channels: ChannelsByRole
}

export const EVENT_MATRIX: Record<EventType, EventConfig> = {
  // 5.1 Fall-Lifecycle
  'fall.created': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  'fall.sv_assigned': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'in_app'],
      sachverstaendiger: ['web_push', 'whatsapp', 'email', 'in_app'],
      makler: ['in_app'],
      admin: ['in_app'],
    },
  },
  'fall.status_changed': {
    priority: 'low',
    channels: {
      kunde: ['web_push', 'in_app'],
      sachverstaendiger: ['web_push', 'in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  'fall.storniert': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      sachverstaendiger: ['web_push', 'in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  // 5.2 SA
  'sa.flow_sent': {
    priority: 'normal',
    channels: { kunde: ['whatsapp', 'email'], admin: ['in_app'] },
  },
  'sa.signed': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'in_app'],
      makler: ['in_app'],
      admin: ['in_app'],
    },
  },
  // 5.3 Termine
  'termin.sv_bestaetigt': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'in_app'],
      sachverstaendiger: ['web_push', 'in_app'],
      makler: ['in_app'],
      admin: ['in_app'],
    },
  },
  'termin.sv_abgelehnt': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'web_push', 'in_app'],
      admin: ['web_push', 'in_app'],
    },
  },
  'termin.sv_gegenvorschlag': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'web_push', 'in_app'],
      admin: ['web_push', 'in_app'],
    },
  },
  'termin.sv_storniert': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'web_push', 'in_app'],
      sachverstaendiger: ['web_push', 'whatsapp', 'in_app'],
      admin: ['in_app'],
    },
  },
  'termin.erinnerung': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'web_push'],
      sachverstaendiger: ['web_push'],
    },
  },
  'termin.sv_unterwegs': {
    priority: 'urgent',
    channels: { kunde: ['whatsapp', 'web_push'] },
  },
  'termin.sv_verspaetet': {
    priority: 'urgent',
    channels: { kunde: ['whatsapp', 'web_push'], admin: ['in_app'] },
  },
  'termin.sv_angekommen': {
    priority: 'urgent',
    channels: { kunde: ['whatsapp', 'web_push'], admin: ['in_app'] },
  },
  'termin.sv_abgeschlossen': {
    priority: 'low',
    channels: { kunde: ['in_app'], sachverstaendiger: ['in_app'], admin: ['in_app'] },
  },
  // 5.4 Videocalls
  'videocall.geplant': {
    priority: 'normal',
    channels: { kunde: ['whatsapp', 'email', 'web_push'], admin: ['in_app'] },
  },
  'videocall.erinnerung': {
    priority: 'urgent',
    channels: { kunde: ['whatsapp', 'web_push'] },
  },
  // 5.5 Gutachten
  'gutachten.fertig': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'email', 'web_push'],
      sachverstaendiger: ['in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  'gutachten.nachbesserung': {
    priority: 'normal',
    channels: {
      kunde: ['in_app'],
      sachverstaendiger: ['whatsapp', 'web_push', 'email'],
      admin: ['in_app'],
    },
  },
  // 5.6 Kanzlei
  'kanzlei.uebergabe': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'web_push', 'in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  'kanzlei.as_gesendet': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'web_push', 'in_app'],
      makler: ['in_app'],
      admin: ['in_app'],
    },
  },
  // 5.7 Regulierung
  'regulierung.ergebnis': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'email', 'web_push', 'in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  'regulierung.ruege_gesendet': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'web_push', 'in_app'],
      makler: ['in_app'],
      admin: ['in_app'],
    },
  },
  'eskalation.vs_frist': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'web_push'],
      makler: ['in_app'],
      admin: ['in_app'],
    },
  },
  // 5.8 Auszahlung
  'auszahlung.veranlasst': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'email', 'web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  // 5.9 Tasks — nur an Empfänger (siehe fan-out.ts: task-Events nutzen empfaengerUserId direkt)
  'task.created': {
    priority: 'normal',
    channels: {
      kunde: ['web_push', 'whatsapp'],
      sachverstaendiger: ['web_push', 'whatsapp'],
      admin: ['in_app'],
    },
  },
  'task.due': {
    priority: 'urgent',
    channels: {
      kunde: ['web_push', 'whatsapp'],
      sachverstaendiger: ['web_push', 'whatsapp'],
      admin: ['in_app'],
    },
  },
  // 5.10 Dokumente + Nachrichten
  'dokument.fehlt': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'web_push', 'email'],
      sachverstaendiger: ['web_push', 'whatsapp'],
      admin: ['in_app'],
    },
  },
  'dokument.hochgeladen': {
    priority: 'low',
    channels: {
      kunde: ['in_app'],
      sachverstaendiger: ['in_app'],
      makler: ['in_app'],
      admin: ['web_push', 'in_app'],
    },
  },
  'nachricht.received': {
    priority: 'normal',
    channels: {
      kunde: ['web_push', 'in_app'],
      sachverstaendiger: ['web_push', 'in_app'],
      makler: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  // 5.11 Makler
  'makler.lead_eingegangen': {
    priority: 'normal',
    channels: { makler: ['web_push', 'email', 'in_app'], admin: ['in_app'] },
  },
  'makler.provision_status': {
    priority: 'normal',
    channels: { makler: ['web_push', 'email', 'in_app'], admin: ['in_app'] },
  },
  // 5.12 Mietwagen / Nutzungsausfall (AAR-759)
  'mietwagen.rechnung_ausstehend': {
    priority: 'normal',
    channels: { kunde: ['whatsapp', 'in_app'], kundenbetreuer: ['in_app'] },
  },
  'mietwagen.abgabe_naht': {
    priority: 'urgent',
    channels: { kunde: ['whatsapp', 'email', 'in_app'], kundenbetreuer: ['in_app'] },
  },
  'mietwagen.ueber_limit': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      kundenbetreuer: ['web_push', 'in_app'],
      admin: ['in_app'],
    },
  },
  // 5.13 Airdrop (AAR-814)
  'claim.gegner_eingeladen': {
    priority: 'normal',
    channels: { kunde: ['in_app'], kundenbetreuer: ['in_app'] },
  },
  'claim.gegner_hat_geoeffnet': {
    priority: 'normal',
    channels: { kunde: ['in_app', 'web_push'], kundenbetreuer: ['in_app'] },
  },
  'claim.gegner_hat_geantwortet': {
    priority: 'normal',
    channels: { kunde: ['in_app', 'web_push'], kundenbetreuer: ['in_app', 'web_push'] },
  },
  'claim.gegner_konvertiert_zu_voll': {
    priority: 'normal',
    channels: { kunde: ['in_app'], kundenbetreuer: ['in_app'], admin: ['in_app'] },
  },
  'claim.einladung_abgelaufen': {
    priority: 'low',
    channels: { kunde: ['in_app'], kundenbetreuer: ['in_app'] },
  },
  // 5.14 Manuelle Endzustände (AAR-840)
  'claim.in_kommunikation_vs': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      kundenbetreuer: ['in_app'],
      admin: ['in_app'],
    },
  },
  'claim.reguliert': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      kundenbetreuer: ['in_app'],
      admin: ['in_app'],
    },
  },
  'claim.abgelehnt': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      kundenbetreuer: ['in_app'],
      admin: ['in_app'],
    },
  },
  'claim.storniert': {
    priority: 'normal',
    channels: {
      kunde: ['in_app'],
      kundenbetreuer: ['in_app'],
      admin: ['in_app'],
    },
  },
  'claim.an_externe_kanzlei_uebergeben': {
    priority: 'urgent',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      kundenbetreuer: ['in_app'],
      admin: ['in_app'],
    },
  },
  // 5.15 Kanzlei-Workflow (AAR-841)
  'claim.kanzlei_paket_versendet': {
    priority: 'normal',
    channels: {
      kunde: ['whatsapp', 'email', 'in_app'],
      kundenbetreuer: ['in_app'],
      admin: ['in_app'],
    },
  },
  'claim.kanzlei_re_frage_due': {
    priority: 'normal',
    channels: {
      kunde: ['in_app'],
    },
  },
  // 5.16 Kanzlei-Auto-Paket-Trigger (AAR-844) — KB-only, keine Kunde-Notification
  'claim.kanzlei_paket_pending': {
    priority: 'normal',
    channels: {
      kundenbetreuer: ['email', 'in_app'],
      admin:          ['in_app'],
    },
  },
}

export function getEventConfig(eventType: EventType): EventConfig {
  return EVENT_MATRIX[eventType]
}
