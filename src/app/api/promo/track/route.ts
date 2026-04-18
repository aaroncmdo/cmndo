// AAR-491 (M9): Promo-Click-Tracking-Endpoint.
// Wird von der Landing-Page (und später von C1 Schaden-Melden) aufgerufen
// wenn ?p=MK-xxxx im URL auftaucht. Insert läuft über Service-Role, da
// Anonyme nicht in promo_clicks schreiben dürfen (RLS).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashIp } from '@/lib/crypto/hash-ip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CODE_RE = /^MK-[A-Z0-9]{4,12}$/i

export async function POST(req: Request) {
  let body: { code?: string } = {}
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const code = body.code?.trim().toUpperCase()
  if (!code || !CODE_RE.test(code)) {
    return NextResponse.json({ ok: false, error: 'invalid_code' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: pc } = await admin
    .from('promotion_codes')
    .select('id, aktiv')
    .eq('code', code)
    .maybeSingle()

  if (!pc || !pc.aktiv) {
    // Still return 200 — Tracking soll UX nicht brechen. Unbekannte Codes
    // werden bewusst nicht geloggt, damit Bot-Probing nicht die Tabelle füllt.
    return NextResponse.json({ ok: true, tracked: false })
  }

  const userAgent = req.headers.get('user-agent')?.slice(0, 500) ?? null
  const referer = req.headers.get('referer')?.slice(0, 500) ?? null
  const ipRaw =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-real-ip') ??
    null

  await admin.from('promo_clicks').insert({
    promotion_code_id: pc.id as string,
    user_agent: userAgent,
    referer,
    ip_hash: hashIp(ipRaw),
  })

  return NextResponse.json({ ok: true, tracked: true })
}
