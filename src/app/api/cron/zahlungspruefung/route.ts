import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const svc = createServiceClient()
  const today = new Date().toISOString().slice(0, 10)

  // Find overdue invoices
  const { data: ueberfaellig } = await svc.from('gutachter_monatsabrechnungen')
    .select('id, sv_id, gesamtbetrag')
    .eq('status', 'offen')
    .lt('faellig_am', today)

  let updated = 0
  for (const abr of ueberfaellig ?? []) {
    await svc.from('gutachter_monatsabrechnungen').update({ status: 'ueberfaellig' }).eq('id', abr.id)
    await svc.from('sachverstaendige').update({ ist_aktiv: false }).eq('id', abr.sv_id)
    updated++
  }

  return NextResponse.json({ updated })
}
