// AAR-864 Phase 8: Eskalations-Cron für offene Termin-Verlegungs-Anfragen.
//
// Triggert wenn:
//   - verlegung_pending-Slot existiert
//   - Alter Termin (verlegung_quelle_id, status='verlegt') start_zeit
//     liegt < now() + 48h
//   - verlegung_eskalation_an_kb_an IS NULL (Idempotenz)
//
// Pro Treffer: emit `termin.verlegung_eskalation`-Event (löst WhatsApp
// + In-App + Push für Kunde, In-App für KB+Admin via Channel-Matrix
// aus channel-matrix.ts), und setze den Idempotenz-Marker.
//
// Schedule: */30 * * * * (alle 30 Minuten) via vercel.json.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'

export const dynamic = 'force-dynamic'

function fmtDatum(iso: string): string {
  return new Date(iso).toLocaleDateString('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}
function fmtUhrzeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export async function GET() {
  const db = createAdminClient()

  // Pending-Slots laden, die noch nicht eskaliert wurden
  const { data: pendings, error } = await db
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, verlegung_quelle_id')
    .eq('status', 'verlegung_pending')
    .is('verlegung_eskalation_an_kb_an', null)

  if (error) {
    console.error('[AAR-864] eskalation cron — load pendings failed', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  let eskaliert = 0
  const grenze = new Date(Date.now() + 48 * 60 * 60 * 1000)

  for (const pending of pendings ?? []) {
    if (!pending.verlegung_quelle_id || !pending.fall_id) continue

    // Alten Termin laden — muss noch 'verlegt' sein und in <48h liegen
    const { data: alt } = await db
      .from('gutachter_termine')
      .select('id, start_zeit, status')
      .eq('id', pending.verlegung_quelle_id as string)
      .maybeSingle()
    if (!alt) continue
    if (alt.status !== 'verlegt') continue
    const altStart = new Date(alt.start_zeit as string)
    if (altStart > grenze) continue

    // Idempotenz-Marker zuerst setzen, atomic vor emit damit ein paralleler
    // Cron-Lauf nicht doppelt feuert
    const { error: updErr } = await db
      .from('gutachter_termine')
      .update({ verlegung_eskalation_an_kb_an: new Date().toISOString() })
      .eq('id', pending.id as string)
      .is('verlegung_eskalation_an_kb_an', null)
    if (updErr) {
      console.error('[AAR-864] eskalation cron — update idempotenz failed', updErr)
      continue
    }

    try {
      await emitEvent(
        'termin.verlegung_eskalation',
        {
          fallId: pending.fall_id as string,
          terminId: pending.id as string,
          alterTerminId: alt.id as string,
          alterDatum: fmtDatum(alt.start_zeit as string),
          alterUhrzeit: fmtUhrzeit(alt.start_zeit as string),
        },
        { fallId: pending.fall_id as string },
      )
      eskaliert++
    } catch (e) {
      console.error('[AAR-864] eskalation cron — emit failed', e)
      // Idempotenz-Marker bleibt gesetzt — manuelle Re-Triggerung nötig
      // (ist akzeptabel, weil eine zweite Eskalation den Kunden nervt)
    }
  }

  return NextResponse.json({ ok: true, eskaliert })
}
