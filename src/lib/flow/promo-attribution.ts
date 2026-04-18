import { cookies } from 'next/headers'

// AAR-467 C1: Promo-Code-Attribution für den Kunden-Flow. Wenn ein User
// über einen Makler-Promo-Link auf /schaden-melden?p=MK-XXXX landet, wird
// der Code in ein Cookie geschrieben und beim späteren Lead-Insert (C2)
// in leads.promotion_code_id aufgelöst (→ Makler bekommt Provision).

const COOKIE_NAME = 'claimondo_promo'
const TTL_DAYS = 30

export async function readPromoCookie(): Promise<string | null> {
  const c = await cookies()
  return c.get(COOKIE_NAME)?.value ?? null
}

export async function writePromoCookie(code: string): Promise<void> {
  const c = await cookies()
  c.set(COOKIE_NAME, code, {
    maxAge: TTL_DAYS * 24 * 60 * 60,
    path: '/',
    sameSite: 'lax',
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
  })
}

export async function clearPromoCookie(): Promise<void> {
  const c = await cookies()
  c.delete(COOKIE_NAME)
}

/**
 * Validiert das Promo-Code-Format (Muster `MK-` + 4 Zeichen [A-Z0-9]).
 * Wird beim Pickup aus der URL sowie beim Auflösen im Server verwendet.
 */
export function isValidPromoCodeFormat(code: string): boolean {
  return /^MK-[A-Z0-9]{4}$/.test(code)
}
