// GEO-P2 SP2: pure Helfer für die NPS-Umfrage (Token, Rating, Expiry).
// Kein 'use server', keine DB — isoliert testbar. Genutzt von Cron + Response-Route.

/** Kryptographisch zufälliger Response-Token (64 hex; /upload-Muster verlangt >=16). */
export function generateResponseToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

/** ISO-Timestamp, N Tage in der Zukunft (default 30). */
export function tokenExpiryFromNow(tageGueltig = 30): string {
  return new Date(Date.now() + tageGueltig * 24 * 60 * 60 * 1000).toISOString()
}

/** true wenn kein/ungültiger/abgelaufener Expiry-Timestamp. */
export function isTokenExpired(expiresAtIso: string | null | undefined): boolean {
  if (!expiresAtIso) return true
  const t = new Date(expiresAtIso).getTime()
  if (Number.isNaN(t)) return true
  return t < Date.now()
}

/** NPS-Skala: Ganzzahl 0..10. */
export function isRatingValid(rating: unknown): rating is number {
  return typeof rating === 'number' && Number.isInteger(rating) && rating >= 0 && rating <= 10
}

/** App-relativer Pfad der Response-Route. */
export function npsResponsePath(token: string): string {
  return `/kunde-nps/${token}`
}
