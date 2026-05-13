// ─── Zentrale Status-Labels ─────────────────────────────────────────────────
// Alle Stellen im Code die Status-Codes anzeigen muessen dieses Mapping nutzen.
// Interne Codes (VS-01, RG-01 etc) sollen NICHT dem Mitarbeiter angezeigt werden.

// ─── Fall-Status Phasen ─────────────────────────────────────────────────────

export const FALL_STATUS_LABELS: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  'flow-gesendet': 'FlowLink verschickt',
  onboarding: 'Kunde im Onboarding',
  // AAR-161: neue Subphasen aus der Subphasen-Matrix 15.04.2026
  erstgespraech: 'Erstgespräch läuft',
  'sv-gesucht': 'Gutachter wird gesucht',
  'termin-reserviert': 'Termin reserviert',
  'besichtigung-laeuft': 'Besichtigung läuft',
  'gutachten-bearbeitung': 'Gutachten in Bearbeitung',
  'gutachten-erstellt': 'Gutachten erstellt',
  'akte-uebergeben': 'Akte an Kanzlei übergeben',
  'as-vorbereitung': 'Anspruchsschreiben in Vorbereitung',
  'as-versendet': 'Anspruchsschreiben versendet',
  'warten-auf-vs': 'Wartet auf VS-Antwort',
  'vs-kuerzt': 'VS hat gekürzt',
  'vs-reguliert': 'VS reguliert vollständig',
  klage: 'An Kanzlei zur Klage übergeben',
  // Legacy-Codes — bleiben für Alt-Daten
  'sv-zugewiesen': 'Gutachter zugewiesen',
  'sv-termin': 'Termin vereinbart',
  besichtigung: 'Besichtigung läuft',
  'begutachtung-laeuft': 'Begutachtung läuft',
  'gutachten-eingegangen': 'Gutachten eingegangen',
  filmcheck: 'Qualitätsprüfung',
  'qc-pruefung': 'Qualitätsprüfung',
  'kanzlei-uebergeben': 'An Kanzlei übergeben',
  anschlussschreiben: 'Anspruchsschreiben gesendet',
  'as-gesendet': 'Anspruchsschreiben gesendet',
  regulierung: 'Regulierung läuft',
  'regulierung-laeuft': 'Regulierung läuft',
  'nachbesichtigung-laeuft': 'Nachbesichtigung läuft',
  'vs-regulierung': 'Regulierung läuft',
  'vs-abgelehnt': 'VS hat abgelehnt',
  'zahlung-eingegangen': 'Zahlung eingegangen',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
  // AAR-854 / Welle-7: zusätzliche faelle.status-Werte aus dem Trigger-Output
  // (map_claim_phase_to_faelle_phase) — Kanzlei-Dashboard-Sicht.
  in_bearbeitung: 'In Bearbeitung',
  vs_kontakt: 'VS-Kommunikation',
  reguliert: 'Reguliert',
  abgelehnt: 'Abgelehnt',
  kanzlei: 'An Kanzlei',
}

// AAR-frontend-konsolidierung-p1: Kurzlabels (Tabellen-Spalten / Makler-Sicht)
// — der Consumer fällt auf FALL_STATUS_LABELS zurück wenn kein Kurzlabel da ist.
export const FALL_STATUS_LABELS_SHORT: Record<string, string> = {
  ersterfassung: 'Ersterfassung',
  onboarding: 'Onboarding',
  'sv-gesucht': 'SV-Suche',
  'sv-zugewiesen': 'SV zugewiesen',
  'sv-termin': 'SV-Termin',
  besichtigung: 'Besichtigung',
  'begutachtung-laeuft': 'Begutachtung',
  'gutachten-eingegangen': 'Gutachten da',
  filmcheck: 'Filmcheck',
  'qc-pruefung': 'QC-Prüfung',
  'kanzlei-uebergeben': 'Kanzlei',
  anschlussschreiben: 'Anschlussschreiben',
  regulierung: 'Regulierung',
  'regulierung-laeuft': 'Regulierung',
  'nachbesichtigung-laeuft': 'Nachbesichtigung',
  'vs-abgelehnt': 'VS abgelehnt',
  'zahlung-eingegangen': 'Zahlung da',
  abgeschlossen: 'Abgeschlossen',
  storniert: 'Storniert',
}

// AAR-frontend-konsolidierung-p1: faelle.aktuelle_phase (Welle-7-Phasen-Enum aus
// map_claim_phase_to_faelle_phase) → grobe Kanzlei-Phasenbezeichnung.
export const AKTUELLE_PHASE_LABELS: Record<string, string> = {
  fallakte_wird_angelegt: 'Ersterfassung & Termin',
  fallakte_angelegt: 'Ersterfassung & Termin',
  termin_bestaetigt: 'Ersterfassung & Termin',
  sv_unterwegs: 'Begutachtung',
  sv_vor_ort: 'Begutachtung',
  begutachtung_abgeschlossen: 'Begutachtung',
  gutachten_wird_erstellt: 'Gutachten & QC',
  gutachten_erstellt: 'Gutachten & QC',
  qc_bestanden: 'Gutachten & QC',
  kanzlei_fallakte_angelegt: 'Kanzlei-Übergabe',
  warten_auf_vs: 'VS-Kommunikation',
  vs_kontakt_laeuft: 'VS-Kommunikation',
  vollzahlung_eingegangen: 'Reguliert',
  ablehnung_kanzlei_prueft: 'Abgelehnt',
  klage_eingereicht: 'Abgelehnt',
  fall_akzeptiert_storniert: 'Storniert',
}

// ─── Status-Farb-Slots (Token-basiert) ──────────────────────────────────────
// Alle Status-Badge-Farben werden auf diese 7 Slots gemappt statt hardkodiert.
// Neutrale UI-Farben: Claimondo-Tokens (#f8f9fb, #0D1B3E, #4573A2).
// Semantische Farben (success/warning/danger): emerald/amber/orange/red erlaubt.
const STATUS_SLOT_CLASSES = {
  neutral: 'bg-claimondo-bg text-claimondo-ondo',
  active:  'bg-claimondo-ondo/10 text-claimondo-ondo',
  pending: 'bg-amber-50 text-amber-700',
  done:    'bg-claimondo-bg text-claimondo-navy',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-orange-50 text-orange-700',
  danger:  'bg-red-50 text-red-700',
} as const

type StatusSlot = keyof typeof STATUS_SLOT_CLASSES

const FALL_STATUS_SLOT_MAP: Record<string, StatusSlot> = {
  // Aktuelle Phasen
  ersterfassung:         'neutral',
  'flow-gesendet':       'active',
  onboarding:            'neutral',
  erstgespraech:         'active',
  'sv-gesucht':          'active',
  'termin-reserviert':   'pending',
  'besichtigung-laeuft': 'active',
  'gutachten-bearbeitung': 'active',
  'gutachten-erstellt':  'done',
  'akte-uebergeben':     'active',
  'as-vorbereitung':     'active',
  'as-versendet':        'active',
  'warten-auf-vs':       'pending',
  'vs-kuerzt':           'warning',
  'vs-reguliert':        'success',
  klage:                 'danger',
  // Legacy-Codes
  'sv-zugewiesen':         'active',
  'sv-termin':             'pending',
  besichtigung:            'active',
  'begutachtung-laeuft':   'active',
  'gutachten-eingegangen': 'done',
  filmcheck:               'active',
  'qc-pruefung':           'active',
  'kanzlei-uebergeben':    'active',
  anschlussschreiben:      'active',
  'as-gesendet':           'active',
  regulierung:             'success',
  'regulierung-laeuft':    'success',
  'nachbesichtigung-laeuft': 'active',
  'vs-regulierung':        'success',
  'vs-abgelehnt':          'danger',
  'zahlung-eingegangen':   'success',
  abgeschlossen:           'success',
  storniert:               'danger',
  // AAR-854 / Welle-7-Status (Kanzlei)
  in_bearbeitung:          'pending',
  vs_kontakt:              'pending',
  reguliert:               'success',
  abgelehnt:               'danger',
  kanzlei:                 'active',
}

export const FALL_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(FALL_STATUS_SLOT_MAP).map(([k, slot]) => [k, STATUS_SLOT_CLASSES[slot]]),
)

// ─── auftraege.status (SV-Auftrags-Lifecycle, CMM-32f) ─────────────────────
// AAR-frontend-konsolidierung-p2 (P2-T2): zentral statt inline AUFTRAG_STATUS_KURZ.
export const AUFTRAG_STATUS_LABELS: Record<string, string> = {
  termin: 'Termin',
  besichtigung: 'Besichtigung',
  gutachten: 'Gutachten',
  abgeschlossen: 'Abgeschlossen',
}
const AUFTRAG_STATUS_SLOT_MAP: Record<string, StatusSlot> = {
  termin: 'pending',
  besichtigung: 'active',
  gutachten: 'active',
  abgeschlossen: 'success',
}
export const AUFTRAG_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(AUFTRAG_STATUS_SLOT_MAP).map(([k, slot]) => [k, STATUS_SLOT_CLASSES[slot]]),
)

// ─── abrechnungen.status (Rechnungs-/Abrechnungs-Lifecycle) ────────────────
// AAR-frontend-konsolidierung-p2 (P2-T2): zentral statt inline STATUS_COLORS.
export const ABRECHNUNG_STATUS_LABELS: Record<string, string> = {
  entwurf: 'Entwurf',
  versendet: 'Versendet',
  bezahlt: 'Bezahlt',
  ueberfaellig: 'Überfällig',
  storniert: 'Storniert',
}
const ABRECHNUNG_STATUS_SLOT_MAP: Record<string, StatusSlot> = {
  entwurf: 'neutral',
  versendet: 'active',
  bezahlt: 'success',
  ueberfaellig: 'danger',
  storniert: 'neutral',
}
export const ABRECHNUNG_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(ABRECHNUNG_STATUS_SLOT_MAP).map(([k, slot]) => [k, STATUS_SLOT_CLASSES[slot]]),
)

// ─── provisionen.status (Maik-/Google-Ads-Provisionen, AAR-92) ─────────────
// AAR-frontend-konsolidierung-p2 (P2-T2 Teil 2): zentral statt inline Ternary.
export const PROVISION_STATUS_LABELS: Record<string, string> = {
  pending: 'Ausstehend',
  confirmed: 'Bestätigt',
  paid: 'Ausgezahlt',
  reversed: 'Storniert',
}
const PROVISION_STATUS_SLOT_MAP: Record<string, StatusSlot> = {
  pending: 'pending',
  confirmed: 'success',
  paid: 'done',
  reversed: 'danger',
}
export const PROVISION_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(PROVISION_STATUS_SLOT_MAP).map(([k, slot]) => [k, STATUS_SLOT_CLASSES[slot]]),
)

// ─── Schadens-Ursache (Fallakte + Routen + Aufträge) ───────────────────────
// AAR-410: Zentral statt pro Component hartkodiert.

export const SCHADENS_URSACHE_LABELS: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
  kfz: 'Kfz-Schaden',
}

// Schadens-Ursache-Color-Map: pro Kategorie eindeutige visuelle Marke.
// Strict-Token-Compliance: nur Claimondo-Tonleiter + Semantic (red/orange/amber).
// Differenzierung über Tint-Stufen (claimondo-navy/10, claimondo-ondo/10, etc.)
// statt freie Tailwind-Defaults.
export const SCHADENS_URSACHE_COLORS: Record<string, string> = {
  wasserschaden: 'bg-claimondo-light-blue/[0.20] text-claimondo-navy',
  sachbeschaedigung: 'bg-orange-50 text-orange-700',
  brand: 'bg-red-50 text-red-700',
  einbruch: 'bg-claimondo-navy/[0.10] text-claimondo-navy',
  sturmschaden: 'bg-claimondo-ondo/[0.10] text-claimondo-ondo',
  vandalismus: 'bg-red-100 text-red-800',
  verschleiss: 'bg-amber-50 text-amber-700',
  sonstiges: 'bg-claimondo-bg text-claimondo-navy',
  kfz: 'bg-claimondo-shield/[0.15] text-claimondo-shield',
}

export function getUrsacheLabel(code: string | null | undefined): string {
  if (!code) return '—'
  return SCHADENS_URSACHE_LABELS[code] ?? code
}

// ─── VS-Timer Schritte (Kanzlei-Ansicht) ───────────────────────────────────

export const VS_STUFEN_LABELS: Record<string, string> = {
  'vs-01': 'Anspruchsschreiben gesendet (14-Tage-Frist)',
  'vs-02': 'Schadensabfrage eingegangen',
  'vs-03': 'Frist abgelaufen - Nachfrage',
  'vs-04': 'Regulierung angekuendigt',
  'vs-05': '1. Mahnung + Verzugszinsen',
  'vs-06': '2. Mahnung + Klageankuendigung',
  'vs-07': 'Klage-Entscheidung',
}

export const VS_STUFEN_SHORT: Record<string, string> = {
  'vs-01': 'AS gesendet',
  'vs-02': 'Abfrage eingegangen',
  'vs-03': 'Frist abgelaufen',
  'vs-04': 'Regulierung angek.',
  'vs-05': '1. Mahnung',
  'vs-06': '2. Mahnung + Klage',
  'vs-07': 'Klage',
}

// ─── RG-Pfad (bei Kuerzung) ────────────────────────────────────────────────

export const RG_STUFEN_LABELS: Record<string, string> = {
  'rg-01': 'Kuerzung eingegangen - Analyse',
  'rg-02': 'Ruegeschreiben in Vorbereitung',
  'rg-03': 'Ruegeschreiben gesendet (neue 14-Tage-Frist)',
  'rg-04': 'Frist abgelaufen - Nachfrage',
  'rg-05': 'Nachzahlung eingegangen',
  'rg-06': 'Vergleich (mit Mandanten-Zustimmung)',
  'rg-07': 'Klage eingereicht',
}

// ─── Schadenfall-Typen ──────────────────────────────────────────────────────

export const SF_LABELS: Record<string, string> = {
  'sf-01': 'Unverschuldeter Kfz-Unfall',
  'sf-02': 'Teilschuld-Unfall',
  'sf-03': 'Parkschaden / Fahrerflucht',
  'sf-04': 'Eigenverschulden / kein Gegner',
  'sf-05': 'Personenschaden',
  'sf-06': 'Nutzungsausfall / Mietwagen',
}

// ─── Kunden-Konstellationen ─────────────────────────────────────────────────

export const KK_LABELS: Record<string, string> = {
  'kk-01': 'Privatperson eigenes Fahrzeug',
  'kk-02': 'Leasing-Fahrzeug',
  'kk-03': 'Finanziertes Fahrzeug',
  'kk-04': 'Firmenfahrzeug',
  'kk-05': 'Halter ungleich Fahrer',
}

// ─── Lead-Qualifizierungs-Phasen ────────────────────────────────────────────

export const LEAD_PHASE_LABELS: Record<string, string> = {
  neu: 'Neu',
  erstkontakt: 'Erstkontakt hergestellt',
  'schadentyp-erfasst': 'Schadentyp erfasst',
  'konstellation-erfasst': 'Konstellation erfasst',
  'gegner-daten': 'Gegner-Daten erfasst',
  gutachtertermin: 'Gutachtertermin vereinbart',
  'sa-unterschrieben': 'SA + Vollmacht unterschrieben',
  'flow-gesendet': 'FlowLink versendet',
  abgeschlossen: 'Lead abgeschlossen',
}

// ─── Mandatstyp ─────────────────────────────────────────────────────────────

export const MANDATSTYP_LABELS: Record<string, string> = {
  claimondo: 'Nur Claimondo',
  'kanzlei-claimondo': 'Kanzlei + Claimondo',
}

export const MANDATSTYP_COLORS: Record<string, string> = {
  claimondo: 'bg-claimondo-navy text-claimondo-light-blue',
  'kanzlei-claimondo': 'bg-claimondo-shield text-claimondo-light-blue',
}

// ─── Helper: Label fuer beliebigen Status-Code ─────────────────────────────

export function getStatusLabel(code: string): string {
  return FALL_STATUS_LABELS[code]
    ?? VS_STUFEN_LABELS[code]
    ?? RG_STUFEN_LABELS[code]
    ?? SF_LABELS[code]
    ?? KK_LABELS[code]
    ?? LEAD_PHASE_LABELS[code]
    ?? code
}
