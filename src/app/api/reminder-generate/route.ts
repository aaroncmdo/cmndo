import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateReminderForTermin } from '@/lib/reminders/generate'

export const dynamic = 'force-dynamic'

/**
 * KFZ-136: Interner Endpoint zum Reminder-Generieren.
 * Nur fuer angemeldete Admins.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 })

  let body: { terminId?: string } = {}
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Body fehlt' }, { status: 400 }) }

  if (!body.terminId) return NextResponse.json({ error: 'terminId fehlt' }, { status: 400 })

  try {
    await generateReminderForTermin(body.terminId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[KFZ-136] Reminder-API Fehler:', err)
    return NextResponse.json({ error: 'Generierung fehlgeschlagen' }, { status: 500 })
  }
}
