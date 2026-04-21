// AAR-427: Zentrale Kundenbetreuer-Auto-Zuweisung mit Admin-Fallback
//
// Kaskadierender Fallback bei der Lead→Fall-Konversion (und künftigen
// Re-Assignments):
//
//   1. Primär   → aktiver KB mit freier Kapazität (Round-Robin via Auslastung)
//   2. Sekundär → erster aktiver Admin übernimmt temporär die KB-Rolle,
//                  Fall bekommt kundenbetreuer_fallback_flag = true
//   3. Tertiär  → weder KB noch Admin verfügbar: Timeline-Eintrag + Error-Log,
//                  Fall bleibt unbezogen (kundenbetreuer_id = NULL)
//
// Wird aufgerufen aus admin/dispatch/actions.ts (signSAandCreateFall-Flow)
// und kann später für Re-Assignments wiederverwendet werden.
//
// Sicherheit: nutzt den übergebenen Supabase-Client so wie er ist —
// der Caller entscheidet RLS (Server-Action läuft als eingeloggter Dispatcher
// oder Admin, hat damit schon Schreib-Rechte auf faelle).

import type { SupabaseClient } from '@supabase/supabase-js'

// Client-Type: wir nehmen den Server-Action-Client (nicht den Admin-Client),
// aber die Signatur ist bewusst generisch damit sowohl server.ts als auch
// admin.ts Clients reinpassen. Queries sind read-only bzw. update-only
// auf Spalten die für Dispatch/Admin via RLS erlaubt sind.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

export type KbAssignmentFallback = 'none' | 'admin' | 'error'

export type KbAssignmentResult = {
  success: boolean
  kundenbetreuer_id: string | null
  fallback_used: KbAssignmentFallback
  reason?: string
}

type ProfileLite = { id: string; email: string | null; kapazitaet_max: number | null }

/**
 * Findet den KB mit den wenigsten offenen Fällen unter der Kapazitätsgrenze.
 * Round-Robin via Auslastung: wer am wenigsten Fälle hat, bekommt den nächsten.
 *
 * Rückgabe: `null` wenn kein aktiver KB existiert. Ein KB ohne freie
 * Kapazität wird zurückgegeben (Least-Busy-Fallback) — die zweite
 * Eskalations-Stufe Admin-Fallback greift nur wenn gar kein KB da ist.
 */
export async function findAvailableKB(supabase: AnySupabase): Promise<ProfileLite | null> {
  const { data: betreuer } = await supabase
    .from('profiles')
    .select('id, email, kapazitaet_max')
    .eq('rolle', 'kundenbetreuer')
    .eq('aktiv', true)

  const list = (betreuer ?? []) as ProfileLite[]
  if (list.length === 0) return null

  const ids = list.map(p => p.id)
  const { data: faelle } = await supabase
    .from('faelle')
    .select('kundenbetreuer_id')
    .in('kundenbetreuer_id', ids)
    .not('status', 'in', '("abgeschlossen","storniert")')

  const counts: Record<string, number> = {}
  for (const id of ids) counts[id] = 0
  for (const f of (faelle ?? []) as Array<{ kundenbetreuer_id: string | null }>) {
    if (f.kundenbetreuer_id) counts[f.kundenbetreuer_id] = (counts[f.kundenbetreuer_id] ?? 0) + 1
  }

  const eligible = list.filter(p => counts[p.id] < (p.kapazitaet_max ?? 100))
  if (eligible.length === 0) {
    // Alle über Kapazität — trotzdem den Least-Busy nehmen (besser als kein KB)
    return list.reduce((min, p) => (counts[p.id] < counts[min.id] ? p : min), list[0])
  }
  return eligible.reduce((min, p) => (counts[p.id] < counts[min.id] ? p : min), eligible[0])
}

/**
 * Findet den "ersten" aktiven Admin (ältester Account zuerst). Wird nur
 * genutzt wenn `findAvailableKB` nichts liefert.
 */
export async function findFirstActiveAdmin(supabase: AnySupabase): Promise<ProfileLite | null> {
  const { data } = await supabase
    .from('profiles')
    .select('id, email, kapazitaet_max')
    .eq('rolle', 'admin')
    .eq('aktiv', true)
    .order('created_at', { ascending: true })
    .limit(1)
  const list = (data ?? []) as ProfileLite[]
  return list[0] ?? null
}

type AssignOptions = {
  /** Falls true, schreibt die Zuweisung direkt in die `faelle`-Zeile.
   *  Default false — der Caller (signSAandCreateFall) schreibt das Insert
   *  ohnehin und nimmt nur die IDs + Flags aus dem Ergebnis. */
  writeToFall?: boolean
  /** Zusätzliche Timeline-Notiz (optional, der Caller loggt die Konversion
   *  ohnehin separat). */
  logToTimeline?: boolean
}

/**
 * Hauptfunktion: weist einen Kundenbetreuer zu oder fällt auf den ersten
 * Admin zurück. Keine Exceptions — jeder Fall wird mit einem
 * KbAssignmentResult beantwortet.
 */
export async function assignKundenbetreuer(
  supabase: AnySupabase,
  fallId: string,
  options: AssignOptions = {},
): Promise<KbAssignmentResult> {
  // 1. Primär: aktiver KB
  const kb = await findAvailableKB(supabase)
  if (kb) {
    if (options.writeToFall) {
      await supabase
        .from('faelle')
        .update({
          kundenbetreuer_id: kb.id,
          kundenbetreuer_fallback_flag: false,
          kundenbetreuer_zugewiesen_am: new Date().toISOString(),
        })
        .eq('id', fallId)
    }
    return { success: true, kundenbetreuer_id: kb.id, fallback_used: 'none' }
  }

  // 2. Sekundär: Admin-Fallback
  const admin = await findFirstActiveAdmin(supabase)
  if (admin) {
    if (options.writeToFall) {
      await supabase
        .from('faelle')
        .update({
          kundenbetreuer_id: admin.id,
          kundenbetreuer_fallback_flag: true,
          kundenbetreuer_zugewiesen_am: new Date().toISOString(),
        })
        .eq('id', fallId)
    }
    if (options.logToTimeline) {
      await supabase.from('timeline').insert({
        fall_id: fallId,
        typ: 'system',
        titel: 'KB-Fallback auf Admin',
        beschreibung: `Kein Kundenbetreuer verfügbar — Admin ${admin.email ?? admin.id} übernimmt vorübergehend die KB-Rolle für diesen Fall.`,
      })
    }
    console.warn('[AAR-427] KB-Fallback auf Admin:', { fallId, adminId: admin.id, email: admin.email })
    return {
      success: true,
      kundenbetreuer_id: admin.id,
      fallback_used: 'admin',
      reason: 'Kein aktiver Kundenbetreuer gefunden — Admin übernimmt vorübergehend.',
    }
  }

  // 3. Tertiär: weder KB noch Admin
  console.error('[AAR-427] Kein Admin-Fallback verfügbar — Fall bleibt unbezogen:', { fallId })
  if (options.logToTimeline) {
    await supabase.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: 'KB-Zuweisung fehlgeschlagen',
      beschreibung: 'Kein aktiver Kundenbetreuer und kein aktiver Admin verfügbar — Fall bleibt unbezogen. Bitte manuell zuweisen.',
    })
  }
  return {
    success: false,
    kundenbetreuer_id: null,
    fallback_used: 'error',
    reason: 'Kein aktiver KB und kein aktiver Admin verfügbar.',
  }
}

// ─── AAR-632: Re-Assignment bei KB-Deaktivierung ─────────────────────────────

export type ReassignResult = {
  scanned_count: number
  reassigned_count: number
  failed_count: number
  tasks_reassigned: number
  details: Array<{ fall_id: string; from_kb: string; to_kb: string | null; fallback: KbAssignmentFallback }>
}

/**
 * Findet alle offenen Fälle deren `kundenbetreuer_id` auf einen inaktiven
 * User zeigt und weist sie neu zu. Genutzt:
 *   - als Cron (`/api/cron/kb-reassign-inactive`) als tägliches Safety-Net
 *   - manuell aus Admin-Team-Page wenn Admin einen KB deaktiviert (AAR-634)
 *
 * AAR-635: neben Fällen werden auch die offenen Tasks der betroffenen Fälle
 * vom alten KB auf den neuen KB umgehängt, damit nichts beim inaktiven User
 * hängen bleibt. Orphaned-Tasks ohne Fall (`fall_id=null` oder Lead-Tasks)
 * werden via separater Logik im createAutoTask-Fallback addressiert.
 */
export async function reassignAllFaelleForInactiveKbs(
  supabase: AnySupabase,
): Promise<ReassignResult> {
  // 1. Alle inaktiven User-IDs finden, deren Fälle noch nicht umverteilt sind
  const { data: inactiveUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('aktiv', false)
  const inactiveIds = (inactiveUsers ?? []).map((u: { id: string }) => u.id)
  if (inactiveIds.length === 0) {
    return { scanned_count: 0, reassigned_count: 0, failed_count: 0, tasks_reassigned: 0, details: [] }
  }

  // 2. Alle offenen Fälle laden mit inaktivem KB
  const { data: faelle } = await supabase
    .from('faelle')
    .select('id, kundenbetreuer_id')
    .in('kundenbetreuer_id', inactiveIds)
    .not('status', 'in', '("abgeschlossen","storniert")')
  const list = (faelle ?? []) as Array<{ id: string; kundenbetreuer_id: string }>

  const result: ReassignResult = {
    scanned_count: list.length,
    reassigned_count: 0,
    failed_count: 0,
    tasks_reassigned: 0,
    details: [],
  }

  // 3. Pro Fall neu zuweisen (Round-Robin via assignKundenbetreuer) +
  // AAR-635: offene Tasks vom alten KB auf den neuen umhängen.
  for (const fall of list) {
    const ass = await assignKundenbetreuer(supabase, fall.id, {
      writeToFall: true,
      logToTimeline: true,
    })
    if (ass.success && ass.kundenbetreuer_id) {
      result.reassigned_count += 1
      result.details.push({
        fall_id: fall.id,
        from_kb: fall.kundenbetreuer_id,
        to_kb: ass.kundenbetreuer_id,
        fallback: ass.fallback_used,
      })

      // AAR-635: Tasks dieses Falls vom alten KB auf den neuen KB umhängen
      const { data: taskRows, error: taskErr } = await supabase
        .from('tasks')
        .update({
          zugewiesen_an: ass.kundenbetreuer_id,
          empfaenger_user_id: ass.kundenbetreuer_id,
        })
        .eq('fall_id', fall.id)
        .eq('zugewiesen_an', fall.kundenbetreuer_id)
        .eq('status', 'offen')
        .select('id')
      if (taskErr) {
        console.error(`[AAR-635] Task-Reassign für Fall ${fall.id} fehlgeschlagen:`, taskErr.message)
      } else if (taskRows) {
        result.tasks_reassigned += taskRows.length
      }
    } else {
      result.failed_count += 1
      result.details.push({
        fall_id: fall.id,
        from_kb: fall.kundenbetreuer_id,
        to_kb: null,
        fallback: ass.fallback_used,
      })
    }
  }

  if (result.reassigned_count > 0 || result.tasks_reassigned > 0) {
    console.warn(
      `[AAR-632/635] KB-Reassignment: ${result.reassigned_count}/${result.scanned_count} Fälle + ${result.tasks_reassigned} Tasks neu zugewiesen`,
    )
  }
  return result
}
