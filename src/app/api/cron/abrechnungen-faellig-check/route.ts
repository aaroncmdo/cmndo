import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  // Alle versendeten Abrechnungen die überfällig sind
  const { data: ueberfaellige, error } = await supabase
    .from('abrechnungen')
    .select('id, abrechnungs_nr, empfaenger_name, empfaenger_email, summe_brutto, faellig_am')
    .eq('status', 'versendet')
    .lt('faellig_am', today)

  if (error) {
    console.error('[faellig-check] Query-Fehler:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!ueberfaellige?.length) {
    return NextResponse.json({ updated: 0 })
  }

  let updated = 0

  for (const abr of ueberfaellige) {
    await supabase
      .from('abrechnungen')
      .update({ status: 'ueberfaellig', updated_at: new Date().toISOString() })
      .eq('id', abr.id)

    updated++
  }

  // Admin-Benachrichtigung falls überfällige existieren
  if (updated > 0) {
    const { data: admins } = await supabase
      .from('profiles')
      .select('telefon')
      .eq('rolle', 'admin')

    const summary = ueberfaellige.map(a =>
      `${a.abrechnungs_nr} (${a.empfaenger_name}): ${Number(a.summe_brutto).toFixed(2)}€, faellig seit ${a.faellig_am}`
    ).join('\n')

    for (const admin of admins ?? []) {
      if (admin.telefon) {
        await sendCommunication('admin_einzug_failed', {
          telefon: admin.telefon,
          '1': String(updated),
          '2': summary,
        })
      }
    }
  }

  console.log(`[faellig-check] ${updated} Abrechnungen auf ueberfaellig gesetzt`)
  return NextResponse.json({ updated })
}
