import { unstable_cache } from 'next/cache'
import { createServiceClient } from '@/lib/supabase/server'

// Live-Counter-Stats für die kfzgutachter-Ads-LP. Aaron 18.05.2026:
// Trust-Faktor „Live-Aktivität" — echte Supabase-Daten, 30-Tage-Rolling-
// Window, mit Test-Filter (UWG-konform). Aggregierter Count, keine Leaks.
//
// Cache: 60 s revalidate — „live genug" für UX, schont Supabase-Pool.
// Service-Role: anonyme RLS auf `leads` ist Default-Deny (Audit 12.05.).
//   Wir lesen nur einen aggregierten count, keine Daten verlassen den Server.
//
// Fallback: bei DB-Fehler oder count < 5 liefert `getLiveStats()` null —
// die Pill rendert dann ohne Zahl. Zwei Gründe: (a) bei wirklich leerem
// Window keine peinliche Null zeigen, (b) bei Connection-Fehler die LP
// trotzdem rendern.

const MIN_DISPLAY_COUNT = 5
const WINDOW_DAYS = 30

async function fetchLeadsWindow(): Promise<number | null> {
  try {
    const sb = createServiceClient()
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
    const { count, error } = await sb
      .from('anfragen')
      .select('id', { count: 'exact', head: true })
      .eq('quelle', 'kfzgutachter-ads-lp')
      .eq('konvertier_status', 'success')
      .gte('created_at', since)
      // Test-Hygiene-Filter (kontakt_name enthaelt nicht 'test').
      .not('kontakt_name', 'ilike', '%test%')

    if (error) {
      console.error('[kfzgutachter-lp] live-stats fetch failed:', error.message)
      return null
    }
    return count ?? 0
  } catch (err) {
    console.error('[kfzgutachter-lp] live-stats threw:', err)
    return null
  }
}

const cachedFetch = unstable_cache(fetchLeadsWindow, ['kfzgutachter-lp-leads30'], {
  revalidate: 60,
  tags: ['kfzgutachter-lp-stats'],
})

export async function getLiveStats(): Promise<{ leads30: number; windowDays: number } | null> {
  const count = await cachedFetch()
  if (count === null) return null
  if (count < MIN_DISPLAY_COUNT) return null
  return { leads30: count, windowDays: WINDOW_DAYS }
}
