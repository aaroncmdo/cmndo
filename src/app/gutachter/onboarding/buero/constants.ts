// KFZ-152: Buero-Onboarding Konstanten + Types (geteilt zwischen Server Actions und Client)

export type BueroPaket = 'standard' | 'pro' | 'premium'

export const PAKET_KONTINGENT: Record<BueroPaket, number> = {
  standard: 10,
  pro: 25,
  premium: 50,
}

// 150 EUR netto Anzahlung pro Fall im Kontingent (analog Solo-Onboarding KFZ-148)
export const ANZAHLUNG_PRO_FALL = 150

export function berechneStandortAnzahlung(paket: BueroPaket): number {
  return PAKET_KONTINGENT[paket] * ANZAHLUNG_PRO_FALL
}

export type BueroStandortInput = {
  name: string
  anschrift: string
  paket: BueroPaket
}
