// CMM-14 Observability-Endpoint. Die Error-Boundaries (error.tsx /
// global-error.tsx / login/error.tsx) POSTen hierhin fire-and-forget, damit der
// exakte digest+stack des naechsten "lila Root-Crash" in client_error_log landet
// und per Supabase-MCP auslesbar ist (kein Sentry-Zugriff noetig).
//
// Public-Pfad (/api ist in middleware.isPublicPath) — Fehler koennen pre- und
// post-auth passieren. Insert laeuft ueber den Service-Role-Client (bypasst RLS).
// Der Handler darf NIE selbst werfen — sonst wuerde die Fehler-Erfassung den
// Fehlerfall verschlimmern.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { istErlaubterBoundary } from '@/lib/observability/boundaries'

export const runtime = 'nodejs'

function cap(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed
}

// Kanalliste liegt in @/lib/observability/boundaries — ein Test prueft dort,
// dass jeder Melder einen erlaubten Kanal nutzt. Ein hier fehlender Kanal wird
// still zu 'unknown' und ist danach nicht mehr auswertbar.

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return new NextResponse(null, { status: 204 })

    const boundaryRaw = cap(body.boundary, 32) ?? 'unknown'
    const boundary = istErlaubterBoundary(boundaryRaw) ? boundaryRaw : 'unknown'

    // User optional anhaengen — Fehler koennen unauthenticated passieren, und die
    // Erfassung darf daran nicht scheitern.
    let userId: string | null = null
    let rolle: string | null = null
    try {
      const supabase = await createClient()
      const { data } = await supabase.auth.getUser()
      userId = data.user?.id ?? null
      if (userId) {
        const { data: p } = await supabase
          .from('profiles')
          .select('rolle')
          .eq('id', userId)
          .maybeSingle()
        rolle = (p?.rolle as string | null) ?? null
      }
    } catch {
      /* egal */
    }

    const admin = createAdminClient()
    await admin.from('client_error_log').insert({
      boundary,
      digest: cap(body.digest, 128),
      name: cap(body.name, 128),
      message: cap(body.message, 2000),
      stack: cap(body.stack, 8000),
      pathname: cap(body.pathname, 512),
      user_agent: cap(request.headers.get('user-agent'), 512),
      user_id: userId,
      rolle,
    })

    return new NextResponse(null, { status: 204 })
  } catch {
    // Logging-Endpoint darf nie einen Fehler zuruueckwerfen.
    return new NextResponse(null, { status: 204 })
  }
}
