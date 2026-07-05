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
}
