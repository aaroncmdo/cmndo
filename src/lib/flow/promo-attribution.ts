import { cookies } from 'next/headers'

// AAR-467 C1: Promo-Code-Attribution für den Kunden-Flow. Wenn ein User
// über einen Makler-Promo-Link auf /schaden-melden?p=MK-XXXX landet, wird
// der Code in ein Cookie geschrieben und beim späteren Lead-Insert (C2)
// in leads.promotion_code_id aufgelöst (→ Makler bekommt Provision).
//
// 15.05.2026: cookies().set() ist in Server-Components verboten — der
// Write-Helper wurde in src/lib/flow/promo-cookie-action.ts (eigene
// 'use server'-Datei mit setPromoCookie) extrahiert. Diese Datei behält
// nur den Read + den Format-Validator, weil beide aus Server-Components
// erlaubt sind (cookies().get ist read-only).

const COOKIE_NAME = 'claimondo_promo'

export async function readPromoCookie(): Promise<string | null> {
  const c = await cookies()
  return c.get(COOKIE_NAME)?.value ?? null
}

/**
 * Validiert das Promo-Code-Format (Muster `MK-` + 4 Zeichen [A-Z0-9]).
 * Wird beim Pickup aus der URL sowie beim Auflösen im Server verwendet.
 */
export function isValidPromoCodeFormat(code: string): boolean {
  return /^MK-[A-Z0-9]{4}$/.test(code)
}
