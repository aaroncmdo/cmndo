// AAR-723: Modell B — Round-Robin / least-loaded Auto-Assign beim
// Task-Erzeugen. Zuvor war der Broadcast-Pool (empfaenger_rolle='admin' +
// zugewiesen_an=NULL) der Normalfall — niemand fühlt sich verantwortlich und
// die Pill-Queries filtern auf zugewiesen_an=me, d. h. unassigned Tasks fallen
// unter den Tisch.
//
// Regel: Bei createLinkedTask mit empfaenger_rolle aber ohne empfaenger_user_id
// wählen wir den aktiven User dieser Rolle mit den WENIGSTEN offenen Tasks
// (`status IN ('offen','in-bearbeitung')`). Bei Gleichstand entscheidet eine
// stabile Sortierung (id ASC) — das ergibt deterministisches Round-Robin
// solange die Verteilung gleich bleibt.
//
// Fallback: Wenn die Rolle keine aktiven User hat → erster Admin +
// Notification an Admin, damit das Loch nicht stillschweigend verschwindet.

import { createAdminClient } from '@/lib/supabase/admin'

export type AutoAssignResult = {
  user_id: string
  rolle: string
  fallback_reason: string | null
  candidate_count: number
}

export async function chooseAssigneeForRolle(
  rolle: string,
): Promise<AutoAssignResult | null> {
  const db = createAdminClient()

  const { data: candidates, error: candErr } = await db
    .from('profiles')
    .select('id, rolle, aktiv')
    .eq('rolle', rolle)
    .neq('aktiv', false)
    .order('id', { ascending: true })

  if (candErr) {
    console.error('[AAR-723] auto-assign candidate query failed:', candErr.message)
    return null
  }

  const aktiveKandidaten = (candidates ?? []).map(c => c.id as string)

  if (aktiveKandidaten.length === 0) {
    // Fallback: erster Admin.
    const { data: adminFallback } = await db
      .from('profiles')
      .select('id')
      .eq('rolle', 'admin')
      .neq('aktiv', false)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (!adminFallback?.id) {
      console.error(`[AAR-723] auto-assign fallback: keine aktiven Admins für leere Rolle "${rolle}"`)
      return null
    }

    // Admin-Notification (best effort, non-blocking).
    try {
      const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
      await createMitteilung({
        empfaenger_id: adminFallback.id as string,
        empfaenger_rolle: 'admin',
        kategorie: 'update',
        titel: `Rolle ohne aktive User: ${rolle}`,
        inhalt: `Ein automatischer Task sollte an Rolle "${rolle}" gehen, aber es gibt keinen aktiven User. Fällt auf dich zurück.`,
        prioritaet: 'dringend',
      })
    } catch (err) {
      console.error('[AAR-723] Fallback-Mitteilung fehlgeschlagen:', err)
    }

    return {
      user_id: adminFallback.id as string,
      rolle: 'admin',
      fallback_reason: `Rolle "${rolle}" hat keine aktiven User`,
      candidate_count: 0,
    }
  }

  // Offene Tasks pro Kandidat zählen.
  const { data: offeneTasks, error: taskErr } = await db
    .from('tasks')
    .select('zugewiesen_an')
    .in('zugewiesen_an', aktiveKandidaten)
    .in('status', ['offen', 'in-bearbeitung'])

  if (taskErr) {
    console.error('[AAR-723] auto-assign task-count query failed:', taskErr.message)
    // Degraded fallback: nimm ersten Kandidaten, damit Task nicht verloren geht.
    return {
      user_id: aktiveKandidaten[0],
      rolle,
      fallback_reason: 'Task-Count-Query fehlgeschlagen — erster Kandidat gewählt',
      candidate_count: aktiveKandidaten.length,
    }
  }

  const counts = new Map<string, number>()
  for (const uid of aktiveKandidaten) counts.set(uid, 0)
  for (const row of offeneTasks ?? []) {
    const uid = row.zugewiesen_an as string | null
    if (uid && counts.has(uid)) counts.set(uid, (counts.get(uid) ?? 0) + 1)
  }

  let bestUser = aktiveKandidaten[0]
  let bestCount = counts.get(bestUser) ?? 0
  for (const uid of aktiveKandidaten) {
    const c = counts.get(uid) ?? 0
    if (c < bestCount) {
      bestUser = uid
      bestCount = c
    }
  }

  return {
    user_id: bestUser,
    rolle,
    fallback_reason: null,
    candidate_count: aktiveKandidaten.length,
  }
}
