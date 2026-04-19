// AAR-539 (C2): Config für den Kanzlei-Paket-Reader.
// Jede Paket-Art ist einer Phase zugeordnet und definiert:
// - die Felder die aus dem Paket in faelle übernommen werden
// - den C3-Endpoint-Event der ausgelöst wird (Handler aus process-event.ts)
// - optional einen File-Upload mit Ziel-slot_id
// - eine Side-Effect-Preview für die UI
//
// Philosophie: statt 10+ separate „Aktion"-Buttons ein einheitliches Modal,
// das je nach aktueller Phase die passenden Paket-Typen filtert.

import type { LexDriveEvent } from '@/lib/lexdrive/process-event'

export type FieldType =
  | 'text'
  | 'date'
  | 'datetime'
  | 'number'
  | 'currency'
  | 'textarea'
  | 'select'
  | 'file'
  | 'computed'

export interface FieldDef {
  name: string
  label: string
  type: FieldType
  required?: boolean
  options?: Array<{ value: string; label: string }>
  computed?: (values: Record<string, unknown>) => unknown
  hint?: string
  placeholder?: string
}

export interface PaketTyp {
  id: string
  label: string
  phase: number
  subphase_from: string
  subphase_to: string
  fields: FieldDef[]
  file_upload?: { field: string; slot_id: string; label: string }
  endpoint_event: LexDriveEvent
  side_effects: string[]
}

// Helper: addiere Tage zu einem ISO-Datum
function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export const KANZLEI_PAKETE: PaketTyp[] = [
  // ──────────── Phase 5: Kanzlei-Bearbeitung ────────────
  {
    id: 'mandats_paket',
    label: 'Mandats-Paket (Salesforce-Nummern)',
    phase: 5,
    subphase_from: '5.1',
    subphase_to: '5.2',
    endpoint_event: 'mandatsnummer_vergeben',
    fields: [
      { name: 'mandats_nr', label: 'Mandatsnummer', type: 'text', required: true },
      { name: 'beschreibung', label: 'Anmerkung', type: 'textarea' },
    ],
    side_effects: [
      'Setzt faelle.mandatsnummer + as_salesforce_id',
      'Timeline-Event „Mandatsnummer vergeben"',
      'webhook_events-Audit (source=manual_admin)',
    ],
  },
  {
    id: 'as_paket',
    label: 'AS-Paket (Anspruchsschreiben)',
    phase: 5,
    subphase_from: '5.3',
    subphase_to: '5.4',
    endpoint_event: 'as_versendet',
    fields: [
      { name: 'datum', label: 'AS-Sendedatum', type: 'date', required: true },
      {
        name: 'frist_bis',
        label: 'VS-Frist bis (automatisch: +14 Tage)',
        type: 'computed',
        computed: (v) => (typeof v.datum === 'string' && v.datum ? addDays(v.datum, 14) : ''),
        hint: 'Wird aus dem Sendedatum berechnet (+14 Tage).',
      },
      { name: 'betrag', label: 'Geforderte Summe (EUR)', type: 'currency' },
      { name: 'beschreibung', label: 'Interne Notiz', type: 'textarea' },
    ],
    file_upload: {
      field: 'anschlussschreiben_pdf',
      slot_id: 'anschlussschreiben',
      label: 'AS-PDF hochladen',
    },
    side_effects: [
      'Setzt anschlussschreiben_am + Startet AS→VS-Frist-SLA',
      'WhatsApp-Template T-AS an Kunden',
      'Phase rückt auf 5.4',
    ],
  },

  // ──────────── Phase 6: VS-Reaktion ────────────
  {
    id: 'vs_reguliert_paket',
    label: 'VS reguliert voll',
    phase: 6,
    subphase_from: '6.0',
    subphase_to: '6a.1',
    endpoint_event: 'vs_reguliert_voll',
    fields: [
      { name: 'datum', label: 'Reaktionsdatum', type: 'date', required: true },
      { name: 'betrag', label: 'Regulierungs-Betrag (EUR)', type: 'currency', required: true },
      { name: 'beschreibung', label: 'Anmerkung', type: 'textarea' },
    ],
    side_effects: [
      'Setzt vs_reaktion_typ=voll_reguliert',
      'WhatsApp-Regulierung-angekündigt an Kunden',
      'Phase → regulierung-läuft',
    ],
  },
  {
    id: 'vs_kuerzt_paket',
    label: 'VS kürzt (technisch / argumentativ / gemischt)',
    phase: 6,
    subphase_from: '6.0',
    subphase_to: '6b',
    endpoint_event: 'vs_kuerzt',
    fields: [
      { name: 'datum', label: 'Reaktionsdatum', type: 'date', required: true },
      {
        name: 'vs_kuerzungs_typ',
        label: 'Kürzungs-Typ',
        type: 'select',
        required: true,
        options: [
          { value: 'technisch', label: 'Technisch (→ Stellungnahme)' },
          { value: 'argumentativ', label: 'Argumentativ (→ Rüge 1)' },
          { value: 'gemischt', label: 'Gemischt (→ Stellungnahme)' },
        ],
        hint: 'Technisch/Gemischt löst automatisch „technische Stellungnahme beauftragt" aus.',
      },
      { name: 'kuerzungs_betrag', label: 'Kürzungs-Betrag (EUR)', type: 'currency' },
      { name: 'anerkannt_betrag', label: 'Anerkannter Betrag (EUR)', type: 'currency' },
      { name: 'grund', label: 'Kürzungs-Grund', type: 'textarea', required: true },
    ],
    side_effects: [
      'Setzt vs_reaktion_typ=gekuerzt + vs_kuerzungs_typ + kuerzungs_betrag',
      'Bei technisch/gemischt: Auto-Trigger technische_stellungnahme_benoetigt',
      'Bei argumentativ: KB-Mitteilung „Rüge 1 vorbereiten"',
    ],
  },
  {
    id: 'vs_quotiert_paket',
    label: 'VS quotiert (Teil-Einigung)',
    phase: 6,
    subphase_from: '6.0',
    subphase_to: '6f',
    endpoint_event: 'vs_quotiert',
    fields: [
      { name: 'datum', label: 'Reaktionsdatum', type: 'date', required: true },
      { name: 'vs_quote_prozent', label: 'Quote (%)', type: 'number', required: true },
      { name: 'vs_quote_grund', label: 'Quote-Begründung', type: 'textarea', required: true },
    ],
    side_effects: [
      'Setzt vs_quote_prozent + vs_quote_grund + vs_reaktion_typ=quotiert',
      'KB-Mitteilung „VS hat Quotierung angeboten"',
    ],
  },
  {
    id: 'vs_ablehnung_paket',
    label: 'VS lehnt ab',
    phase: 6,
    subphase_from: '6.0',
    subphase_to: '6c',
    endpoint_event: 'vs_ablehnung',
    fields: [
      { name: 'datum', label: 'Reaktionsdatum', type: 'date', required: true },
      { name: 'grund', label: 'Ablehnungsgrund', type: 'textarea', required: true },
    ],
    side_effects: [
      'Setzt vs_reaktion_typ=abgelehnt + vs_ablehnungsgrund',
      'Phase → vs-abgelehnt',
    ],
  },
  {
    id: 'vs_nachbesichtigung_paket',
    label: 'VS fordert Nachbesichtigung',
    phase: 6,
    subphase_from: '6.0',
    subphase_to: '6e.1',
    endpoint_event: 'vs_nachbesichtigung_angefordert',
    fields: [
      { name: 'datum', label: 'Anforderungsdatum', type: 'date', required: true },
      { name: 'beschreibung', label: 'Hinweis der VS', type: 'textarea' },
    ],
    side_effects: [
      'Setzt nachbesichtigung_status=angefordert',
      'Phase → nachbesichtigung-läuft',
    ],
  },

  // ──────────── Phase 7: Stellungnahme + Rüge ────────────
  {
    id: 'stellungnahme_eingegangen_paket',
    label: 'Technische Stellungnahme eingegangen',
    phase: 7,
    subphase_from: '7.1',
    subphase_to: '7.2',
    endpoint_event: 'sv_stellungnahme_eingereicht',
    fields: [
      { name: 'eingereicht_am', label: 'Eingereicht am', type: 'date', required: true },
      { name: 'notiz_sv', label: 'SV-Notiz', type: 'textarea' },
    ],
    file_upload: {
      field: 'stellungnahme_pdf',
      slot_id: 'stellungnahme',
      label: 'Stellungnahme-PDF hochladen',
    },
    side_effects: [
      'Setzt technische_stellungnahme_status=hochgeladen',
      'KB-Mitteilung „Freigabe erforderlich"',
    ],
  },
  {
    id: 'ruege_1_paket',
    label: 'Rüge 1 versendet',
    phase: 7,
    subphase_from: '7.2',
    subphase_to: '7.3',
    endpoint_event: 'ruege_1_gesendet',
    fields: [
      { name: 'datum', label: 'Sendedatum Rüge 1', type: 'date', required: true },
      { name: 'beschreibung', label: 'Anmerkung', type: 'textarea' },
    ],
    side_effects: [
      'Setzt ruege_gesendet_am + ruege_counter=1',
      'Startet SLA vs_antwort_ruege1_14 (14 Tage)',
    ],
  },
  {
    id: 'ruege_2_paket',
    label: 'Rüge 2 versendet',
    phase: 7,
    subphase_from: '7.3',
    subphase_to: '7.4',
    endpoint_event: 'ruege_2_gesendet',
    fields: [
      { name: 'datum', label: 'Sendedatum Rüge 2', type: 'date', required: true },
      { name: 'beschreibung', label: 'Anmerkung', type: 'textarea' },
    ],
    side_effects: [
      'Setzt ruege_counter=2',
      'Startet SLA vs_antwort_ruege2_7 (7 Tage, verkürzt)',
    ],
  },

  // ──────────── Phase 8: Regulierung + Auszahlung ────────────
  {
    id: 'auszahlung_split_paket',
    label: 'Auszahlung eingegangen (Split)',
    phase: 8,
    subphase_from: '8.2',
    subphase_to: '8.3',
    endpoint_event: 'auszahlung_split_eingegangen',
    fields: [
      { name: 'auszahlung_kunde_betrag', label: 'Kunden-Betrag (EUR)', type: 'currency' },
      { name: 'auszahlung_kunde_eingegangen_am', label: 'Kunden-Eingang am', type: 'date' },
      { name: 'auszahlung_gutachter_eingegangen_am', label: 'SV-Honorar-Eingang am', type: 'date' },
      {
        name: 'zahlungsweg',
        label: 'Zahlungsweg',
        type: 'select',
        options: [
          { value: 'banktransfer_direkt', label: 'Banktransfer direkt' },
          { value: 'fremdkonto_kanzlei', label: 'Fremdkonto Kanzlei' },
          { value: 'sammelueberweisung', label: 'Sammelüberweisung' },
        ],
      },
      { name: 'vs_referenznummer', label: 'VS-Referenznummer', type: 'text' },
    ],
    side_effects: [
      'Setzt auszahlung_kunde_* / auszahlung_gutachter_*',
      'Rollen-gefilterte Mitteilungen (Kunde/SV/KB)',
      'Phase → zahlung-eingegangen',
    ],
  },

  // ──────────── Phase 9: Abschluss ────────────
  {
    id: 'fall_geschlossen_paket',
    label: 'Fall schließen',
    phase: 9,
    subphase_from: '9.0',
    subphase_to: '9.1',
    endpoint_event: 'fall_geschlossen',
    fields: [
      { name: 'datum', label: 'Abschlussdatum', type: 'date', required: true },
      {
        name: 'grund',
        label: 'Schließungs-Grund',
        type: 'select',
        required: true,
        options: [
          { value: 'regulierung_vollstaendig', label: 'Regulierung vollständig' },
          { value: 'quote_akzeptiert', label: 'Quote akzeptiert' },
          { value: 'klage_uebergeben', label: 'Klage übergeben' },
          { value: 'storno_kunde', label: 'Storno (Kunde)' },
          { value: 'kein_anspruch', label: 'Kein Anspruch' },
        ],
      },
      { name: 'beschreibung', label: 'Schluss-Notiz', type: 'textarea' },
    ],
    side_effects: [
      'Setzt abgeschlossen_am + geschlossen_grund + status=abgeschlossen',
      'Beendet alle offenen SLA-Tracking-Einträge',
    ],
  },
]

/**
 * Filtert die Paket-Typen nach aktueller Phase (±1 für Übergangs-Fälle).
 * phase kommt von SubphaseResult.phase (Zahl 1-9).
 */
export function getPaketeForPhase(phase: number): PaketTyp[] {
  return KANZLEI_PAKETE.filter((p) => Math.abs(p.phase - phase) <= 1)
}

export function findPaketById(id: string): PaketTyp | null {
  return KANZLEI_PAKETE.find((p) => p.id === id) ?? null
}
