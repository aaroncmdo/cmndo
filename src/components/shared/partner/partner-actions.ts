// Config-getriebenes Aktions-Set je Partner-Typ (Spec §6). Pure Daten (kein React) ->
// unit-testbar. CRM-Aktionen (notiz/anruf/email/einstufung) oeffnen das Aktivitaets-Modal;
// operative (verifizieren/freischalten/sperren/deeplinks) sind Deep-Links in den jeweils
// bestehenden Tab/Flow (keine Re-Implementierung -> keine Duplikation).
import type { PartnerTyp } from '@/lib/partner/aktivitaet-types'

export type PartnerActionKey =
  | 'notiz' | 'anruf' | 'email' | 'einstufung'
  | 'verifizieren' | 'freischalten' | 'sperren' | 'deeplinks'

export const CRM_ACTIONS = ['notiz', 'anruf', 'email', 'einstufung'] as const

export const PARTNER_ACTIONS: Record<PartnerTyp, PartnerActionKey[]> = {
  sv:        ['notiz', 'anruf', 'email', 'einstufung', 'verifizieren', 'freischalten', 'sperren'],
  werkstatt: ['notiz', 'anruf', 'email', 'einstufung', 'verifizieren', 'sperren'],
  makler:    ['notiz', 'anruf', 'email', 'einstufung'],
  flotte:    ['notiz', 'anruf', 'email', 'einstufung', 'deeplinks'],
}

export function aktionenFuer(partnerTyp: PartnerTyp): PartnerActionKey[] {
  return PARTNER_ACTIONS[partnerTyp]
}

export const AKTION_LABEL: Record<PartnerActionKey, string> = {
  notiz: 'Notiz',
  anruf: 'Anruf protokollieren',
  email: 'E-Mail',
  einstufung: 'Einstufung',
  verifizieren: 'Verifizieren',
  freischalten: 'Freischalten',
  sperren: 'Sperren',
  deeplinks: 'Konto & Karten',
}
