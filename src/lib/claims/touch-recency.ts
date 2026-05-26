import type { SupabaseClient } from '@supabase/supabase-js'

// Generische Client-Signatur, damit Server-Action-, Service- und Admin-Client passen.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>

/**
 * CMM-65: Bumpt `claims.updated_at` (Recency-Signal, claims = SSoT). Ersetzt die
 * frueheren `faelle.update({ updated_at })`-"Touch"-Writes (Writer-Sweep).
 *
 * - claims hat moddatetime (`trg_claims_updated_at`, BEFORE UPDATE) → der Wert
 *   im Payload ist Intent/Fallback, der Trigger setzt server-now.
 * - Konsument: `pflichtdokumente-reminder`-Cron liest `fall_updated_at` (Idle-
 *   Gating); nach CMM-66 (View-Repoint) zeigt das auf `claims.updated_at`.
 * - Realtime: der Write feuert ueber die supabase_realtime-Publication die
 *   claims-Subscription in `FallRealtimeRefresh` / `SvFallakteView` (Live-Refresh
 *   der Fall-Seiten in allen drei Portalen).
 *
 * Non-critical: Fehler werden geloggt, nicht geworfen — Status-Updates der
 * aufrufenden Action bleiben atomar (AGENTS.md §server-actions).
 */
export async function touchClaimRecency(
  client: AnySupabase,
  claimId: string | null | undefined,
): Promise<void> {
  if (!claimId) return
  const { error } = await client
    .from('claims')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', claimId)
  if (error) console.error('[CMM-65] touchClaimRecency fehlgeschlagen:', error.message)
}

/**
 * Variante fuer Caller die nur die `fall_id` kennen: loest `claim_id` aus faelle
 * auf (NOT NULL) und delegiert an {@link touchClaimRecency}.
 */
export async function touchClaimRecencyByFall(
  client: AnySupabase,
  fallId: string,
): Promise<void> {
  const { data: f } = await client
    .from('faelle')
    .select('claim_id')
    .eq('id', fallId)
    .maybeSingle()
  await touchClaimRecency(client, (f?.claim_id as string | null) ?? null)
}
