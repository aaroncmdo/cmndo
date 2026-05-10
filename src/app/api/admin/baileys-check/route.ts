// Admin-only Smoke-Test fuer den Baileys-Service.
// GET /api/admin/baileys-check → Health
// POST /api/admin/baileys-check { phone } → isOnWhatsApp-Lookup

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isOnWhatsApp, getBaileysHealth } from '@/lib/whatsapp/baileys-client'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401 }
  const { data: profile } = await supabase
    .from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false as const, status: 403 }
  return { ok: true as const }
}

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const health = await getBaileysHealth()
  return NextResponse.json(health)
}

export async function POST(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })

  const body = await request.json().catch(() => ({}))
  const phone = body?.phone as string | undefined
  if (!phone) return NextResponse.json({ error: 'phone required' }, { status: 400 })

  const result = await isOnWhatsApp(phone)
  return NextResponse.json(result)
}
