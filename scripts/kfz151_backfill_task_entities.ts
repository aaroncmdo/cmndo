/**
 * KFZ-151: Backfill — Bestehende Tasks bekommen entity_type/entity_id zugewiesen
 * + anschliessende Resolve-Welle fuer bereits abgeschlossene Entities.
 *
 * Modi:
 *   npx tsx scripts/kfz151_backfill_task_entities.ts            # Dry-Run (default)
 *   npx tsx scripts/kfz151_backfill_task_entities.ts --apply    # Apply
 *
 * Aaron-Regel: nur schliessen wenn entity nachweislich erledigt UND niemand zugewiesen.
 */

import { createAdminClient } from '../src/lib/supabase/admin'

const dryRun = !process.argv.includes('--apply')

type Task = {
  id: string
  fall_id: string | null
  typ: string | null
  titel: string | null
  beschreibung: string | null
  status: string
  zugewiesen_an: string | null
  entity_type: string | null
  entity_id: string | null
}

type Inference = {
  entity_type: string
  entity_id: string
  reason: string
}

/**
 * Versuche aus einem Task die zugehoerige Entity zu erraten.
 * Konservativ: lieber NULL zurueckgeben als falsch raten.
 */
function inferEntity(task: Task): Inference | null {
  const titel = (task.titel ?? '').toLowerCase()
  const typ = (task.typ ?? '').toLowerCase()

  // 1. Reklamations-Tasks
  if (typ === 'reklamation' || titel.includes('reklamation')) {
    // Wir kennen die reklamation_id nicht direkt — koennen sie aber via fall_id suchen.
    // Das macht der Hauptloop weiter unten.
    return task.fall_id ? { entity_type: 'fall', entity_id: task.fall_id, reason: 'reklamation-typ → fall fallback' } : null
  }

  // 2. Dispatch / Neuen Gutachter / Ersatztermin → case
  if (typ === 'dispatch' || titel.includes('neuen gutachter') || titel.includes('ersatztermin') || titel.includes('nicht erschienen')) {
    return task.fall_id ? { entity_type: 'case', entity_id: task.fall_id, reason: 'dispatch/no-show-Pattern' } : null
  }

  // 3. SV-Onboarding-Tasks
  if (typ === 'sv-onboarding' || titel.includes('sv ') && titel.includes('bezahlt') || titel.includes('anzahlung')) {
    // Wir wissen nicht welcher SV. Auslassen.
    return null
  }

  // 4. Generischer Fallback: alle anderen Tasks mit fall_id → entity_type='fall'
  if (task.fall_id) {
    return { entity_type: 'fall', entity_id: task.fall_id, reason: 'generischer fall-fallback' }
  }

  return null
}

async function backfill() {
  const db = createAdminClient()

  console.log(`KFZ-151 Backfill — ${dryRun ? 'DRY-RUN' : 'APPLY'} Modus\n`)

  // 1. Lade alle Tasks ohne entity_type
  const { data: tasks, error } = await db
    .from('tasks')
    .select('id, fall_id, typ, titel, beschreibung, status, zugewiesen_an, entity_type, entity_id')
    .is('entity_type', null)

  if (error) {
    console.error('Konnte Tasks nicht laden:', error.message)
    process.exit(1)
  }

  if (!tasks?.length) {
    console.log('Keine Tasks ohne entity_type gefunden — Backfill nicht noetig.')
    return
  }

  console.log(`${tasks.length} Tasks ohne entity_type gefunden.\n`)

  let inferredCount = 0
  let skippedCount = 0
  const updates: Array<{ id: string; entity_type: string; entity_id: string; reason: string }> = []

  for (const task of tasks as Task[]) {
    const inference = inferEntity(task)
    if (!inference) {
      skippedCount++
      continue
    }
    inferredCount++
    updates.push({ id: task.id, entity_type: inference.entity_type, entity_id: inference.entity_id, reason: inference.reason })
  }

  // Statistik nach inferenz-typ
  const byReason = new Map<string, number>()
  for (const u of updates) {
    byReason.set(u.reason, (byReason.get(u.reason) ?? 0) + 1)
  }

  console.log(`Verknuepfungs-Statistik:`)
  for (const [reason, count] of byReason.entries()) {
    console.log(`  ${count.toString().padStart(5)} Tasks  —  ${reason}`)
  }
  console.log(`  ${skippedCount.toString().padStart(5)} Tasks  —  ohne Inferenz (bleiben NULL)`)
  console.log(`  ─────`)
  console.log(`  ${tasks.length.toString().padStart(5)} gesamt\n`)

  if (dryRun) {
    console.log('DRY-RUN — keine Aenderungen geschrieben. Mit --apply ausfuehren.')
    return
  }

  // 2. Apply: Updates schreiben
  console.log('Schreibe Verknuepfungen...')
  let written = 0
  for (const u of updates) {
    const { error: updateErr } = await db
      .from('tasks')
      .update({ entity_type: u.entity_type, entity_id: u.entity_id })
      .eq('id', u.id)
    if (updateErr) {
      console.error(`  [FEHLER] Task ${u.id}: ${updateErr.message}`)
    } else {
      written++
    }
  }
  console.log(`${written}/${updates.length} Verknuepfungen geschrieben.\n`)

  // 3. Resolve-Welle: schliesse Karteileichen wo entity nachweislich erledigt ist
  console.log('Resolve-Welle: pruefe ob verknuepfte Entities bereits erledigt sind...\n')

  // Sammle eindeutige (entity_type, entity_id) Tupel
  const seen = new Set<string>()
  let resolvedCases = 0
  let resolvedFaelle = 0

  for (const u of updates) {
    const key = `${u.entity_type}:${u.entity_id}`
    if (seen.has(key)) continue
    seen.add(key)

    if (u.entity_type === 'case' || u.entity_type === 'fall') {
      // Pruefe ob Fall abgeschlossen oder storniert ist
      const { data: fall } = await db.from('faelle')
        .select('id, status')
        .eq('id', u.entity_id)
        .single()
      if (fall && (fall.status === 'abgeschlossen' || fall.status === 'storniert')) {
        const { resolveTasksForEntity } = await import('../src/lib/tasks/resolve-tasks')
        const result = await resolveTasksForEntity(
          u.entity_type as 'fall' | 'case',
          u.entity_id,
          `Backfill-Resolve: Fall ${fall.status}`,
        )
        if (result.resolved_count > 0) {
          if (u.entity_type === 'case') resolvedCases += result.resolved_count
          else resolvedFaelle += result.resolved_count
          console.log(`  [OK] ${u.entity_type}:${u.entity_id.slice(0, 8)} → ${result.resolved_count} Tasks geschlossen, ${result.notified_count} markiert (assigned)`)
        }
      }
    }
  }

  console.log(`\nResolve-Welle abgeschlossen:`)
  console.log(`  ${resolvedCases} case-Tasks geschlossen`)
  console.log(`  ${resolvedFaelle} fall-Tasks geschlossen`)
}

backfill().catch(err => {
  console.error('Backfill-Fehler:', err)
  process.exit(1)
})
