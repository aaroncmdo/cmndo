// status-registry-skip: Partner-Prospect-CRM-Taxonomie (Vertriebs-Recruitment von
//   SV/Werkstatt/Makler) — eigenstaendig, orthogonal zur Claim/Fall/Lead-Pipeline, die
//   @/lib/status zentralisiert. Statusfarben bereits token-korrekt (success/warning/
//   danger-soft — token-audit gruen). Siehe AGENTS.md §status-registry.
// Geteilte Typen fuer das Partner-Vertriebsdashboard (/admin/partner-leads).
// Getrennt von actions.ts, weil aus 'use server'-Files keine const/type
// exportiert werden duerfen (AAR-664: Client-Bundle macht undefined daraus).

import type { PartnerRolle } from '@/lib/partner/policy'

/** Eine partner_leads-Zeile wie sie die Liste + der Detail-Drawer konsumiert. */
export type PartnerLeadRow = {
  id: string
  rolle: PartnerRolle
  status: PartnerLeadStatus
  firma: string | null
  ansprechpartner_vorname: string | null
  ansprechpartner_nachname: string | null
  email: string | null
  telefon: string | null
  plz: string | null
  ort: string | null
  source_channel: string
  einstufung: PartnerLeadEinstufung | null
  rollen_details: Record<string, unknown> | null
  zugewiesen_an: string | null
  konvertiert_zu_user_id: string | null
  konvertiert_zu_partner_id: string | null
  konvertiert_am: string | null
  notiz: string | null
  erstellt_am: string
  aktualisiert_am: string
}

/** Staff-Option fuer das Zuweisungs-Dropdown (admin/dispatch/leadbearbeiter). */
export type StaffOption = {
  id: string
  name: string
}

/**
 * Eine partner_lead_aktivitaeten-Zeile (Timeline im Detail-Drawer). Der
 * Bearbeiter-Name wird beim Laden (page.tsx) aus profiles aufgeloest und als
 * erstellt_von_name mitgeliefert (Row selbst haelt nur die uuid).
 */
export type PartnerLeadAktivitaetRow = {
  id: string
  partner_lead_id: string
  typ: PartnerAktivitaetTyp
  text: string | null
  erstellt_von: string | null
  erstellt_von_name: string | null
  erstellt_am: string
}

export const PARTNER_LEAD_STATUS = [
  'neu',
  'kontaktiert',
  'qualifiziert',
  'onboarding',
  'aktiv',
  'abgelehnt',
  'kein_interesse',
] as const
export type PartnerLeadStatus = (typeof PARTNER_LEAD_STATUS)[number]

export const PARTNER_LEAD_STATUS_LABELS: Record<PartnerLeadStatus, string> = {
  neu: 'Neu',
  kontaktiert: 'Kontaktiert',
  qualifiziert: 'Qualifiziert',
  onboarding: 'Onboarding',
  aktiv: 'Aktiv',
  abgelehnt: 'Abgelehnt',
  kein_interesse: 'Kein Interesse',
}

// Soft-Slot-Farben je Status (StatusBadge colorCls-Modus, token-gebunden).
export const PARTNER_LEAD_STATUS_COLORS: Record<PartnerLeadStatus, string> = {
  neu: 'bg-claimondo-ondo/10 text-claimondo-ondo',
  kontaktiert: 'bg-warning-soft text-warning-strong',
  qualifiziert: 'bg-info-soft text-info-strong',
  onboarding: 'bg-claimondo-navy/[0.06] text-claimondo-navy',
  aktiv: 'bg-success-soft text-success-strong',
  abgelehnt: 'bg-danger-soft text-danger-strong',
  kein_interesse: 'bg-claimondo-bg text-claimondo-shield',
}

export const PARTNER_ROLLE_LABELS: Record<PartnerRolle, string> = {
  sachverstaendiger: 'Sachverständiger',
  werkstatt: 'Werkstatt',
  makler: 'Makler',
}

export const PARTNER_SOURCE_CHANNEL_LABELS: Record<string, string> = {
  self_signup: 'Self-Signup',
  marketing_bewerbung: 'Marketing-Bewerbung',
  dat_import: 'DAT-Import',
  admin: 'Admin',
  empfehlung: 'Empfehlung',
}

// ─── Einstufung (Lead-Temperatur) ────────────────────────────────────────────

export const PARTNER_LEAD_EINSTUFUNG = ['heiss', 'warm', 'kalt'] as const
export type PartnerLeadEinstufung = (typeof PARTNER_LEAD_EINSTUFUNG)[number]

export const PARTNER_LEAD_EINSTUFUNG_LABELS: Record<PartnerLeadEinstufung, string> = {
  heiss: 'Heiß',
  warm: 'Warm',
  kalt: 'Kalt',
}

// Soft-Slot-Farben je Einstufung (StatusBadge colorCls-Modus, token-gebunden).
// heiss=danger (dringend/hohes Potenzial), warm=warning, kalt=info-soft.
export const PARTNER_LEAD_EINSTUFUNG_COLORS: Record<PartnerLeadEinstufung, string> = {
  heiss: 'bg-danger-soft text-danger-strong',
  warm: 'bg-warning-soft text-warning-strong',
  kalt: 'bg-info-soft text-info-strong',
}

// ─── Aktivitaets-Log ─────────────────────────────────────────────────────────

export const PARTNER_AKTIVITAET_TYP = [
  'anruf',
  'notiz',
  'email',
  'status_aenderung',
  'einstufung',
  'sonstiges',
] as const
export type PartnerAktivitaetTyp = (typeof PARTNER_AKTIVITAET_TYP)[number]

export const PARTNER_AKTIVITAET_TYP_LABELS: Record<PartnerAktivitaetTyp, string> = {
  anruf: 'Anruf',
  notiz: 'Notiz',
  email: 'E-Mail',
  status_aenderung: 'Status geändert',
  einstufung: 'Einstufung geändert',
  sonstiges: 'Sonstiges',
}

// Typen, die manuell im Drawer protokolliert werden koennen (Auto-Log-Typen
// status_aenderung/einstufung entstehen nur systemisch und sind hier NICHT dabei).
export const PARTNER_AKTIVITAET_MANUELL = ['anruf', 'notiz', 'email', 'sonstiges'] as const
