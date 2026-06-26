import type { createAdminClient } from '@/lib/supabase/admin'

// Verlaessliche Dispatch-Zuweisung fuer den Mini-Wizard: round-robin least-loaded
// aktiver dispatch-User (analog zur KB-Round-Robin im auto-beratungstermin-Trigger).
// Gibt null zurueck, wenn KEIN aktiver Dispatcher existiert (Caller faellt dann
// auf den KB-Auto-Trigger zurueck — Lead bleibt sichtbar + benachrichtigt).
export async function pickRoundRobinDispatcher(
  admin: ReturnType<typeof createAdminClient>,
): Promise<string | null> {
  const { data: dispatchers } = await admin
    .from('profiles')
    .select('id')
    .eq('rolle', 'dispatch')
    .eq('aktiv', true)
  if (!dispatchers || dispatchers.length === 0) return null
  if (dispatchers.length === 1) return dispatchers[0].id as string

  // least-loaded nach Gesamt-zugewiesenen Leads (selbst-balancierend: der mit den
  // wenigsten kriegt den naechsten). Keine Status-Enum-Raterei.
  const ids = dispatchers.map((d) => d.id as string)
  const { data: leads } = await admin.from('leads').select('zugewiesen_an').in('zugewiesen_an', ids)
  const counts = new Map<string, number>(ids.map((id) => [id, 0]))
  for (const l of leads ?? []) {
    const z = l.zugewiesen_an as string | null
    if (z && counts.has(z)) counts.set(z, (counts.get(z) ?? 0) + 1)
  }
  let best = ids[0]
  for (const id of ids) if ((counts.get(id) ?? 0) < (counts.get(best) ?? 0)) best = id
  return best
}
