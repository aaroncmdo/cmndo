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
}

// ─── Status-Farb-Slots (Token-basiert) ──────────────────────────────────────
// Alle Status-Badge-Farben werden auf diese 7 Slots gemappt statt hardkodiert.
// Neutrale UI-Farben: Claimondo-Tokens (#f8f9fb, #0D1B3E, #4573A2).
// Semantische Farben (success/warning/danger): emerald/amber/orange/red erlaubt.
const STATUS_SLOT_CLASSES = {
  neutral: 'bg-[#f8f9fb] text-claimondo-ondo',
  active:  'bg-[#4573A2]/10 text-[#4573A2]',
  pending: 'bg-amber-50 text-amber-700',
  done:    'bg-[#f8f9fb] text-claimondo-navy',
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
}

export const FALL_STATUS_COLORS: Record<string, string> = Object.fromEntries(
  Object.entries(FALL_STATUS_SLOT_MAP).map(([k, slot]) => [k, STATUS_SLOT_CLASSES[slot]]),
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

export const SCHADENS_URSACHE_COLORS: Record<string, string> = {
  wasserschaden: 'bg-claimondo-ondo/5 text-claimondo-light-blue',
  sachbeschaedigung: 'bg-orange-50 text-orange-700',
  brand: 'bg-red-50 text-red-700',
  einbruch: 'bg-purple-50 text-purple-700',
  sturmschaden: 'bg-cyan-50 text-cyan-700',
  vandalismus: 'bg-pink-50 text-pink-700',
  verschleiss: 'bg-amber-50 text-amber-700',
  sonstiges: 'bg-[#f8f9fb] text-claimondo-navy',
  kfz: 'bg-[#4573A2]/5 text-[#7BA3CC]',
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
  claimondo: 'bg-claimondo-navy text-[#7BA3CC]',
  'kanzlei-claimondo': 'bg-purple-950 text-purple-300',
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
