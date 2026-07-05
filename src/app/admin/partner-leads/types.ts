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
  email: string
  telefon: string | null
  plz: string | null
  ort: string | null
  source_channel: string
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
