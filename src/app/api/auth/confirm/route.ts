import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { externalOrigin } from '@/lib/external-url'
import type { EmailOtpType } from '@supabase/supabase-js'

// Token-Hash-Confirm-Route — loest den systemischen admin.generateLink-Implicit-Hash-Bug.
//
// admin.generateLink({ type }) liefert inzwischen einen IMPLICIT-#access_token-Hash im
// action_link. Den kann WEDER die PKCE-Client-Page (/passwort-zuruecksetzen verarbeitet
// nur ?code) NOCH die server-seitige /api/auth/callback (erwartet ?code, sieht den Hash
// nicht — Fragment ist client-only) einloesen → Welcome-Magic-Links (Kunde/Werkstatt/SV/
// Team/Makler) fuehren zu "Link abgelaufen" bzw. "OAuth fehlgeschlagen".
//
// Loesung (offizieller @supabase/ssr-Weg): die Welcome-Links nutzen NICHT den action_link,
// sondern data.properties.hashed_token + zeigen hierher. verifyOtp({ token_hash, type })
// etabliert die Session server-seitig (Cookie), dann Redirect auf `next`. Deckt magiclink
// + recovery ab. `next` steuert das Ziel (z.B. /passwort-zuruecksetzen fuer Partner-Welcome,
// /kunde/onboarding fuer Kunde).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const origin = externalOrigin(request)

  // next validieren: nur interne absolute Pfade (kein //host, kein http://…) — Open-Redirect-Schutz.
  const nextParam = searchParams.get('next')
  const next = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
    console.error('[api/auth/confirm] verifyOtp fehlgeschlagen:', error.message)
  }

  return NextResponse.redirect(`${origin}/login?error=Link+ungueltig+oder+abgelaufen`)
}
