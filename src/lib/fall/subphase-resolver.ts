// AAR-538 (C1): Subphase-Resolver — pure function, single source of truth
// für alle 7 Rollen (Regel #21 aus Master-Prompt v2).
//
// CMM-44 MP-2: Re-based von der sterbenden v_faelle_mit_aktuellem_termin-View
// (System A) auf die Owning-Sub-Entities (§8 der cmm44-subphasen-mapping.md):
//   erfassung   ← lead (+ claim für sa/vollmacht/service post-conversion)
//   begutachtung← auftraege (QC/filmcheck/gutachten_url) + gutachten (OCR)
//   termin      ← gutachter_termine
//   regulierung ← kanzlei_faelle (vs_reaktion/ruege/anschlussschreiben/eskalation/…)
//   abschluss   ← claims (abgeschlossen_am/google_review/kanzlei_provision)
// Die Subphasen-LOGIK + Treffermenge sind unverändert (DE-1/DE-2): nur die
// Lese-Quelle pro Trigger-Feld wandert auf die Owning-Entity. Output identisch.
//
// 30+ Subphasen aus Notion-Spec 3431da4c91248176ae66e2a981993f60. Enthält die
// 6 Erweiterungen aus AAR-538 Kommentar (Quote, Rüge-2-SLA, Kürzungstyp-
// Conditional, kb_filmcheck_bestanden, Auszahlung-Split, Source-Enum).

import { getNextStepHint } from './next-step-hints'

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

// ─── Input Shapes — die §8-Owning-Sub-Entities ───────────────────────────────
// Bewusst Subsets (alle Felder optional): die vollen Loader-Rows (KanzleiFallRow,
// AuftragRow) sind strukturell zuweisbar, Tests bleiben knapp. Nur Trigger-Felder,
// kein Payload (§10.2).

/** claims-getriebene Trigger: abschluss + claim-globale Lifecycle-Milestones. */
export type ClaimTriggers = {
  status?: string | null
  szenario?: string | null
  service_typ?: string | null
  sa_unterschrieben_am?: string | null
  vollmacht_status?: string | null
  vollmacht_geprueft_am?: string | null
  kanzlei_uebergeben_am?: string | null
  dokumente_reminder_whatsapp_letzte_sendung?: string | null
  abgeschlossen_am?: string | null
  google_review_gesendet?: boolean | null
  kanzlei_provision_status?: string | null
  // Phase 8 (Auszahlungs-Split). DE-4-pending: der Loader lässt regulierung_betrag
  // + auszahlung_kunde_eingegangen_am offen (claim_payments.empfaenger existiert
  // noch nicht), darum aktuell inert (entspricht View-Stand = 0). Logik bleibt
  // testbar/erhalten bis die DE-4-Migration die Owning-Quelle nachliefert.
  regulierung_betrag?: number | null
  auszahlung_kunde_eingegangen_am?: string | null
  auszahlung_gutachter_eingegangen_am?: string | null
}

/** leads-getriebene Trigger (Erfassungs-Sub-Entity, §8.1). */
export type LeadTriggers = {
  zb1_status?: string | null
  fin?: string | null
  cardentity_enriched_at?: string | null
}

/** kanzlei_faelle-getriebene Trigger (Regulierungs-Sub-Entity, §8.3). */
export type KanzleiFallTriggers = {
  status?: string | null
  vs_reaktion_typ?: string | null
  vs_reaktion_am?: string | null
  vs_kuerzungs_typ?: string | null
  kuerzungs_betrag?: number | null
  vs_kuerzung_grund?: string | null
  vs_quote_prozent?: number | null
  vs_quote_akzeptiert_am?: string | null
  vs_quote_betrag_ausgezahlt?: number | null
  vs_frist_bis?: string | null
  ruege_counter?: number | null
  ruege_gesendet_am?: string | null
  anschlussschreiben_am?: string | null
  anschlussschreiben_sendedatum?: string | null
  eskalation_tag_14_am?: string | null
  mandatsnummer?: string | null
  lexdrive_case_id?: string | null
}

/** auftraege-getriebene Trigger (Begutachtungs-Sub-Entity, §8.2 + Stellungnahme-Side-Quest). */
export type AuftragTriggers = {
  typ?: string | null
  status?: string | null
  filmcheck_ok?: boolean | null
  gutachten_url?: string | null
  technische_stellungnahme_status?: string | null
  technische_stellungnahme_beauftragt_am?: string | null
  technische_stellungnahme_hochgeladen_am?: string | null
}

/** gutachten-Sub-Table — OCR/Erstellung (§8.2). */
export type GutachtenTriggers = {
  ocr_status?: string | null
  pdf_uploaded_at?: string | null
}

export type GutachterTerminRow = {
  id?: string
  fall_id?: string
  typ?: string | null
  status?: string | null
  start_zeit?: string | null
  sv_unterwegs_seit?: string | null
  sv_angekommen_am?: string | null
  durchgefuehrt_am?: string | null
  termin_erinnerung_5min_gesendet?: boolean | null
  nachbesichtigung_status?: string | null
}

export type WebhookEventRow = {
  event_type: string | null
  fall_id: string | null
  processed_at: string | null
  source: string | null
}

export type ResolverInput = {
  claim?: ClaimTriggers | null
  lead?: LeadTriggers | null
  kanzleiFall?: KanzleiFallTriggers | null
  auftraege?: AuftragTriggers[]
  gutachten?: GutachtenTriggers[]
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
  if (fieldName === 'cardentity_enriched_at') return 'webhook'
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

export function resolveSubphase(input: ResolverInput): SubphaseResult {
  const { claim, lead, kanzleiFall, auftraege, gutachten, gutachter_termine, webhook_events } = input
  const now = input.now ?? new Date()
  const triggers: TriggerField[] = []
  const szenario = (claim?.szenario as Szenario | null | undefined) ?? null

  // Owning-Auswahl aus den Sub-Entity-Listen:
  // - erstgutachten trägt QC/filmcheck/gutachten_url (§8.2).
  // - technische Stellungnahme kann auf irgendeinem Auftrag gesetzt sein (KB via prozess.ts).
  // - OCR lebt in der gutachten-Sub-Table.
  const auftraegeList = auftraege ?? []
  const erstgutachten = auftraegeList.find((a) => a.typ === 'erstgutachten') ?? auftraegeList[0] ?? null
  const stellungnahmeAuftrag = auftraegeList.find((a) => a.technische_stellungnahme_status != null) ?? null
  const stStatus = stellungnahmeAuftrag?.technische_stellungnahme_status ?? null
  const ocrGutachten = (gutachten ?? []).find((g) => g.ocr_status != null) ?? null
  const gutachtenHochgeladen = !!erstgutachten?.gutachten_url || (gutachten ?? []).some((g) => g.pdf_uploaded_at != null)

  // AAR-864: 'verlegt' (= Slot-Blocker während Verlegungs-Pending) und
  // 'verschoben' (= terminaler Verlegungs-Endzustand) gehören NICHT in
  // den aktiven Termin — sonst zeigt der Resolver „SV unterwegs" anhand
  // alter Tracking-Felder obwohl der Termin nicht mehr stattfindet.
  const aktTermin = (gutachter_termine ?? [])
    .filter((t) => !['storniert', 'verlegt', 'verschoben'].includes(t.status ?? ''))
    .sort((a, b) => ((b.durchgefuehrt_am ?? b.sv_angekommen_am ?? b.sv_unterwegs_seit ?? '') > (a.durchgefuehrt_am ?? a.sv_angekommen_am ?? a.sv_unterwegs_seit ?? '') ? 1 : -1))[0]

  // ══ Phase 9 — Abschluss (top-priorisiert, Abschluss überschreibt alles) ══
  // Owning: claims (abgeschlossen_am / google_review_gesendet / kanzlei_provision_status).
  if (claim?.abgeschlossen_am) {
    pushTrigger(triggers, 'abgeschlossen_am', true, claim.abgeschlossen_am)
    if (claim.kanzlei_provision_status === 'ausgezahlt') {
      return build(9, '9.3', 'Kanzlei-Abrechnung', szenario, triggers)
    }
    if (claim.google_review_gesendet !== true && addDays(claim.abgeschlossen_am, 1) < now) {
      pushTrigger(triggers, 'google_review_gesendet', false, null)
      return build(9, '9.2', 'Feedback ausstehend', szenario, triggers)
    }
    return build(9, '9.1', 'Geschlossen', szenario, triggers)
  }

  // ══ Phase 8 — Auszahlung (Split Kunde/SV — Erweiterung 5) ══
  // Owning: claims (DE-4-pending — regulierung_betrag/auszahlung_kunde derzeit
  // ungefüllt → inert; entspricht aktuellem View-Stand 0).
  if (claim?.regulierung_betrag != null) {
    pushTrigger(triggers, 'regulierung_betrag', claim.regulierung_betrag, null)
    pushTrigger(triggers, 'auszahlung_kunde_eingegangen_am', claim.auszahlung_kunde_eingegangen_am ?? null, claim.auszahlung_kunde_eingegangen_am ?? null)
    pushTrigger(triggers, 'auszahlung_gutachter_eingegangen_am', claim.auszahlung_gutachter_eingegangen_am ?? null, claim.auszahlung_gutachter_eingegangen_am ?? null)
    const kundeGez = !!claim.auszahlung_kunde_eingegangen_am
    const svGez = !!claim.auszahlung_gutachter_eingegangen_am
    if (kundeGez && svGez) return build(8, '8.3', 'Beide ausgezahlt — Schlussabrechnung', szenario, triggers)
    if (kundeGez && !svGez) return build(8, '8.2a', 'Kunde gezahlt, SV offen', szenario, triggers)
    if (svGez && !kundeGez) return build(8, '8.2b', 'SV gezahlt, Kunde offen', szenario, triggers)
    if (!kundeGez && !svGez) return build(8, '8.1', 'Beide Auszahlungen ausstehend', szenario, triggers)
  }

  // ══ Phase 7 — Rüge / Klage ══  (Owning: kanzlei_faelle + auftraege.technische_stellungnahme)
  if (kanzleiFall?.ruege_counter != null && kanzleiFall.ruege_counter >= 2) {
    pushTrigger(triggers, 'ruege_counter', kanzleiFall.ruege_counter, kanzleiFall.ruege_gesendet_am ?? null)
    // Erweiterung 2: 7.5a/7.5b Split auf 7d SLA
    if (szenario === 'klagefall') return build(7, '7.6', 'Klage-Entscheidung', szenario, triggers)
    if (!kanzleiFall.vs_reaktion_am && kanzleiFall.ruege_gesendet_am) {
      const slaBreachAt = addDays(kanzleiFall.ruege_gesendet_am, 7)
      if (now >= slaBreachAt) return build(7, '7.5b', 'Rüge 2 SLA-Breach (7d überschritten)', szenario, triggers)
      return build(7, '7.5a', 'Rüge 2 versendet — warte 7d', szenario, triggers)
    }
    return build(7, '7.5', 'Rüge 2 abgeschlossen', szenario, triggers)
  }

  if (kanzleiFall?.ruege_counter === 1) {
    pushTrigger(triggers, 'ruege_counter', 1, kanzleiFall.ruege_gesendet_am ?? null)
    if (!kanzleiFall.vs_reaktion_am) return build(7, '7.4', 'Warten auf VS nach Rüge 1', szenario, triggers)
    return build(7, '7.3', 'Rüge 1 versendet', szenario, triggers)
  }

  // Stellungnahme-Conditional (Erweiterung 3): nur bei technisch/gemischt
  if (stStatus === 'hochgeladen' || stStatus === 'freigegeben') {
    pushTrigger(triggers, 'technische_stellungnahme_status', stStatus, stellungnahmeAuftrag?.technische_stellungnahme_hochgeladen_am ?? null)
    return build(7, '7.2', 'Stellungnahme eingegangen', szenario, triggers)
  }
  if (
    stStatus === 'beauftragt' &&
    (kanzleiFall?.vs_kuerzungs_typ === 'technisch' || kanzleiFall?.vs_kuerzungs_typ === 'gemischt')
  ) {
    pushTrigger(triggers, 'technische_stellungnahme_status', 'beauftragt', stellungnahmeAuftrag?.technische_stellungnahme_beauftragt_am ?? null)
    pushTrigger(triggers, 'vs_kuerzungs_typ', kanzleiFall.vs_kuerzungs_typ, null)
    return build(7, '7.1', 'Technische Stellungnahme angefordert', szenario, triggers)
  }

  // ══ Phase 6 — VS-Reaktion (inkl. Quotierung — Erweiterung 1) ══  (Owning: kanzlei_faelle)
  // 6f: Quotierung
  if (kanzleiFall?.vs_reaktion_typ === 'quotiert' && kanzleiFall.vs_quote_prozent != null) {
    pushTrigger(triggers, 'vs_reaktion_typ', 'quotiert', kanzleiFall.vs_reaktion_am ?? null)
    pushTrigger(triggers, 'vs_quote_prozent', kanzleiFall.vs_quote_prozent, kanzleiFall.vs_reaktion_am ?? null)
    if (kanzleiFall.vs_quote_betrag_ausgezahlt != null) return build(6, '6f.3', 'Quote ausgezahlt', szenario, triggers)
    if (kanzleiFall.vs_quote_akzeptiert_am) return build(6, '6f.2', 'Quote akzeptiert', szenario, triggers)
    return build(6, '6f.1', 'Quote angekündigt', szenario, triggers)
  }

  // 6e: Nachbesichtigung — Owning: gutachter_termine.nachbesichtigung_status (§8.5)
  const nbTermin = (gutachter_termine ?? []).find(
    (t) => t.nachbesichtigung_status != null && t.nachbesichtigung_status !== 'nicht-angefordert',
  )
  if (nbTermin?.nachbesichtigung_status) {
    pushTrigger(triggers, 'nachbesichtigung_status', nbTermin.nachbesichtigung_status, null)
    return build(6, '6e', 'Nachbesichtigung angefordert', szenario, triggers)
  }

  // 6a/6b/6c: VS-Reaktion direkt
  if (kanzleiFall?.vs_reaktion_typ === 'voll_reguliert') {
    pushTrigger(triggers, 'vs_reaktion_typ', 'voll_reguliert', kanzleiFall.vs_reaktion_am ?? null)
    return build(6, '6a', 'VS reguliert vollständig', szenario, triggers)
  }
  if (kanzleiFall?.vs_reaktion_typ === 'gekuerzt' && (kanzleiFall.kuerzungs_betrag ?? 0) > 0) {
    pushTrigger(triggers, 'vs_reaktion_typ', 'gekuerzt', kanzleiFall.vs_reaktion_am ?? null)
    pushTrigger(triggers, 'kuerzungs_betrag', kanzleiFall.kuerzungs_betrag as number, kanzleiFall.vs_reaktion_am ?? null)
    if (kanzleiFall.vs_kuerzung_grund) pushTrigger(triggers, 'vs_kuerzung_grund', kanzleiFall.vs_kuerzung_grund, null)
    if (kanzleiFall.vs_kuerzungs_typ) pushTrigger(triggers, 'vs_kuerzungs_typ', kanzleiFall.vs_kuerzungs_typ, null)
    return build(6, '6b', 'VS kürzt', szenario, triggers)
  }
  if (kanzleiFall?.vs_reaktion_typ === 'abgelehnt') {
    pushTrigger(triggers, 'vs_reaktion_typ', 'abgelehnt', kanzleiFall.vs_reaktion_am ?? null)
    return build(6, '6c', 'VS lehnt ab', szenario, triggers)
  }

  // 6d: VS schweigt — 14d nach AS  (Owning: kanzlei_faelle.anschlussschreiben_sendedatum)
  if (
    kanzleiFall?.anschlussschreiben_sendedatum &&
    !kanzleiFall.vs_reaktion_typ &&
    addDays(kanzleiFall.anschlussschreiben_sendedatum, 14) < now
  ) {
    pushTrigger(triggers, 'anschlussschreiben_sendedatum', kanzleiFall.anschlussschreiben_sendedatum, kanzleiFall.anschlussschreiben_sendedatum)
    return build(6, '6d', 'VS schweigt (>14d)', szenario, triggers)
  }

  // ══ Phase 5 — Kanzlei ══  (Owning: claims.kanzlei_uebergeben_am + kanzlei_faelle-Details)
  if (claim?.kanzlei_uebergeben_am) {
    pushTrigger(triggers, 'kanzlei_uebergeben_am', true, claim.kanzlei_uebergeben_am)
    if (kanzleiFall?.anschlussschreiben_sendedatum) {
      pushTrigger(triggers, 'anschlussschreiben_sendedatum', kanzleiFall.anschlussschreiben_sendedatum, kanzleiFall.anschlussschreiben_sendedatum)
      // 5.5 Warten auf VS
      if (kanzleiFall.eskalation_tag_14_am || (kanzleiFall.vs_frist_bis && new Date(kanzleiFall.vs_frist_bis) < now)) {
        pushTrigger(triggers, 'eskalation_tag_14_am', kanzleiFall.eskalation_tag_14_am ?? null, kanzleiFall.eskalation_tag_14_am ?? null)
        return build(5, '5.5', 'Warten auf VS — erste Eskalation', szenario, triggers)
      }
      return build(5, '5.4', 'Anschlussschreiben versendet', szenario, triggers)
    }
    if (kanzleiFall?.mandatsnummer && !kanzleiFall.anschlussschreiben_am) {
      pushTrigger(triggers, 'mandatsnummer', kanzleiFall.mandatsnummer, null)
      return build(5, '5.3', 'Anschlussschreiben wird vorbereitet', szenario, triggers)
    }
    if (kanzleiFall?.mandatsnummer) {
      pushTrigger(triggers, 'mandatsnummer', kanzleiFall.mandatsnummer, null)
      return build(5, '5.2', 'Mandatsnummer vergeben', szenario, triggers)
    }
    return build(5, '5.1', 'Akte bei Kanzlei — wartet auf Mandatsnummer', szenario, triggers)
  }

  // ══ Phase 4 — Gutachten (inkl. Erweiterung 4: kb_filmcheck_bestanden) ══
  // Owning: auftraege (filmcheck_ok / gutachten_url) + gutachten (ocr_status / pdf_uploaded_at).
  const kbFilmcheckEvent = hasWebhookEvent(webhook_events, 'kb_filmcheck_bestanden')
  if (kbFilmcheckEvent.seen) {
    pushTrigger(triggers, 'kb_filmcheck_bestanden (webhook_events)', true, kbFilmcheckEvent.at)
    return build(4, '4.5', 'E-Akte → Kanzlei-Übergabe', szenario, triggers)
  }
  if (erstgutachten?.filmcheck_ok === true) {
    pushTrigger(triggers, 'filmcheck_ok', true, null)
    return build(4, '4.4', 'QC / Filmcheck bestanden', szenario, triggers)
  }
  if (ocrGutachten?.ocr_status) {
    pushTrigger(triggers, 'ocr_status', ocrGutachten.ocr_status, null)
    return build(4, '4.3', 'Kernwerte extrahiert (OCR)', szenario, triggers)
  }
  if (gutachtenHochgeladen) {
    pushTrigger(triggers, 'gutachten_url', true, null)
    return build(4, '4.2', 'Gutachten hochgeladen', szenario, triggers)
  }

  // ══ Phase 3 — Besichtigung ══  (Owning: gutachter_termine)
  if (aktTermin) {
    // AAR-864: Verlegung pending hat Vorrang — Termin kann zwar gerade noch
    // bestätigt sein, aber die Verlegungs-Anfrage des SV wartet auf Antwort.
    if (aktTermin.status === 'verlegung_pending') {
      pushTrigger(triggers, 'termin.status', 'verlegung_pending', null)
      return build(2, '2.7', 'Verlegung — Bestätigung ausstehend', szenario, triggers)
    }
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
  // 2.6 Termin-Erinnerung  (Owning: gutachter_termine.start_zeit + termin_erinnerung_5min_gesendet)
  if (aktTermin?.start_zeit) {
    const terminDate = new Date(aktTermin.start_zeit)
    const hoursUntil = (terminDate.getTime() - now.getTime()) / (1000 * 60 * 60)
    if (hoursUntil > 0 && hoursUntil < 24 && aktTermin.termin_erinnerung_5min_gesendet !== true) {
      pushTrigger(triggers, 'sv_termin', aktTermin.start_zeit, aktTermin.start_zeit)
      return build(2, '2.6', 'Termin-Erinnerung (<24h)', szenario, triggers)
    }
  }
  // 2.5 Dokumente-Nachreichung  (Owning: claims)
  if (claim?.dokumente_reminder_whatsapp_letzte_sendung) {
    pushTrigger(triggers, 'dokumente_reminder_whatsapp_letzte_sendung', true, claim.dokumente_reminder_whatsapp_letzte_sendung)
    return build(2, '2.5', 'Dokumente nachgereicht (Reminder)', szenario, triggers)
  }
  // 2.4 FIN-Call  (Owning: leads.fin / leads.cardentity_enriched_at — §8.6 Name-Mismatch)
  if (lead?.fin && !lead.cardentity_enriched_at) {
    pushTrigger(triggers, 'fin', lead.fin, null)
    return build(2, '2.4', 'FIN-Call zu CarDentity ausstehend', szenario, triggers)
  }
  // 2.3 ZB1 hochgeladen  (Owning: leads.zb1_status)
  if (lead?.zb1_status === 'bestaetigt' || lead?.zb1_status === 'hochgeladen') {
    if (!lead.fin) {
      pushTrigger(triggers, 'lead.zb1_status', lead.zb1_status, null)
      return build(2, '2.3', 'ZB1 hochgeladen — FIN ausstehend', szenario, triggers)
    }
  }
  // 2.2 Vollmacht bestätigt  (Owning: claims)
  if (claim?.vollmacht_status === 'bestaetigt' || claim?.vollmacht_geprueft_am) {
    pushTrigger(triggers, 'vollmacht_status', claim.vollmacht_status ?? 'geprueft', claim.vollmacht_geprueft_am ?? null)
    return build(2, '2.2', 'Vollmacht bestätigt', szenario, triggers)
  }
  // 2.1 Vollmacht ausstehend  (Owning: claims)
  if (
    claim?.sa_unterschrieben_am &&
    claim.service_typ === 'komplett' &&
    (claim.vollmacht_status == null || claim.vollmacht_status === 'ausstehend')
  ) {
    pushTrigger(triggers, 'sa_unterschrieben_am', true, claim.sa_unterschrieben_am)
    return build(2, '2.1', 'Vollmacht ausstehend', szenario, triggers)
  }

  // ══ Fallback: Phase 1 Ersterfassung ══
  return build(1, '1', `Phase unbekannt — status: ${claim?.status ?? '—'}`, szenario, triggers)
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
