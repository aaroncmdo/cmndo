// AAR-92: Monatliche Abrechnung an Maik (Google Ads Partner)
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emailMaikMonatsabrechnung } from '@/lib/email'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const maikEmail = process.env.MAIK_EMAIL
  if (!maikEmail) {
    return NextResponse.json({ error: 'MAIK_EMAIL env nicht konfiguriert' }, { status: 500 })
  }

  // Letzter abgeschlossener Monat (z.B. wenn heute 1.5., dann Monat = 04)
  const now = new Date()
  const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const monatStr = lastMonth.toISOString().slice(0, 7)

  const { data: provisionen } = await db
    .from('provisionen_maik')
    .select('id, netto_provision')
    .eq('monat', monatStr)
    .eq('status', 'confirmed')

  const leadCount = provisionen?.length ?? 0
  const gesamt = (provisionen ?? []).reduce((s, p) => s + Number(p.netto_provision ?? 0), 0)

  // Email senden (auch bei 0 Leads -> "keine Auszahlung")
  await emailMaikMonatsabrechnung(maikEmail, monatStr, gesamt, leadCount)

  // Status auf paid setzen
  if (leadCount > 0) {
    const ids = (provisionen ?? []).map(p => p.id as string)
    await db.from('provisionen_maik')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .in('id', ids)
  }

  return NextResponse.json({
    ok: true,
    monat: monatStr,
    leadCount,
    gesamt: Number(gesamt.toFixed(2)),
    paid: leadCount > 0,
  })
}
