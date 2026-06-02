import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

async function handleTestWhatsApp() {
  // Auth check
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet — bitte zuerst einloggen.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return NextResponse.json({ success: false, error: 'Nur fuer Admin.' }, { status: 403 })

  // WhatsApp-Versand laeuft ueber den Baileys-Service (Twilio 2026-06-02 entfernt).
  const result = await sendWhatsApp('+491633628571', 'Test von Claimondo — WhatsApp funktioniert! 🚗✅')
  return NextResponse.json({ ...result, to: '+491633628571', provider: 'baileys' })
}

export async function GET() { return handleTestWhatsApp() }
export async function POST() { return handleTestWhatsApp() }
