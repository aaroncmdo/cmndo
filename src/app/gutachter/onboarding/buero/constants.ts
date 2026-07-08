// KFZ-152: Buero-Onboarding Konstanten + Types (geteilt zwischen Server Actions und Client)
import { FINANCE } from '@/lib/finance/constants'

export type BueroPaket = 'standard' | 'pro' | 'premium'

export const PAKET_KONTINGENT: Record<BueroPaket, number> = {
  standard: 10,
  pro: 25,
  premium: 50,
}

// Anzahlung pro Fall im Kontingent — zentrale FINANCE-SSoT (analog Solo-Onboarding KFZ-148).
export const ANZAHLUNG_PRO_FALL = FINANCE.ANZAHLUNG_PRO_KONTINGENT

export function berechneStandortAnzahlung(paket: BueroPaket): number {
  return PAKET_KONTINGENT[paket] * ANZAHLUNG_PRO_FALL
}

export type BueroStandortInput = {
  name: string
  anschrift: string
  paket: BueroPaket
  // Geo-Koordinaten aus Google Places (Pflicht fuer KFZ-152 Phase 2 Lead-Dispatch)
  plz: string
  lat: number | null
  lng: number | null
  place_id: string
}
