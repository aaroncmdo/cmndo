import type { SupabaseClient } from '@supabase/supabase-js'
import { rendereJob } from './orchestrator'
import { readAvailableRamMb } from './ram-gate'

/**
 * Render-Worker-Queue (Slice 3). Entkoppelt Freigabe vom Render:
 * `freigeben` enqueued (status=render_queued); dieser Worker holt EINEN Job pro Lauf
 * (reap-stale -> RAM-Pre-Check -> CAS-Claim -> rendereJob). Getriggert von der Cron-Route
 * (Backstop: reap/retry/backlog) UND fire-and-forget von `freigeben` (Fast-Path).
 *
 * Der CAS-Claim (render_queued -> audio_erzeugt) verhindert Doppel-Render bei ueberlappenden
 * Triggern. Serialisiert (1 Job/Lauf) + RAM-Pre-Check -> keine kumulierten Render-Spikes auf
 * der shared VPS. Laeuft im selben PM2-Prozess (echte OS-Isolation waere ein Standalone-Worker,
 * spaeter) — OOM-Schutz kommt vom RAM-Pre-Check hier + dem Gate in renderClip.
 */

const STALE_MS = 20 * 60_000 // laenger als Gate-Wartezeit (max 8min) + Render -> als haengend reappen

export type ClaimResult =
  | { status: 'claimed'; jobId: string }
  | { status: 'idle' }
  | { status: 'raced'; jobId: string }

export interface RenderWorkerDeps {
  reapStale: (supabase: SupabaseClient, staleBeforeIso: string) => Promise<number>
  claimNext: (supabase: SupabaseClient) => Promise<ClaimResult>
  rendereJob: (jobId: string, supabase: SupabaseClient) => Promise<{ ok: boolean; error?: string }>
  readAvailableRamMb: () => Promise<number | null>
}

/** Setzt haengengebliebene Renders (audio_erzeugt zu lange nicht aktualisiert) zurueck in die Queue. */
async function reapStale(supabase: SupabaseClient, staleBeforeIso: string): Promise<number> {
  const { data } = await supabase
    .from('marketing_content_jobs')
    .update({ status: 'render_queued', aktualisiert_am: new Date().toISOString() })
    .eq('status', 'audio_erzeugt')
    .lt('aktualisiert_am', staleBeforeIso)
    .select('id')
  return data?.length ?? 0
}

/** Holt den aeltesten render_queued-Job und beansprucht ihn atomar per CAS (-> audio_erzeugt). */
async function claimNext(supabase: SupabaseClient): Promise<ClaimResult> {
  const { data: cand } = await supabase
    .from('marketing_content_jobs')
    .select('id')
    .eq('status', 'render_queued')
    .order('erstellt_am', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!cand) return { status: 'idle' }
  const jobId = cand.id as string
  // CAS: nur beanspruchen, wenn der Job noch render_queued ist (sonst hat ein anderer Lauf ihn schon).
  const { data: claimed } = await supabase
    .from('marketing_content_jobs')
    .update({ status: 'audio_erzeugt', aktualisiert_am: new Date().toISOString() })
    .eq('id', jobId)
    .eq('status', 'render_queued')
    .select('id')
    .maybeSingle()
  return claimed ? { status: 'claimed', jobId } : { status: 'raced', jobId }
}

const realDeps: RenderWorkerDeps = { reapStale, claimNext, rendereJob, readAvailableRamMb }

export interface RenderWorkerResult {
  outcome: 'rendered' | 'idle' | 'skipped_ram' | 'raced'
  jobId?: string
  ok?: boolean
  error?: string
  availableMb?: number
  reaped: number
}

/**
 * Verarbeitet EINEN Job aus der Render-Queue. Idempotent + serialisiert (CAS-Claim).
 * Deps injizierbar fuer Tests.
 */
export async function verarbeiteRenderQueue(
  supabase: SupabaseClient,
  deps: RenderWorkerDeps = realDeps,
  opts: { minMb?: number } = {},
): Promise<RenderWorkerResult> {
  const minMb = opts.minMb ?? Number(process.env.MARKETING_RENDER_MIN_RAM_MB ?? 650)

  const reaped = await deps.reapStale(supabase, new Date(Date.now() - STALE_MS).toISOString())

  // RAM-Pre-Check: zu wenig -> diesen Lauf ueberspringen (Job bleibt queued, naechster Trigger/Cron
  // versucht es erneut). Vermeidet langes Blocken im Gate + haelt den Cron-Lauf kurz.
  const avail = await deps.readAvailableRamMb()
  if (avail !== null && avail < minMb) {
    return { outcome: 'skipped_ram', availableMb: avail, reaped }
  }

  const claim = await deps.claimNext(supabase)
  if (claim.status === 'idle') return { outcome: 'idle', reaped }
  if (claim.status === 'raced') return { outcome: 'raced', jobId: claim.jobId, reaped }

  const res = await deps.rendereJob(claim.jobId, supabase)
  return { outcome: 'rendered', jobId: claim.jobId, ok: res.ok, error: res.error, reaped }
}
