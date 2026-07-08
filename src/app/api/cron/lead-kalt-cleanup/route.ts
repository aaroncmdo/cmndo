import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

// #lead-hygiene: Taeglicher Cron. Schliesst offene Leads, die STALE_TAGE ohne
// Abschluss stallen, auf 'kalt' (beide Lifecycle-Achsen status + qualifizierungs_phase).
// Ergaenzt den Einmal-Cleanup (Mig 20260701143430) dauerhaft, damit der Follow-up-Stau
// nicht nachwaechst. Abgrenzung zu den bestehenden Lead-Crons:
//   - flowlink-inaktiv (2h inaktiv -> Dispatcher-Task "Kunde anrufen") = Kurzfrist-Nudge.
//   - dieser Cron = Lebensende (Lead nach STALE_TAGE tot).
// Nur 'flow-gesendet'/'quali-offen' (aktiver Flow gestallt); 'neu'/'rueckruf' bewusst
// NICHT (rueckruf haengt an admin_termine, neu soll frisch zugewiesen/bearbeitet werden).
const STALE_TAGE = 30
const MAX_PRO_LAUF = 200 // Runaway-Schutz: mehr -> Anomalie, wird geloggt

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const cutoff = new Date(Date.now() - STALE_TAGE * 24 * 60 * 60 * 1000).toISOString()

  // Kandidaten laden (Cap + Logging statt blindem Mass-Update)
  const { data: kandidaten, error } = await db
    .from('leads')
    .select('id')
    .eq('flow_link_abgeschlossen', false)
    .in('status', ['flow-gesendet', 'quali-offen'])
    .lt('updated_at', cutoff)
    .limit(MAX_PRO_LAUF)

  if (error) {
    console.error('[lead-kalt-cleanup] DB-Fehler beim Laden:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }

  if (!kandidaten?.length) {
    return NextResponse.json({ ok: true, geschlossen: 0 })
  }

  const ids = kandidaten.map((k) => k.id)
  const { error: updErr } = await db
    .from('leads')
    .update({ status: 'kalt', qualifizierungs_phase: 'kalt' })
    .in('id', ids)

  if (updErr) {
    console.error('[lead-kalt-cleanup] Update-Fehler:', updErr.message)
    return NextResponse.json({ ok: false, error: updErr.message }, { status: 500 })
  }

  const kappeErreicht = kandidaten.length === MAX_PRO_LAUF
  if (kappeErreicht) {
    console.warn(`[lead-kalt-cleanup] MAX_PRO_LAUF (${MAX_PRO_LAUF}) erreicht — evtl. mehr offen, naechster Lauf raeumt weiter`)
  }
  console.log(`[lead-kalt-cleanup] ${ids.length} Lead(s) auf 'kalt' geschlossen (>${STALE_TAGE}d ohne Abschluss)`)

  return NextResponse.json({ ok: true, geschlossen: ids.length, kappe_erreicht: kappeErreicht })
}
