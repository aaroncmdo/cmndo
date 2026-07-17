import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import { revertCaseBilling } from '@/lib/abrechnung/revert-case-billing'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { transitionFallStatus } from '@/lib/faelle/state-machine'

export const dynamic = 'force-dynamic'

/**
 * KFZ-150 Block H: No-Show Timeout Cron (täglich 10:00).
 * Fälle mit no_show_gemeldet_am > 5 Werktage → storno_kunde_no_show.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = createAdminClient()
  // CMM-44 SP-D: re_termin_token_eingelaufen_am liegt auf gutachter_termine (aktueller
  // Termin, SSoT) — NICHT in v_faelle_mit_aktuellem_termin. Pro Fall unten separat lesen.
  // (Der frühere View-Select brach still: PostgREST-400 → faelle=null → 0 Stornos.)
  const { data: faelle } = await db.from('v_faelle_mit_aktuellem_termin')
    .select('id, no_show_gemeldet_am')
    .not('no_show_gemeldet_am', 'is', null)
    .is('storniert_am', null)

  let storniert = 0
  let fehler = 0

  for (const fall of faelle ?? []) {
    // Partial-batch-Schutz: ein Fall in ungueltigem Status laesst transitionFallStatus
    // werfen — ohne per-Iteration-try/catch wuerde das den ganzen Lauf abbrechen und
    // alle nachfolgenden No-Shows still liegen lassen (Route 500t vor NextResponse).
    try {
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

      // CMM-44 SP-D: Kunde hat ueber Re-Termin-Link einen Slot vorgeschlagen → kein Storno.
      // re_termin_token_eingelaufen_am liegt auf gutachter_termine (aktueller Termin, SSoT).
      const { data: aktTermin } = await db
        .from('gutachter_termine')
        .select('re_termin_token_eingelaufen_am')
        .or(bezugOrExpr('fall', fall.id))
        .order('start_zeit', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (aktTermin?.re_termin_token_eingelaufen_am) continue

      // Kanonisch: neuer Termin? -> gutachter_termine (nicht stale View.sv_termin).
      const { data: neuerTermin } = await db
        .from('gutachter_termine')
        .select('start_zeit')
        .or(bezugOrExpr('fall', fall.id))
        .in('status', ['reserviert', 'bestaetigt', 'verlegung_pending', 'verlegt'])
        .gt('start_zeit', gemeldet.toISOString())
        .limit(1)
        .maybeSingle()
      if (neuerTermin) continue // Neuer Termin existiert -> kein Storno

      // Storno durchführen
      await transitionFallStatus(fall.id, 'storniert', { grund: 'storno_kunde_no_show' })
      await revertCaseBilling(fall.id, 'storno_kunde_no_show', 'system')

      // KFZ-151: Auto-Resolve aller offenen Case-Tasks (z.B. "Ersatztermin vermitteln")
      await resolveTasksForEntity('case', fall.id, 'No-Show via Cron finalisiert')
      storniert++
    } catch (err) {
      fehler++
      console.error(`[KFZ-150 no-show] Fall ${fall.id} übersprungen:`, err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({ ok: true, storniert, fehler })
}
