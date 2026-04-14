// AAR-97: Aircall Outbound Click-to-Call
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => null) as { phoneNumber?: string; leadId?: string; fallId?: string } | null
  const phoneNumber = body?.phoneNumber
  if (!phoneNumber) return NextResponse.json({ error: 'phoneNumber required' }, { status: 400 })

  const apiId = process.env.AIRCALL_API_ID
  const apiToken = process.env.AIRCALL_API_TOKEN
  if (!apiId || !apiToken) {
    return NextResponse.json({ error: 'Aircall API nicht konfiguriert (AIRCALL_API_ID/TOKEN fehlen)' }, { status: 500 })
  }

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('aircall_user_id')
    .eq('id', user.id)
    .single()

  const aircallUserId = profile?.aircall_user_id ?? process.env.AIRCALL_DEFAULT_USER_ID
  if (!aircallUserId) {
    return NextResponse.json({
      error: 'Kein Aircall-User zugeordnet. Bitte Admin kontaktieren, um aircall_user_id in deinem Profil zu setzen.',
    }, { status: 400 })
  }

  const auth = Buffer.from(`${apiId}:${apiToken}`).toString('base64')
  const res = await fetch(`https://api.aircall.io/v1/users/${aircallUserId}/dial`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: phoneNumber }),
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    return NextResponse.json({ error: `Aircall-API Fehler ${res.status}: ${errText}` }, { status: 502 })
  }

  // Pre-Insert (wird vom Webhook spaeter geupdatet)
  await admin.from('aircall_calls').insert({
    aircall_id: `pending-${Date.now()}-${user.id.slice(0, 8)}`,
    direction: 'outbound',
    status: 'failed',
    started_at: new Date().toISOString(),
    from_number: 'pending',
    to_number: phoneNumber,
    aircall_user_id: aircallUserId,
    lead_id: body?.leadId ?? null,
    fall_id: body?.fallId ?? null,
    initiated_by_profile_id: user.id,
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true })
}
