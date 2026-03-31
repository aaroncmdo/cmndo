import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsApp } from '@/lib/whatsapp'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  // Only admin
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return NextResponse.json({ error: 'Nur fuer Admin' }, { status: 403 })

  const result = await sendWhatsApp('+491633628571', 'Test von Claimondo - WhatsApp funktioniert! 🚗')
  return NextResponse.json(result)
}
