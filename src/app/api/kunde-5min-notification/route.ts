import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/send-template'

// KFZ-179: 5-Minuten-Notification an Kunden — getriggert vom Client wenn ETA < 5.

export async function POST(request: Request) {
  const body = await request.json().catch(() => null)
  const token: string | undefined = body?.token
  if (!token) return NextResponse.json({ error: 'token fehlt' }, { status: 400 })

  const db = createAdminClient()

  const { data: termin } = await db
    .from('gutachter_termine')
    .select('id, fall_id, sv_id, notification_5min_gesendet_am')
    .eq('kunden_tracking_token', token)
    .single()

  if (!termin) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })
  if (termin.notification_5min_gesendet_am) return NextResponse.json({ already_sent: true })

  // Kunden-Daten
  const { data: fall } = await db.from('faelle').select('lead_id').eq('id', termin.fall_id).single()
  let kundeVorname = 'Kunde'
  let kundeTelefon: string | null = null
  if (fall?.lead_id) {
    const { data: lead } = await db.from('leads').select('vorname, telefon').eq('id', fall.lead_id).single()
    if (lead) { kundeVorname = lead.vorname ?? 'Kunde'; kundeTelefon = lead.telefon }
  }

  // SV-Name
  const { data: sv } = await db.from('sachverstaendige').select('profile_id').eq('id', termin.sv_id).single()
  let svName = 'Gutachter'
  if (sv?.profile_id) {
    const { data: p } = await db.from('profiles').select('vorname').eq('id', sv.profile_id).single()
    if (p) svName = p.vorname ?? 'Gutachter'
  }

  if (kundeTelefon) {
    await sendWhatsAppTemplate(kundeTelefon, 'sv_fast_da', {
      '1': kundeVorname,
      '2': svName,
    }).catch(() => {})
  }

  await db.from('gutachter_termine').update({
    notification_5min_gesendet_am: new Date().toISOString(),
  }).eq('id', termin.id)

  return NextResponse.json({ success: true })
}
