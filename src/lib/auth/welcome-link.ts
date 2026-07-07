import { createAdminClient } from '@/lib/supabase/admin'

// Shared-Helper fuer Welcome-/Onboarding-Magic-Links (Kunde, Werkstatt, SV, Makler, Team).
//
// HINTERGRUND: admin.generateLink({ type }) liefert inzwischen einen IMPLICIT-#access_token-
// Hash im action_link. Den kann weder die PKCE-Client-Page (/passwort-zuruecksetzen)
// noch die ?code-erwartende /api/auth/callback einloesen → alle Welcome-Magic-Links
// waren tot ("Link abgelaufen" / "OAuth fehlgeschlagen"). Statt des action_link nutzen wir
// data.properties.hashed_token + die /api/auth/confirm-Route: die ruft verifyOtp server-
// seitig auf (etabliert die Session als Cookie) und leitet dann auf `next` weiter.
//
// Rueckgabe: die fertige Confirm-URL, oder null bei Fehler (non-fatal — Caller schickt die
// Mail dann ohne Button bzw. mit Einmalpasswort-Fallback).
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
      `${appUrl}/api/auth/confirm` +
      `?token_hash=${encodeURIComponent(tokenHash)}` +
      `&type=${type}` +
      `&next=${encodeURIComponent(next)}`
    )
  } catch (err) {
    console.error('[welcome-link] generateLink Exception:', err instanceof Error ? err.message : err)
    return null
  }
}
