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

export const FALL_STATUS_COLORS: Record<string, string> = {
  ersterfassung: 'bg-blue-950 text-[#7BA3CC] border-[#1E3A5F]',
  'flow-gesendet': 'bg-violet-950 text-violet-300 border-violet-800',
  onboarding: 'bg-pink-950 text-pink-300 border-pink-800',
  // AAR-161: neue Subphasen — gleiche Farblogik wie bestehende Alias-Codes
  erstgespraech: 'bg-blue-950 text-[#7BA3CC] border-[#1E3A5F]',
  'sv-gesucht': 'bg-blue-950 text-[#7BA3CC] border-[#1E3A5F]',
  'termin-reserviert': 'bg-yellow-950 text-yellow-300 border-yellow-800',
  'besichtigung-laeuft': 'bg-teal-950 text-teal-300 border-teal-800',
  'gutachten-bearbeitung': 'bg-teal-950 text-teal-300 border-teal-800',
  'gutachten-erstellt': 'bg-orange-950 text-orange-300 border-orange-800',
  'akte-uebergeben': 'bg-cyan-950 text-cyan-300 border-cyan-800',
  'as-vorbereitung': 'bg-cyan-950 text-cyan-300 border-cyan-800',
  'as-versendet': 'bg-cyan-950 text-cyan-300 border-cyan-800',
  'warten-auf-vs': 'bg-cyan-950 text-cyan-300 border-cyan-800',
  'vs-kuerzt': 'bg-amber-950 text-amber-300 border-amber-800',
  'vs-reguliert': 'bg-green-950 text-green-300 border-green-800',
  klage: 'bg-red-950 text-red-300 border-red-800',
  // Legacy-Codes
  'sv-zugewiesen': 'bg-blue-950 text-[#7BA3CC] border-[#1E3A5F]',
  'sv-termin': 'bg-yellow-950 text-yellow-300 border-yellow-800',
  besichtigung: 'bg-teal-950 text-teal-300 border-teal-800',
  'begutachtung-laeuft': 'bg-teal-950 text-teal-300 border-teal-800',
  'gutachten-eingegangen': 'bg-orange-950 text-orange-300 border-orange-800',
  filmcheck: 'bg-purple-950 text-purple-300 border-purple-800',
  'qc-pruefung': 'bg-purple-950 text-purple-300 border-purple-800',
  'kanzlei-uebergeben': 'bg-cyan-950 text-cyan-300 border-cyan-800',
  anschlussschreiben: 'bg-cyan-950 text-cyan-300 border-cyan-800',
  regulierung: 'bg-green-950 text-green-300 border-green-800',
  'regulierung-laeuft': 'bg-green-950 text-green-300 border-green-800',
  'nachbesichtigung-laeuft': 'bg-violet-950 text-violet-300 border-violet-800',
  'vs-regulierung': 'bg-green-950 text-green-300 border-green-800',
  'vs-abgelehnt': 'bg-red-950 text-red-300 border-red-800',
  'zahlung-eingegangen': 'bg-emerald-950 text-emerald-300 border-emerald-800',
  abgeschlossen: 'bg-emerald-950 text-emerald-300 border-emerald-800',
  storniert: 'bg-red-950 text-red-300 border-red-800',
}

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
  wasserschaden: 'bg-[#4573A2]/5 text-[#7BA3CC]',
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
  claimondo: 'bg-blue-950 text-[#7BA3CC]',
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
