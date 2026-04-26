// AAR-497 N2: Type-safe Event-Registry. Quelle: Notion-Page „🔔 Notification
// Event-Taxonomie" (AAR-496 / N1). 30 Events in 11 Kategorien. Jeder Event
// hat Name + Payload-Shape + Default-Channel-Matrix (siehe channel-matrix.ts).

export type Channel =
  | 'whatsapp'
  | 'email'
  | 'web_push'
  | 'native_push'
  | 'in_app'

export type Role = 'kunde' | 'sachverstaendiger' | 'makler' | 'kundenbetreuer' | 'admin'

export type Priority = 'low' | 'normal' | 'urgent'

// ── 30 Event-Keys aus der Taxonomie ───────────────────────────────────────
export type EventType =
  // 5.1 Fall-Lifecycle
  | 'fall.created'
  | 'fall.sv_assigned'
  | 'fall.status_changed'
  | 'fall.storniert'
  // 5.2 SA / Vollmacht
  | 'sa.flow_sent'
  | 'sa.signed'
  // 5.3 Termine SV
  | 'termin.sv_bestaetigt'
  | 'termin.sv_abgelehnt'
  | 'termin.sv_gegenvorschlag'
  | 'termin.sv_storniert'
  | 'termin.erinnerung'
  | 'termin.sv_unterwegs'
  | 'termin.sv_verspaetet'
  | 'termin.sv_angekommen'
  | 'termin.sv_abgeschlossen'
  // 5.4 Videocalls
  | 'videocall.geplant'
  | 'videocall.erinnerung'
  // 5.5 Gutachten
  | 'gutachten.fertig'
  | 'gutachten.nachbesserung'
  // 5.6 Kanzlei
  | 'kanzlei.uebergabe'
  | 'kanzlei.as_gesendet'
  // 5.7 Regulierung
  | 'regulierung.ergebnis'
  | 'regulierung.ruege_gesendet'
  | 'eskalation.vs_frist'
  // 5.8 Auszahlung
  | 'auszahlung.veranlasst'
  // 5.9 Tasks
  | 'task.created'
  | 'task.due'
  // 5.10 Dokumente + Nachrichten
  | 'dokument.fehlt'
  | 'dokument.hochgeladen'
  | 'nachricht.received'
  // 5.11 Makler
  | 'makler.lead_eingegangen'
  | 'makler.provision_status'
  // 5.12 Mietwagen / Nutzungsausfall (AAR-759)
  | 'mietwagen.rechnung_ausstehend'
  | 'mietwagen.abgabe_naht'
  | 'mietwagen.ueber_limit'
  // 5.13 Airdrop / Gegner-Einladung (AAR-814)
  | 'claim.gegner_eingeladen'
  | 'claim.gegner_hat_geoeffnet'
  | 'claim.gegner_hat_geantwortet'
  | 'claim.gegner_konvertiert_zu_voll'
  | 'claim.einladung_abgelaufen'
  // 5.14 Manuelle Endzustände (AAR-840) — KB/Admin-getriggerte Phase-9-Übergänge
  | 'claim.in_kommunikation_vs'
  | 'claim.reguliert'
  | 'claim.abgelehnt'
  | 'claim.storniert'
  | 'claim.an_externe_kanzlei_uebergeben'
  // 5.15 Kanzlei-Workflow (AAR-841)
  | 'claim.kanzlei_paket_versendet'
  | 'claim.kanzlei_re_frage_due'
  // 5.16 Kanzlei-Auto-Paket-Trigger (AAR-844)
  | 'claim.kanzlei_paket_pending'
  // 5.17 Gutachten-OCR-Pipeline (AAR-838)
  | 'gutachten.ocr_succeeded'
  | 'gutachten.ocr_failed'

// ── Payload-Shapes ────────────────────────────────────────────────────────
export interface EventPayloads {
  // 5.1
  'fall.created': { fallId: string; leadId: string }
  'fall.sv_assigned': { fallId: string; svId: string; terminId?: string }
  'fall.status_changed': { fallId: string; oldStatus: string; newStatus: string }
  'fall.storniert': { fallId: string; grund: string }
  // 5.2
  'sa.flow_sent': { fallId: string; flowLinkUrl: string }
  'sa.signed': { fallId: string }
  // 5.3
  'termin.sv_bestaetigt': { fallId: string; terminId: string; datum: string; uhrzeit: string; ort: string; svName: string }
  'termin.sv_abgelehnt': { fallId: string; terminId: string; grund?: string }
  'termin.sv_gegenvorschlag': { fallId: string; terminId: string; alt_datum: string; alt_uhrzeit: string; grund?: string }
  'termin.sv_storniert': { fallId: string; terminId: string; von_wem: 'sv' | 'kunde' | 'admin'; grund?: string }
  'termin.erinnerung': { fallId: string; terminId: string; offset_hours: 24 | 2 }
  'termin.sv_unterwegs': { fallId: string; terminId: string; etaMinuten: number }
  'termin.sv_verspaetet': { fallId: string; terminId: string; etaMinuten: number; verspaetungMinuten: number }
  'termin.sv_angekommen': { fallId: string; terminId: string }
  'termin.sv_abgeschlossen': { fallId: string; terminId: string }
  // 5.4
  'videocall.geplant': { fallId: string; terminDatum: string; meetLink: string; kbName: string }
  'videocall.erinnerung': { fallId: string; terminId: string; meetLink: string }
  // 5.5
  'gutachten.fertig': { fallId: string; gutachtenId: string; pdfUrl: string }
  'gutachten.nachbesserung': { fallId: string; gutachtenId: string; fehlerListe: string[] }
  // 5.6
  'kanzlei.uebergabe': { fallId: string; kanzleiKontakt?: string }
  'kanzlei.as_gesendet': { fallId: string; vsName: string; fristTage: 14 }
  // 5.7
  'regulierung.ergebnis': { fallId: string; typ: 'voll' | 'teilweise' | 'kuerzung' | 'abgelehnt'; betragEur?: number; kuerzungBetragEur?: number }
  'regulierung.ruege_gesendet': { fallId: string; kuerzungBetragEur: number }
  'eskalation.vs_frist': { fallId: string; stufe: 14 | 21 | 28; vsName: string }
  // 5.8
  'auszahlung.veranlasst': { fallId: string; betragEur: number; erwarteteGutschriftTage: number }
  // 5.9
  'task.created': { fallId: string; taskId: string; taskTyp: string; empfaengerRolle: Role; empfaengerUserId: string; deadline?: string }
  'task.due': { fallId: string; taskId: string; state: 'soon_24h' | 'overdue'; empfaengerUserId: string }
  // 5.10
  'dokument.fehlt': { fallId: string; dokumentTyp: string; anforderungText: string; empfaengerRolle: 'kunde' | 'sachverstaendiger' }
  'dokument.hochgeladen': { fallId: string; dokumentId: string; typ: string; uploadedByUserId: string }
  'nachricht.received': { fallId: string; nachrichtId: string; senderUserId: string; senderRolle: string; inhaltPreview: string }
  // 5.11
  'makler.lead_eingegangen': { leadId: string; maklerId: string; promoCode: string }
  'makler.provision_status': { fallId: string; provisionId: string; maklerId: string; status: 'freigegeben' | 'storniert'; betragEur: number; grund?: string }
  // 5.12 Mietwagen (AAR-759)
  'mietwagen.rechnung_ausstehend': { fallId: string; seit_tage: number }
  'mietwagen.abgabe_naht': { fallId: string; tage_rest: number; limit_datum: string }
  'mietwagen.ueber_limit': { fallId: string; tage_ueber: number; limit_datum: string }
  // 5.13 Airdrop (AAR-814)
  'claim.gegner_eingeladen': { claimId: string; invitationId: string; invitedVia: string; expiresAt: string }
  'claim.gegner_hat_geoeffnet': { claimId: string; invitationId: string; openedAt: string }
  'claim.gegner_hat_geantwortet': { claimId: string; partyId: string; responseAt: string }
  'claim.gegner_konvertiert_zu_voll': { claimId: string; partyId: string; userId: string; konvertiertAm: string }
  'claim.einladung_abgelaufen': { claimId: string; invitationId: string; ablaufGrund: string }
  // 5.14 Manuelle Endzustände (AAR-840)
  'claim.in_kommunikation_vs': { claimId: string; fallId: string; grund: string }
  'claim.reguliert': { claimId: string; fallId: string; betragEur: number; grund?: string }
  'claim.abgelehnt': { claimId: string; fallId: string; vsAblehnungsGrund: string; grundFreitext?: string }
  'claim.storniert': { claimId: string; fallId: string; grund: string }
  'claim.an_externe_kanzlei_uebergeben': { claimId: string; fallId: string; kanzleiName: string; uebergabeDatum: string; grund?: string }
  // 5.15 Kanzlei-Workflow (AAR-841)
  'claim.kanzlei_paket_versendet': { claimId: string; fallId: string; empfaengerTyp: 'partnerkanzlei' | 'eigene_kanzlei'; kanzleiName: string }
  'claim.kanzlei_re_frage_due':    { claimId: string; fallId: string }
  // 5.16 Kanzlei-Auto-Paket-Trigger (AAR-844)
  'claim.kanzlei_paket_pending':   { claimId: string; fallId: string; kanzleiWunsch: string; phase: string; kundenbetreuerId: string | null }
  // 5.17 Gutachten-OCR-Pipeline (AAR-838)
  'gutachten.ocr_succeeded':       { fallId: string; gutachtenId: string; engine: string; confidence: number }
  'gutachten.ocr_failed':          { fallId: string; gutachtenId: string; runNummer: number; reason: string }
}

// ── DB-Row-Shapes ─────────────────────────────────────────────────────────
export type NotificationEvent = {
  id: string
  event_type: EventType
  payload: Record<string, unknown>
  fall_id: string | null
  triggered_by_user_id: string | null
  created_at: string
  processed_at: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error_message: string | null
  retry_count: number
  next_retry_at: string | null
}

export type NotificationDelivery = {
  id: string
  event_id: string
  recipient_user_id: string
  recipient_role: Role
  channel: Channel
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  skip_reason: string | null
  external_id: string | null
  sent_at: string | null
  error_message: string | null
  created_at: string
}

export type Recipient = {
  userId: string
  role: Role
  channels: Channel[]
}
