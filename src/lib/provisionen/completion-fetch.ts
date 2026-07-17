// termin-bezug-skip: spiegelt exakt den Completion-Fetch des release-runner (der die TATSAECHLICHE
//   Freigabe berechnet) — die angezeigte Freigabe-/Clawback-Frist MUSS mit dem Cron-Verhalten
//   uebereinstimmen. Beide nutzen denselben claim_id-Fetch auf gutachter_termine; ein Umstieg auf
//   bezug-native Filter erfolgt GEMEINSAM im P33-gutachter-termine-legacy-retire, sonst driften
//   Anzeige (hier) und Release (release-runner) auseinander.
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ClaimCompletionInput } from './completion-release-gate'

/**
 * Laedt die Completion-Signale fuer eine Menge von claim_ids — dieselben, die der Release-Gate
 * (deriveCompletionTs / releaseDeadlineTs) braucht: claims.operative_status + service_typ +
 * abgeschlossen_am, plus fuer nur_gutachter-Claims den juengsten durchgefuehrten Gutachter-Termin.
 *
 * SERVICE-ROLE-Client noetig: das Werkstatt-Portal hat keine claims-RLS-Policy (es liest sonst 0),
 * und die abgeleiteten Completion-Daten (reine Datumswerte) sind nicht PII. Der Aufrufer MUSS die
 * claimIds aus seinen EIGENEN (RLS-gefilterten) Provisionen ableiten → kein Cross-Tenant-Read.
 *
 * Extrahiert aus dem release-runner-Fetch (bewusst identisch, s. skip-Header oben).
 */
export async function loadCompletionMap(
  db: SupabaseClient,
  claimIds: Array<string | null | undefined>,
): Promise<Map<string, ClaimCompletionInput>> {
  const map = new Map<string, ClaimCompletionInput>()
  const ids = Array.from(new Set(claimIds.filter((x): x is string => !!x)))
  if (ids.length === 0) return map

  const { data: claims } = await db
    .from('claims')
    .select('id, operative_status, service_typ, abgeschlossen_am')
    .in('id', ids)

  for (const c of (claims ?? []) as Record<string, unknown>[]) {
    map.set(c.id as string, {
      operativeStatus: (c.operative_status as string | null) ?? null,
      serviceTyp: (c.service_typ as string | null) ?? null,
      abgeschlossenAm: (c.abgeschlossen_am as string | null) ?? null,
      terminDurchgefuehrtAm: null,
    })
  }

  const nurGutachterIds = Array.from(map.entries())
    .filter(([, e]) => e.serviceTyp === 'nur_gutachter')
    .map(([id]) => id)
  if (nurGutachterIds.length > 0) {
    const { data: termine } = await db
      .from('gutachter_termine')
      .select('claim_id, durchgefuehrt_am')
      .in('claim_id', nurGutachterIds)
      .not('durchgefuehrt_am', 'is', null)
      .order('durchgefuehrt_am', { ascending: false })
    for (const t of (termine ?? []) as Record<string, unknown>[]) {
      const cid = t.claim_id as string | null
      if (!cid) continue
      const e = map.get(cid)
      if (e && !e.terminDurchgefuehrtAm) e.terminDurchgefuehrtAm = (t.durchgefuehrt_am as string | null) ?? null
    }
  }

  return map
}
