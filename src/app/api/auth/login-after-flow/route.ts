// CMM-14: Hard-redirect Login-Endpoint nach SA-Unterschrift.
//
// Server-Action `redirect()` nach Form-Submit triggert in Next.js eine
// Soft-Navigation via RSC-Stream — und genau dieser Stream-Request rennt
// in einer Race-Condition (Service-Worker-Lifecycle, Cookie-Propagation,
// Hydration) die zu einer weißen Seite führt. Erst ein manueller Reload
// behebt es.
//
// Lösung: klassischer HTTP-Endpoint. Browser-Form-Submit auf POST,
// signInWithPassword setzt Cookies via @supabase/ssr, NextResponse
// redirected mit Status 303 zu /passwort-aendern oder /kunde/onboarding.
// Browser macht eine echte Hard-Navigation — kein RSC-Stream, keine Race.

import { createClient } from '@/lib/supabase/server'

// CMM-14: Statt 303-Redirect rendert der Endpoint eine Mini-HTML-Page mit
// `<meta http-equiv="refresh">`. Hintergrund: Next.js fängt 303-Responses
// nach Form-Action ab und versucht eine Soft-Navigation via RSC-Stream —
// das geht beim ersten Page-Load schief (Whitescreen, Reload-fix). Mit
// einem echten HTML-Body + meta-refresh macht der Browser eine voll
// ausgehandelte Navigation, exakt wie ein normaler Reload — keine
// Stream-Race-Condition mehr möglich.

function htmlRedirect(target: string, label = 'Weiterleitung'): Response {
  const safe = target.replace(/"/g, '&quot;')
  const body = `<!DOCTYPE html><html lang="de"><head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0;url=${safe}" />
  <title>${label}</title>
  <style>body{margin:0;background:#f8f9fb;font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#0D1B3E}</style>
</head><body><p>${label} ...</p>
<script>window.location.replace(${JSON.stringify(target)})</script>
</body></html>`
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const email = String(formData.get('email') ?? '')
  const password = String(formData.get('password') ?? '')

  if (!email || !password) {
    return htmlRedirect('/login?error=Login-Daten+fehlen', 'Anmeldung fehlgeschlagen')
  }

  const supabase = await createClient()
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  if (signInError) {
    return htmlRedirect(
      `/login?error=${encodeURIComponent(signInError.message)}`,
      'Anmeldung fehlgeschlagen',
    )
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return htmlRedirect('/login?error=Auth-User+nicht+gefunden', 'Anmeldung fehlgeschlagen')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('force_password_change, auth_provider')
    .eq('id', user.id)
    .maybeSingle()

  const authProvider = (profile?.auth_provider as string | null) ?? 'email'
  if (profile?.force_password_change && authProvider === 'email') {
    return htmlRedirect('/passwort-aendern', 'Passwort ändern')
  }
  return htmlRedirect('/kunde/onboarding', 'Willkommen')
}
