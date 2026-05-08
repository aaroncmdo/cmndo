// AAR-OAuth-konsolidierung (2026-05-06): Tokens werden ab sofort in
// profiles.google_* gespeichert (nicht mehr in sachverstaendige.gcal_*).
// Hintergrund: ALLE Reader (oauth-client.ts, sv-termin-sync, busy-slots,
// FreeBusy) lesen ausschließlich profiles.google_* — der bisherige Schreib-
// Pfad in sachverstaendige.gcal_* war eine tote Sackgasse, daher knirschte
// der SV-Calendar-Sync seit AAR-694 ohne dass jemand es sofort merkte
// (Hasan/Shakib hatten Tokens in der falschen Spalte → invalid_grant beim
// Use, weil die Tokens in profiles entweder gar nicht oder nur durch den
// parallelen Mitarbeiter-Flow vorhanden waren).
//
// sachverstaendige.gcal_connected wird weiter gesetzt — als UI-Mirror-Flag
// für die einstellungen-Seite. Die Token-Spalten gcal_access_token,
// gcal_refresh_token, gcal_token_expiry werden NICHT mehr beschrieben und
// können später per Migration gedroppt werden.

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/gutachter/profil?error=no_code', req.url))

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google-calendar/callback`

  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/gutachter/profil?error=config', req.url))

  try {
    // Token-Exchange
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) return NextResponse.redirect(new URL('/gutachter/profil?error=token_exchange', req.url))

    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.redirect(new URL('/login', req.url))

    // Google-Email für Anzeige im Profil holen (best-effort, kein Showstopper)
    let googleEmail: string | null = null
    if (tokens.access_token) {
      try {
        const u = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        })
        if (u.ok) {
          const json = await u.json()
          googleEmail = json.email ?? null
        }
      } catch {
        /* ignore */
      }
    }

    const svc = createServiceClient()

    // Tokens in profiles.google_* speichern — kanonische Quelle für alle
    // Sync-Reader (oauth-client.ts, sv-termin-sync, busy-slots, FreeBusy).
    // Wenn refresh_token nicht mitkommt (Re-Connect ohne prompt=consent),
    // bestehenden Wert behalten.
    const profileUpdate: Record<string, unknown> = {
      google_access_token: tokens.access_token,
      google_token_expires_at: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      google_email: googleEmail,
      google_connected_at: new Date().toISOString(),
    }
    if (tokens.refresh_token) {
      profileUpdate.google_refresh_token = tokens.refresh_token
    }
    await svc.from('profiles').update(profileUpdate).eq('id', user.id)

    // sachverstaendige.gcal_connected als UI-Flag-Mirror — wird vom Profil
    // und Einstellungen-Tab gelesen. Die _token-Spalten werden bewusst NICHT
    // mehr beschrieben (Legacy, später per Migration droppen).
    await svc.from('sachverstaendige').update({ gcal_connected: true }).eq('profile_id', user.id)

    // AAR-242 Audit: state-Parameter als return-URL nutzen.
    const stateParam = req.nextUrl.searchParams.get('state')
    let returnTo = '/gutachter/profil?gcal=connected'
    if (stateParam) {
      try {
        const decoded = decodeURIComponent(stateParam)
        if (decoded.startsWith('/gutachter/')) returnTo = decoded
      } catch { /* invalid state — fallback to profil */ }
    }
    return NextResponse.redirect(new URL(returnTo, req.url))
  } catch (err) {
    console.error('[google-calendar/callback] Fehler:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(new URL('/gutachter/profil?error=oauth_failed', req.url))
  }
}
