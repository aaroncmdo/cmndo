import { createAdminClient } from '@/lib/supabase/admin'

// Shared-Helper fuer Welcome-/Onboarding-Magic-Links + Passwort-Reset (Kunde, Werkstatt,
// SV, Makler, Flottenmanager, Team).
//
// HINTERGRUND: admin.generateLink({ type }) liefert einen IMPLICIT-#access_token-Hash im
// action_link. Den kann weder die PKCE-Client-Page noch die ?code-erwartende
// /api/auth/callback einloesen. Statt des action_link nutzen wir data.properties.hashed_token.
//
// PREFETCH-HAERTUNG (2026-07-14): der Link zeigt auf die KLICK-Bestaetigungs-Seite
// /auth/bestaetigen — dort loest ERST ein echter Nutzer-Klick (POST -> Server-Action)
// verifyOtp aus. Vorher zeigte er auf /api/auth/confirm, das verifyOtp schon beim GET
// ausfuehrte → Mail-Scanner/Prefetcher/Link-Preview verbrannten den Einmal-Token, bevor
// der Mensch klickte ("Link abgelaufen" trotz frischer Mail; auf prod beobachtet:
// /verify-303 zehn Sekunden nach dem Versand durch einen node-Client). GET auf die neue
// Seite rendert nur den Button und loest NICHTS ein.
//
// Rueckgabe: die fertige Bestaetigungs-URL, oder null bei Fehler (non-fatal — Caller schickt
// die Mail dann ohne Button bzw. mit Einmalpasswort-Fallback).
export async function buildWelcomeConfirmLink(
  email: string,
  type: 'magiclink' | 'recovery',
  next: string,
): Promise<string | null> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  try {
    const { data, error } = await createAdminClient().auth.admin.generateLink({ type, email })
    const tokenHash = data?.properties?.hashed_token
    if (error || !tokenHash) {
      console.error('[welcome-link] generateLink fehlgeschlagen:', error?.message ?? 'kein hashed_token')
      return null
    }
    return (
      `${appUrl}/auth/bestaetigen` +
      `?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=${type}` +
      `&next=${encodeURIComponent(next)}`
    )
  } catch (err) {
    console.error('[welcome-link] generateLink Exception:', err instanceof Error ? err.message : err)
    return null
  }
}
