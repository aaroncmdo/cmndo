import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revertCaseBilling } from '@/lib/abrechnung/revert-case-billing'

export const dynamic = 'force-dynamic'

/**
 * KFZ-150 Block H: No-Show Timeout Cron (täglich 10:00).
 * Fälle mit no_show_gemeldet_am > 5 Werktage → storno_kunde_no_show.
 */
export async function GET() {
  const db = createAdminClient()
  const { data: faelle } = await db.from('faelle')
    .select('id, no_show_gemeldet_am, sv_termin')
    .not('no_show_gemeldet_am', 'is', null)
    .is('storniert_am', null)

  let storniert = 0

  for (const fall of faelle ?? []) {
    const gemeldet = new Date(fall.no_show_gemeldet_am)
    // 5 Werktage berechnen
    let werktage = 0
    const check = new Date(gemeldet)
    while (werktage < 5) {
      check.setDate(check.getDate() + 1)
      const day = check.getDay()
      if (day !== 0 && day !== 6) werktage++
    }

    if (new Date() < check) continue // Frist noch nicht um

    // Prüfen ob zwischenzeitlich ein neuer Termin eingetragen wurde
    if (fall.sv_termin && new Date(fall.sv_termin) > gemeldet) continue // Neuer Termin existiert

    // Storno durchführen
    await db.from('faelle').update({ status: 'storniert' }).eq('id', fall.id)
    await revertCaseBilling(fall.id, 'storno_kunde_no_show', 'system')
    storniert++
  }

  return NextResponse.json({ ok: true, storniert })
}
