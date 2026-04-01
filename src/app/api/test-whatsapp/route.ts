import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

async function handleTestWhatsApp() {
  // Check env vars
  const missing: string[] = []
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID')
  if (!process.env.TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN')
  if (missing.length > 0) {
    return NextResponse.json({ success: false, error: `Fehlende Env-Variablen: ${missing.join(', ')}`, hint: 'In Vercel unter Settings > Environment Variables setzen.' })
  }

  // Auth check
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ success: false, error: 'Nicht angemeldet — bitte zuerst einloggen.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return NextResponse.json({ success: false, error: 'Nur fuer Admin.' }, { status: 403 })

  const result = await sendWhatsApp('+491633628571', 'Test von Claimondo — WhatsApp funktioniert! 🚗✅')
  return NextResponse.json({
    ...result,
    from: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',
    to: 'whatsapp:+491633628571',
  })
}

export async function GET() { return handleTestWhatsApp() }
export async function POST() { return handleTestWhatsApp() }
