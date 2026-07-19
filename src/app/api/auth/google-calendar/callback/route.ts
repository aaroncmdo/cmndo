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
// gcal_refresh_token, gcal_token_expiry sind per Mig 20260719205103 GEDROPPT
// (dormant + authenticated-lesbar = Leak-Klasse); die OAuth-Tokens leben in
// profiles_oauth_secrets (service-role-only).

import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
// externalOrigin: hinter dem nginx/PM2-Proxy ist req.url-origin die interne
// Bind-Adresse (0.0.0.0:3000) → der SV-Kalender-OAuth-Ruecksprung lief ins Leere.
import { externalOrigin } from '@/lib/external-url'
import { upsertOAuthTokens } from '@/lib/oauth/secrets'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  if (!code) return NextResponse.redirect(new URL('/gutachter/profil?error=no_code', externalOrigin(req)))

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google-calendar/callback`

  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/gutachter/profil?error=config', externalOrigin(req)))

  try {
    // Token-Exchange
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) return NextResponse.redirect(new URL('/gutachter/profil?error=token_exchange', externalOrigin(req)))

    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.redirect(new URL('/login', externalOrigin(req)))

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

    // Tokens in die service-role-only Secret-Tabelle (Leak-Fix); Sync-Reader (oauth-client.ts,
    // sv-termin-sync, busy-slots, FreeBusy) lesen von dort. Wenn refresh_token nicht mitkommt
    // (Re-Connect ohne prompt=consent), bleibt der bestehende erhalten (upsert setzt nur Payload).
    // Benige Anzeige-Felder (email, connected_at) bleiben auf profiles.
    await upsertOAuthTokens(svc, user.id, 'google', {
      accessToken: tokens.access_token,
      expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString(),
      ...(tokens.refresh_token ? { refreshToken: tokens.refresh_token } : {}),
    })
    await svc.from('profiles').update({
      google_email: googleEmail,
      google_connected_at: new Date().toISOString(),
    }).eq('id', user.id)

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
    return NextResponse.redirect(new URL(returnTo, externalOrigin(req)))
  } catch (err) {
    console.error('[google-calendar/callback] Fehler:', err instanceof Error ? err.message : err)
    return NextResponse.redirect(new URL('/gutachter/profil?error=oauth_failed', externalOrigin(req)))
  }
}
