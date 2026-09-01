import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { ladeHaengendeClaims } from '@/lib/claims/haenger-laden'
import {
  baueHaengerTaskText,
  HAENGER_SCHWELLE_TAGE,
  HAENGER_TASK_CODE,
} from '@/lib/claims/haenger-detektor'

// Ops-Test 12.08. (I1): Haenger-Detektor.
//
// Taeglich. Findet Claims, die laenger als HAENGER_SCHWELLE_TAGE ohne Statusbewegung
// UND ohne aktiven Termin dastehen, und legt pro Fall EINEN Dispatch-Task an.
//
// ANLASS: CLM-2026-01011 hing 14 Tage unbemerkt. Die Erhebung ergab 14 solcher Faelle
// (7-27 Tage). Der SLA-Tracker faengt sie nicht — er ist rein reaktiv ueber
// sla_tracking-Zeilen, und 9 der 14 hatten gar keine.
//
// ⭐ Die ERMITTLUNG liegt seit 01.09. in `lib/claims/haenger-laden.ts` und wird mit dem
// Admin-Dashboard-Widget geteilt. Grund: eine Regel, eine Quelle — sonst zeigt das
// Dashboard frueher oder spaeter etwas anderes an, als dieser Cron meldet. Hier bleibt
// nur, was den Cron ausmacht: Dedup + Task-Anlage.
//
// ⚠ REGISTRIERUNG: Diese Route laeuft NICHT von allein. Sie muss in der VPS-Crontab
// eingetragen werden (siehe docs/vps-crontab.md). Eingetragen als:
//   30 6 * * *  /usr/local/bin/cron-call.sh /api/cron/haenger-detektor
// = 08:30 MESZ, also vor dem Arbeitsbeginn im Dispatch.

export const dynamic = 'force-dynamic'

/** Sicherung gegen Task-Lawinen: mehr als das legt ein Lauf nie an. */
const MAX_TASKS_PRO_LAUF = 25

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const jetzt = new Date()

  // Ermittlung (geteilt mit dem Dashboard) — liefert absteigend nach Wartezeit sortiert,
  // sodass ein greifender MAX_TASKS_PRO_LAUF die AELTESTEN Faelle meldet, nicht beliebige.
  const { haenger, geprueft, error } = await ladeHaengendeClaims(db, jetzt)
  if (error) {
    console.error('[haenger-detektor] Claims laden fehlgeschlagen:', error)
    return NextResponse.json({ ok: false, error }, { status: 500 })
  }
  if (haenger.length === 0) {
    return NextResponse.json({ ok: true, geprueft, haenger: 0, tasks: 0 })
  }

  // DEDUP — pro Claim hoechstens EIN offener Haenger-Task. Ohne diesen Schritt baut
  // ein taeglicher Cron denselben Berg, der am 12.08. schon einmal aufgeraeumt werden
  // musste (226 identische Tasks auf einem Claim, Migration 20260812145105).
  const { data: vorhandene } = await db
    .from('tasks')
    .select('claim_id')
    .eq('task_code', HAENGER_TASK_CODE)
    .neq('status', 'erledigt')
    .in('claim_id', haenger.map((c) => c.id))
  const hatBereitsTask = new Set((vorhandene ?? []).map((t) => t.claim_id as string).filter(Boolean))

  const offen = haenger.filter((c) => !hatBereitsTask.has(c.id))
  const zuAnlegen = offen.slice(0, MAX_TASKS_PRO_LAUF)

  let angelegt = 0
  for (const c of zuAnlegen) {
    const { titel, beschreibung } = baueHaengerTaskText({
      claimNummer: c.claimNummer,
      operativeStatus: c.operativeStatus,
      tage: c.tage,
    })
    try {
      await createLinkedTask({
        titel,
        beschreibung,
        // 'dringend', NICHT 'hoch': tasks_prioritaet_check erlaubt nur
        // ['normal','dringend','kritisch'] — ein ungueltiges Literal wuerde vom CHECK
        // still verworfen (der Cron meldete "ok" bei 0 angelegten Tasks).
        prioritaet: 'dringend',
        claim_id: c.id,
        typ: 'dispatch',
        task_code: HAENGER_TASK_CODE,
        empfaenger_rolle: 'dispatch',
        trigger_event: 'haenger-detektor',
        auto_erstellt: true,
      })
      angelegt++
    } catch (err) {
      // Ein fehlgeschlagener Task darf den Lauf nicht abbrechen — der naechste Claim
      // soll trotzdem gemeldet werden.
      console.error('[haenger-detektor] Task-Anlage fehlgeschlagen fuer', c.id, err)
    }
  }

  const uebersprungen = offen.length - zuAnlegen.length
  if (uebersprungen > 0) {
    // Kein stilles Kappen: wenn der Deckel greift, muss das sichtbar sein.
    console.warn(`[haenger-detektor] ${uebersprungen} Haenger wegen MAX_TASKS_PRO_LAUF nicht gemeldet`)
  }

  return NextResponse.json({
    ok: true,
    geprueft,
    haenger: haenger.length,
    bereits_gemeldet: hatBereitsTask.size,
    tasks: angelegt,
    uebersprungen,
    schwelle_tage: HAENGER_SCHWELLE_TAGE,
    geprueft_am: jetzt.toISOString(),
  })
}
