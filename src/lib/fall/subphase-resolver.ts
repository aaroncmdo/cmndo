// AAR-538 (C1): Subphase-Resolver — pure function, single source of truth
// für alle 7 Rollen (Regel #21 aus Master-Prompt v2).
//
// Input: fall (v_faelle_mit_aktuellem_termin Row), optional lead +
// gutachter_termine + sla_tracking + webhook_events. Output: {phase, subphase,
// label, trigger_fields, next_hint, szenario}.
//
// 30+ Subphasen aus Notion-Spec 3431da4c91248176ae66e2a981993f60. Enthält die
// 6 Erweiterungen aus AAR-538 Kommentar (Quote, Rüge-2-SLA, Kürzungstyp-
// Conditional, kb_filmcheck_bestanden, Auszahlung-Split, Source-Enum).

export type TriggerSource =
  | 'manual'
  | 'webhook'
  | 'cron'
  | 'ocr'
  | 'manual_admin'
  | 'manual_kb'
  | 'manual_sv'
  | 'manual_kunde'

export type TriggerField = {
  name: string
  value: string | number | boolean | null
  set_at: string | null
  source: TriggerSource
}

export type Szenario = 'normalfall' | 'ruegefall' | 'klagefall' | 'bewertung' | 'haftpflicht_eindeutig' | 'haftpflicht_strittig' | 'leasingrueckgabe' | 'totalschaden' | 'gerichtsgutachten'

export type SubphaseResult = {
  phase: number
  subphase: string
  label: string
  szenario: Szenario | null
  trigger_fields: TriggerField[]
  next_hint: string
}

// ─── Input Shape ────────────────────────────────────────────────────────────

export type FallRow = Record<string, unknown> & {
  id: string
  status: string | null
  aktuelle_phase?: string | null
  szenario?: string | null
  vs_reaktion_typ?: string | null
  vs_reaktion_am?: string | null
  vs_kuerzungs_typ?: string | null
  vs_kuerzung_grund?: string | null
  kuerzungs_betrag?: number | null
  vs_ablehnungsgrund?: string | null
  vs_quote_prozent?: number | null
  vs_quote_akzeptiert_am?: string | null
  vs_quote_betrag_ausgezahlt?: number | null
  vs_quote_grund?: string | null
  vs_frist_bis?: string | null
  regulierung_betrag?: number | null
  auszahlung_kunde_eingegangen_am?: string | null
  auszahlung_gutachter_eingegangen_am?: string | null
  auszahlung_kunde_betrag?: number | null
  eskalation_tag_14_am?: string | null
  eskalation_tag_21_am?: string | null
  eskalation_tag_28_am?: string | null
  eskalation_tag_14_ergebnis?: string | null
  eskalation_tag_21_ergebnis?: string | null
  eskalation_tag_28_ergebnis?: string | null
  ruege_counter?: number | null
  ruege_gesendet_am?: string | null
  ruege_grund?: string | null
  technische_stellungnahme_status?: string | null
  technische_stellungnahme_beauftragt_am?: string | null
  technische_stellungnahme_hochgeladen_am?: string | null
  technische_stellungnahme_freigabe_am?: string | null
  nachbesichtigung_status?: string | null
  nachbesichtigung_termin_datum?: string | null
  nachbesichtigung_konfrontation?: boolean | null
  nachbesichtigung_sv_konfrontation_gewuenscht?: boolean | null
  nachbesichtigung_sv_termin_vereinbart_am?: string | null
  nachbesichtigung_kunde_termin_eingereicht_am?: string | null
  anschlussschreiben_am?: string | null
  anschlussschreiben_sendedatum?: string | null
  kanzlei_uebergeben_am?: string | null
  mandatsnummer?: string | null
  gutachten_eingegangen_am?: string | null
  ocr_extrahiert_am?: string | null
  filmcheck_ok?: boolean | null
  besichtigung_datum?: string | null
  sa_unterschrieben_am?: string | null
  vollmacht_status?: string | null
  vollmacht_geprueft_am?: string | null
  service_typ?: string | null
  fin_vin?: string | null
  cardentity_abfrage_am?: string | null
  dokumente_reminder_whatsapp_letzte_sendung?: string | null
  sv_termin?: string | null
  termin_erinnerung_5min_gesendet?: boolean | null
  abgeschlossen_am?: string | null
  google_review_gesendet?: boolean | null
  kanzlei_provision_status?: string | null
  kanzlei_provision_ausgezahlt_am?: string | null
}

export type LeadRow = Record<string, unknown> & {
  zb1_status?: string | null
}

export type GutachterTerminRow = {
  id?: string
  fall_id?: string
  typ?: string | null
  sv_unterwegs_seit?: string | null
  sv_angekommen_am?: string | null
  durchgefuehrt_am?: string | null
  status?: string | null
}

export type WebhookEventRow = {
  event_type: string | null
  fall_id: string | null
  processed_at: string | null
  source: string | null
}

export type ResolverInput = {
  fall: FallRow
  lead?: LeadRow | null
  gutachter_termine?: GutachterTerminRow[]
  webhook_events?: WebhookEventRow[]
  now?: Date // injectable für Tests
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function addDays(date: string | Date, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : date
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

function sourceForField(fieldName: string): TriggerSource {
  if (fieldName.startsWith('ocr_') || fieldName === 'filmcheck_ok') return 'ocr'
  if (fieldName.includes('eskalation_tag_')) return 'cron'
  if (fieldName === 'termin_erinnerung_5min_gesendet') return 'cron'
  if (fieldName === 'sv_unterwegs_seit' || fieldName === 'sv_angekommen_am') return 'webhook'
  if (fieldName === 'cardentity_abfrage_am') return 'webhook'
  return 'manual_admin'
}

function pushTrigger(out: TriggerField[], name: string, value: unknown, set_at: string | null | undefined): void {
  if (value == null || value === false || value === '') return
  out.push({
    name,
    value: value as string | number | boolean,
    set_at: set_at ?? null,
    source: sourceForField(name),
  })
}

function hasWebhookEvent(events: WebhookEventRow[] | undefined, eventType: string): { seen: boolean; at: string | null } {
  if (!events) return { seen: false, at: null }
  const e = events.find((x) => x.event_type === eventType && x.processed_at != null)
  return { seen: !!e, at: e?.processed_at ?? null }
}

// ─── Main Resolver ──────────────────────────────────────────────────────────

import { getNextStepHint } from './next-step-hints'

export function resolveSubphase(input: ResolverInput): SubphaseResult {
  const { fall, lead, gutachter_termine, webhook_events } = input
  const now = input.now ?? new Date()
  const triggers: TriggerField[] = []
  const szenario = (fall.szenario as Szenario | null | undefined) ?? null

  const aktTermin = (gutachter_termine ?? [])
    .filter((t) => (t.status ?? '') !== 'storniert')
    .sort((a, b) => ((b.durchgefuehrt_am ?? b.sv_angekommen_am ?? b.sv_unterwegs_seit ?? '') > (a.durchgefuehrt_am ?? a.sv_angekommen_am ?? a.sv_unterwegs_seit ?? '') ? 1 : -1))[0]

  // ══ Phase 9 — Abschluss (top-priorisiert, Abschluss überschreibt alles) ══
  if (fall.abgeschlossen_am) {
    pushTrigger(triggers, 'abgeschlossen_am', true, fall.abgeschlossen_am)
    if (fall.kanzlei_provision_status === 'ausgezahlt') {
      return build(9, '9.3', 'Kanzlei-Abrechnung', szenario, triggers)
    }
    if (fall.google_review_gesendet !== true && addDays(fall.abgeschlossen_am, 1) < now) {
      pushTrigger(triggers, 'google_review_gesendet', false, null)
      return build(9, '9.2', 'Feedback ausstehend', szenario, triggers)
    }
    return build(9, '9.1', 'Geschlossen', szenario, triggers)
  }

  // ══ Phase 8 — Auszahlung (Split Kunde/SV — Erweiterung 5) ══
  if (fall.regulierung_betrag != null) {
    pushTrigger(triggers, 'regulierung_betrag', fall.regulierung_betrag, null)
    pushTrigger(triggers, 'auszahlung_kunde_eingegangen_am', fall.auszahlung_kunde_eingegangen_am ?? null, fall.auszahlung_kunde_eingegangen_am ?? null)
    pushTrigger(triggers, 'auszahlung_gutachter_eingegangen_am', fall.auszahlung_gutachter_eingegangen_am ?? null, fall.auszahlung_gutachter_eingegangen_am ?? null)
    const kundeGez = !!fall.auszahlung_kunde_eingegangen_am
    const svGez = !!fall.auszahlung_gutachter_eingegangen_am
    if (kundeGez && svGez) return build(8, '8.3', 'Beide ausgezahlt — Schlussabrechnung', szenario, triggers)
    if (kundeGez && !svGez) return build(8, '8.2a', 'Kunde gezahlt, SV offen', szenario, triggers)
    if (svGez && !kundeGez) return build(8, '8.2b', 'SV gezahlt, Kunde offen', szenario, triggers)
    if (!kundeGez && !svGez) return build(8, '8.1', 'Beide Auszahlungen ausstehend', szenario, triggers)
  }

  // ══ Phase 7 — Rüge / Klage ══
  if (fall.ruege_counter != null && fall.ruege_counter >= 2) {
    pushTrigger(triggers, 'ruege_counter', fall.ruege_counter, fall.ruege_gesendet_am ?? null)
    // Erweiterung 2: 7.5a/7.5b Split auf 7d SLA
    if (szenario === 'klagefall') return build(7, '7.6', 'Klage-Entscheidung', szenario, triggers)
    if (!fall.vs_reaktion_am && fall.ruege_gesendet_am) {
      const slaBreachAt = addDays(fall.ruege_gesendet_am, 7)
      if (now >= slaBreachAt) return build(7, '7.5b', 'Rüge 2 SLA-Breach (7d überschritten)', szenario, triggers)
      return build(7, '7.5a', 'Rüge 2 versendet — warte 7d', szenario, triggers)
    }
    return build(7, '7.5', 'Rüge 2 abgeschlossen', szenario, triggers)
  }

  if (fall.ruege_counter === 1) {
    pushTrigger(triggers, 'ruege_counter', 1, fall.ruege_gesendet_am ?? null)
    if (!fall.vs_reaktion_am) return build(7, '7.4', 'Warten auf VS nach Rüge 1', szenario, triggers)
    return build(7, '7.3', 'Rüge 1 versendet', szenario, triggers)
  }

  // Stellungnahme-Conditional (Erweiterung 3): nur bei technisch/gemischt
  if (fall.technische_stellungnahme_status === 'hochgeladen' || fall.technische_stellungnahme_status === 'freigegeben') {
    pushTrigger(triggers, 'technische_stellungnahme_status', fall.technische_stellungnahme_status, fall.technische_stellungnahme_hochgeladen_am ?? null)
    return build(7, '7.2', 'Stellungnahme eingegangen', szenario, triggers)
  }
  if (
    fall.technische_stellungnahme_status === 'beauftragt' &&
    (fall.vs_kuerzungs_typ === 'technisch' || fall.vs_kuerzungs_typ === 'gemischt')
  ) {
    pushTrigger(triggers, 'technische_stellungnahme_status', 'beauftragt', fall.technische_stellungnahme_beauftragt_am ?? null)
    pushTrigger(triggers, 'vs_kuerzungs_typ', fall.vs_kuerzungs_typ, null)
    return build(7, '7.1', 'Technische Stellungnahme angefordert', szenario, triggers)
  }

  // ══ Phase 6 — VS-Reaktion (inkl. Quotierung — Erweiterung 1) ══
  // 6f: Quotierung
  if (fall.vs_reaktion_typ === 'quotiert' && fall.vs_quote_prozent != null) {
    pushTrigger(triggers, 'vs_reaktion_typ', 'quotiert', fall.vs_reaktion_am ?? null)
    pushTrigger(triggers, 'vs_quote_prozent', fall.vs_quote_prozent, fall.vs_reaktion_am ?? null)
    if (fall.vs_quote_betrag_ausgezahlt != null) return build(6, '6f.3', 'Quote ausgezahlt', szenario, triggers)
    if (fall.vs_quote_akzeptiert_am) return build(6, '6f.2', 'Quote akzeptiert', szenario, triggers)
    return build(6, '6f.1', 'Quote angekündigt', szenario, triggers)
  }

  // 6e: Nachbesichtigung (prüft nachbesichtigung_status vor vs_reaktion_typ)
  if (fall.nachbesichtigung_status && fall.nachbesichtigung_status !== 'nicht-angefordert') {
    pushTrigger(triggers, 'nachbesichtigung_status', fall.nachbesichtigung_status, null)
    return build(6, '6e', 'Nachbesichtigung angefordert', szenario, triggers)
  }

  // 6a/6b/6c: VS-Reaktion direkt
  if (fall.vs_reaktion_typ === 'voll_reguliert') {
    pushTrigger(triggers, 'vs_reaktion_typ', 'voll_reguliert', fall.vs_reaktion_am ?? null)
    return build(6, '6a', 'VS reguliert vollständig', szenario, triggers)
  }
  if (fall.vs_reaktion_typ === 'gekuerzt' && (fall.kuerzungs_betrag ?? 0) > 0) {
    pushTrigger(triggers, 'vs_reaktion_typ', 'gekuerzt', fall.vs_reaktion_am ?? null)
    pushTrigger(triggers, 'kuerzungs_betrag', fall.kuerzungs_betrag as number, fall.vs_reaktion_am ?? null)
    if (fall.vs_kuerzung_grund) pushTrigger(triggers, 'vs_kuerzung_grund', fall.vs_kuerzung_grund, null)
    if (fall.vs_kuerzungs_typ) pushTrigger(triggers, 'vs_kuerzungs_typ', fall.vs_kuerzungs_typ, null)
    return build(6, '6b', 'VS kürzt', szenario, triggers)
  }
  if (fall.vs_reaktion_typ === 'abgelehnt') {
    pushTrigger(triggers, 'vs_reaktion_typ', 'abgelehnt', fall.vs_reaktion_am ?? null)
    if (fall.vs_ablehnungsgrund) pushTrigger(triggers, 'vs_ablehnungsgrund', fall.vs_ablehnungsgrund, null)
    return build(6, '6c', 'VS lehnt ab', szenario, triggers)
  }

  // 6d: VS schweigt — 14d nach AS
  if (
    fall.anschlussschreiben_sendedatum &&
    !fall.vs_reaktion_typ &&
    addDays(fall.anschlussschreiben_sendedatum, 14) < now
  ) {
    pushTrigger(triggers, 'anschlussschreiben_sendedatum', fall.anschlussschreiben_sendedatum, fall.anschlussschreiben_sendedatum)
    return build(6, '6d', 'VS schweigt (>14d)', szenario, triggers)
  }

  // ══ Phase 5 — Kanzlei ══
  if (fall.kanzlei_uebergeben_am) {
    pushTrigger(triggers, 'kanzlei_uebergeben_am', true, fall.kanzlei_uebergeben_am)
    if (fall.anschlussschreiben_sendedatum) {
      pushTrigger(triggers, 'anschlussschreiben_sendedatum', fall.anschlussschreiben_sendedatum, fall.anschlussschreiben_sendedatum)
      // 5.5 Warten auf VS
      if (fall.eskalation_tag_14_am || (fall.vs_frist_bis && new Date(fall.vs_frist_bis) < now)) {
        pushTrigger(triggers, 'eskalation_tag_14_am', fall.eskalation_tag_14_am ?? null, fall.eskalation_tag_14_am ?? null)
        return build(5, '5.5', 'Warten auf VS — erste Eskalation', szenario, triggers)
      }
      return build(5, '5.4', 'Anschlussschreiben versendet', szenario, triggers)
    }
    if (fall.mandatsnummer && !fall.anschlussschreiben_am) {
      pushTrigger(triggers, 'mandatsnummer', fall.mandatsnummer, null)
      return build(5, '5.3', 'Anschlussschreiben wird vorbereitet', szenario, triggers)
    }
    if (fall.mandatsnummer) {
      pushTrigger(triggers, 'mandatsnummer', fall.mandatsnummer, null)
      return build(5, '5.2', 'Mandatsnummer vergeben', szenario, triggers)
    }
    return build(5, '5.1', 'Akte bei Kanzlei — wartet auf Mandatsnummer', szenario, triggers)
  }

  // ══ Phase 4 — Gutachten (inkl. Erweiterung 4: kb_filmcheck_bestanden) ══
  const kbFilmcheckEvent = hasWebhookEvent(webhook_events, 'kb_filmcheck_bestanden')
  if (kbFilmcheckEvent.seen) {
    pushTrigger(triggers, 'kb_filmcheck_bestanden (webhook_events)', true, kbFilmcheckEvent.at)
    return build(4, '4.5', 'E-Akte → Kanzlei-Übergabe', szenario, triggers)
  }
  if (fall.filmcheck_ok === true) {
    pushTrigger(triggers, 'filmcheck_ok', true, null)
    return build(4, '4.4', 'QC / Filmcheck bestanden', szenario, triggers)
  }
  if (fall.ocr_extrahiert_am) {
    pushTrigger(triggers, 'ocr_extrahiert_am', true, fall.ocr_extrahiert_am)
    return build(4, '4.3', 'Kernwerte extrahiert (OCR)', szenario, triggers)
  }
  if (fall.gutachten_eingegangen_am) {
    pushTrigger(triggers, 'gutachten_eingegangen_am', true, fall.gutachten_eingegangen_am)
    return build(4, '4.2', 'Gutachten hochgeladen', szenario, triggers)
  }

  // ══ Phase 3 — Besichtigung ══
  if (aktTermin) {
    if (aktTermin.durchgefuehrt_am) {
      pushTrigger(triggers, 'termin.durchgefuehrt_am', true, aktTermin.durchgefuehrt_am)
      return build(4, '4.1', 'Gutachten in Bearbeitung', szenario, triggers)
    }
    if (aktTermin.sv_angekommen_am) {
      pushTrigger(triggers, 'termin.sv_angekommen_am', true, aktTermin.sv_angekommen_am)
      return build(3, '3.2', 'SV vor Ort', szenario, triggers)
    }
    if (aktTermin.sv_unterwegs_seit) {
      pushTrigger(triggers, 'termin.sv_unterwegs_seit', true, aktTermin.sv_unterwegs_seit)
      return build(3, '3.1', 'SV unterwegs', szenario, triggers)
    }
  }

  // ══ Phase 2 — Vorbereitung ══
  // 2.6 Termin-Erinnerung
  if (fall.sv_termin) {
    const terminDate = new Date(fall.sv_termin)
    const hoursUntil = (terminDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntil > 0 && hoursUntil < 24 && fall.termin_erinnerung_5min_gesendet !== true) {
      pushTrigger(triggers, 'sv_termin', fall.sv_termin, fall.sv_termin)
      return build(2, '2.6', 'Termin-Erinnerung (<24h)', szenario, triggers)
    }
  }
  // 2.5 Dokumente-Nachreichung
  if (fall.dokumente_reminder_whatsapp_letzte_sendung) {
    pushTrigger(triggers, 'dokumente_reminder_whatsapp_letzte_sendung', true, fall.dokumente_reminder_whatsapp_letzte_sendung)
    return build(2, '2.5', 'Dokumente nachgereicht (Reminder)', szenario, triggers)
  }
  // 2.4 FIN-Call
  if (fall.fin_vin && !fall.cardentity_abfrage_am) {
    pushTrigger(triggers, 'fin_vin', fall.fin_vin, null)
    return build(2, '2.4', 'FIN-Call zu CarDentity ausstehend', szenario, triggers)
  }
  // 2.3 ZB1 hochgeladen
  if (lead?.zb1_status === 'bestaetigt' || lead?.zb1_status === 'hochgeladen') {
    if (!fall.fin_vin) {
      pushTrigger(triggers, 'lead.zb1_status', lead.zb1_status, null)
      return build(2, '2.3', 'ZB1 hochgeladen — FIN ausstehend', szenario, triggers)
    }
  }
  // 2.2 Vollmacht bestätigt
  if (fall.vollmacht_status === 'bestaetigt' || fall.vollmacht_geprueft_am) {
    pushTrigger(triggers, 'vollmacht_status', fall.vollmacht_status ?? 'geprueft', fall.vollmacht_geprueft_am ?? null)
    return build(2, '2.2', 'Vollmacht bestätigt', szenario, triggers)
  }
  // 2.1 Vollmacht ausstehend
  if (
    fall.sa_unterschrieben_am &&
    fall.service_typ === 'komplett' &&
    (fall.vollmacht_status == null || fall.vollmacht_status === 'ausstehend')
  ) {
    pushTrigger(triggers, 'sa_unterschrieben_am', true, fall.sa_unterschrieben_am)
    return build(2, '2.1', 'Vollmacht ausstehend', szenario, triggers)
  }

  // ══ Fallback: Phase 1 Ersterfassung ══
  return build(1, '1', `Phase unbekannt — status: ${fall.status ?? '—'}`, szenario, triggers)
}

function build(phase: number, subphase: string, label: string, szenario: Szenario | null, triggers: TriggerField[]): SubphaseResult {
  return {
    phase,
    subphase,
    label,
    szenario,
    trigger_fields: triggers,
    next_hint: getNextStepHint(subphase),
  }
}
