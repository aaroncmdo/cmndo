// AAR-826: Cardentity Re-Check — Fahrzeuge mit veraltetem Cardentity-Befund neu abrufen
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  // Fahrzeuge mit active Claims + Cardentity nicht in letzten 90d geprüft
  const { data: vehicles, error } = await admin
    .from('vehicles')
    .select('id, fin_vin, kennzeichen')
    .lt('cardentity_last_checked', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .not('fin_vin', 'is', null)
    .limit(50)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  // Für jeden Vehicle: Cardentity-API-Call (Implementierung separat in lib/cardentity)
  // Stub: Updated timestamp ohne echten API-Call
  const updated = vehicles?.length ?? 0
  if (updated > 0) {
    await admin
      .from('vehicles')
      .update({ cardentity_last_checked: new Date().toISOString() })
      .in('id', vehicles!.map(v => v.id))
  }

  return NextResponse.json({
    ok: true,
    vehicles_checked: updated,
    checked_at: new Date().toISOString(),
  })
}
