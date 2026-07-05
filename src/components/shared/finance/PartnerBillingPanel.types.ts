import type { PartnerBillingRow, PartnerBillingAggregat } from '@/lib/finance/partner-billing'

export type { PartnerBillingRow, PartnerBillingAggregat }

export interface PartnerBillingPanelProps {
  rows: PartnerBillingRow[]
  aggregat: PartnerBillingAggregat
  /** Zeigt die Partner-Spalte in der Tabelle (sinnvoll wenn mehrere Partner dargestellt werden). */
  showPartnerColumn?: boolean
  /**
   * Wenn gesetzt, erscheint ein Schalter "USt-pflichtig / Kleinunternehmer"
   * am unteren Ende des Panels, der setzePartnerUstStatus aufruft.
   */
  ustToggle?: {
    partnerTyp: 'makler' | 'werkstatt' | 'marketing'
    partnerId: string
    /** Aktueller Wert: true = USt-pflichtig, false = Kleinunternehmer, null = unbekannt */
    current: boolean | null
  }
  /**
   * Wenn gesetzt, erscheint eine "Steuerdaten des Partners"-Card nach dem USt-Toggle.
   * makler ist bereits vollstaendig → readOnly=true zeigt Felder nur an.
   */
  steuerdaten?: {
    partnerTyp: 'makler' | 'werkstatt' | 'marketing'
    partnerId: string
    current: {
      ust_id: string | null
      adresse_strasse: string | null
      adresse_plz: string | null
      adresse_ort: string | null
    }
    /** makler ist bereits vollstaendig -> nur anzeigen, nicht editierbar. */
    readOnly?: boolean
  }
}
