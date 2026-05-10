import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// VPS-Cron: alle 5 Minuten.
// Gibt Slot-Reservierungen frei, die älter als 30 Minuten sind und noch keine
// SA-Signatur haben (status='entwurf'). Setzt zugehörige gutachter_termine
// von 'reserviert' zurück auf 'abgelehnt'.

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServiceClient()
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString()

  // Abgelaufene Entwürfe mit Slot-Reservierung laden
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: abgelaufen, error } = await (supabase as any)
    .from('gutachter_finder_anfragen')
    .select('id, reservierter_slot_von, reservierter_slot_bis, reservierter_sv_id')
    .eq('status', 'entwurf')
    .not('reservierter_slot_von', 'is', null)
    .lt('reservierter_slot_von', cutoff)

  if (error) {
    console.error('[slot-ttl-cleanup] DB-Fehler:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!abgelaufen?.length) {
    return NextResponse.json({ ok: true, freigegeben: 0 })
  }

  let freigegeben = 0

  for (const gfa of abgelaufen as {
    id: string
    reservierter_slot_von: string
    reservierter_slot_bis: string
    reservierter_sv_id: string
  }[]) {
    // Passenden reservierten Termin zurücksetzen
    const { error: terminErr } = await supabase
      .from('gutachter_termine')
      .update({ status: 'abgelehnt' })
      .eq('sv_id', gfa.reservierter_sv_id)
      .eq('start_zeit', gfa.reservierter_slot_von)
      .eq('status', 'reserviert')

    if (terminErr) {
      console.error('[slot-ttl-cleanup] Termin-Reset fehlgeschlagen:', gfa.id, terminErr.message)
      continue
    }

    // Reservierung auf GFA aufheben
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('gutachter_finder_anfragen')
      .update({
        reservierter_slot_von: null,
        reservierter_slot_bis: null,
        reservierter_sv_id: null,
      })
      .eq('id', gfa.id)

    freigegeben++
  }

  console.log(`[slot-ttl-cleanup] ${freigegeben} Slot(s) freigegeben`)
  return NextResponse.json({ ok: true, freigegeben })
}
