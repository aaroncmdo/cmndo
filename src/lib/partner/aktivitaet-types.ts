// Polymorphe Partner-Aktivitaet (Cockpit): Types + Typ-Mengen. In lib/ (kein lib->app),
// damit Domain/Helper/Actions/Komponenten sie teilen. Muss mit den DB-CHECKs in
// supabase/migrations/<V>_partner_aktivitaeten.sql uebereinstimmen.

export type PartnerTyp = 'sv' | 'makler' | 'werkstatt' | 'flotte'

export const PARTNER_AKTIVITAET_TYPEN = [
  'anruf', 'notiz', 'email', 'einstufung', 'sonstiges',
  'freigeschaltet', 'gesperrt', 'verifiziert', 'vertrag',
  'lead_zugewiesen', 'provision', 'statuswechsel',
] as const
export type PartnerAktivitaetTyp = (typeof PARTNER_AKTIVITAET_TYPEN)[number]

// Typen, die Nutzer manuell protokollieren duerfen (System-Events entstehen nur via logPartnerEvent).
export const PARTNER_AKTIVITAET_MANUELL = ['anruf', 'notiz', 'email', 'einstufung', 'sonstiges'] as const
export type PartnerAktivitaetManuellTyp = (typeof PARTNER_AKTIVITAET_MANUELL)[number]

export type PartnerAktivitaetRow = {
  id: string
  partner_typ: PartnerTyp
  partner_id: string
  typ: PartnerAktivitaetTyp
  text: string
  meta: Record<string, unknown> | null
  ist_system: boolean
  erstellt_von: string | null
  erstellt_am: string
}
