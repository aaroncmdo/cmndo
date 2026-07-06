// AI-Claim-Orchestrator — Context-Builder + Prompt-Summarizer.
// Quellen: Basis-Tabellen (service_role), KEINE auth-gated v_claim_*-Views.
// Siehe Plan §Schema-Verifikation (2026-07-05).
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimContext } from './types'

/** Reine Funktion: erzeugt einen kompakten, prompt-tauglichen Kontext-String. */
export function summarizeClaimForPrompt(ctx: ClaimContext): string {
  const tasks = ctx.offeneTasks.length
    ? ctx.offeneTasks
        .map(
          (t) =>
            `- ${t.titel}${t.rolle ? ` (Rolle: ${t.rolle})` : ''}${t.faelligAm ? `, fällig ${t.faelligAm}` : ''}`,
        )
        .join('\n')
    : '- (keine offenen Tasks)'

  const verlauf = ctx.kurzverlauf.length
    ? ctx.kurzverlauf.map((v) => `- ${v}`).join('\n')
    : '- (kein Verlauf)'

  return [
    `Fall ${ctx.claimId} — Status: ${ctx.status ?? 'unbekannt'}, Phase: ${ctx.phase ?? 'unbekannt'}.`,
    `Fahrzeug: ${ctx.fahrzeug ?? 'unbekannt'}. Seit ${ctx.tageInaktiv} Tagen keine Aktivität.`,
    `Offene Tasks:\n${tasks}`,
    `Letzte Ereignisse:\n${verlauf}`,
  ].join('\n\n')
}

/**
 * Liest den Fall-Kontext aus Basis-Tabellen (service_role-lesbar).
 * Wirft nie — optionale Daten werden null-safe behandelt.
 *
 * Quellen (Override §2):
 *   claims by id
 *   vehicles by claims.vehicle_id (hersteller, best-effort)
 *   timeline (.or('claim_id.eq.<id>,fall_id.eq.<id>'), created_at, limit 8)
 *   tasks (.eq('fall_id', claimId).eq('status','offen'))
 */
export async function buildClaimContext(claimId: string): Promise<ClaimContext | null> {
  const db = createAdminClient()

  // --- claims (primary source) ---
  const { data: claim } = await db
    .from('claims')
    .select(
      'id, status, operative_status, ist_aktiv, abgeschlossen_am, updated_at, vehicle_id, fahrzeugschaden_beschreibung, hergang_kunde_text',
    )
    .eq('id', claimId)
    .maybeSingle()

  if (!claim) return null

  // claims.id IS the fall_id (tasks.fall_id == claims.id, verified)
  const fallId = claim.id as string

  // --- vehicles (best-effort, null-safe) ---
  let fahrzeug: string | null = null
  if (claim.vehicle_id) {
    const { data: vehicle } = await db
      .from('vehicles')
      .select('hersteller')
      .eq('id', claim.vehicle_id as string)
      .maybeSingle()
    fahrzeug = (vehicle?.hersteller as string | null) ?? null
  }

  // --- timeline (Aktivität + Kurzverlauf) ---
  const { data: timelineRows } = await db
    .from('timeline')
    .select('titel, created_at')
    .or(`claim_id.eq.${claimId},fall_id.eq.${claimId}`)
    .order('created_at', { ascending: false })
    .limit(8)

  const kurzverlauf: string[] = ((timelineRows ?? []) as Array<{ titel?: string | null; created_at?: string | null }>)
    .map((r) => r.titel ?? '')
    .filter(Boolean) as string[]

  const letzteAktivitaetAm: string | null =
    ((timelineRows ?? []) as Array<{ created_at?: string | null }>)[0]?.created_at ??
    (claim.updated_at as string | null) ??
    null

  // --- tasks (offene Tasks fuer diesen Fall) ---
  const { data: taskRows } = await db
    .from('tasks')
    .select('titel, empfaenger_rolle, faellig_am')
    .eq('fall_id', claimId)
    .eq('status', 'offen')

  const offeneTasks = ((taskRows ?? []) as Array<{
    titel?: string | null
    empfaenger_rolle?: string | null
    faellig_am?: string | null
  }>).map((t) => ({
    titel: t.titel ?? '',
    rolle: t.empfaenger_rolle ?? null,
    faelligAm: t.faellig_am ?? null,
  }))

  // --- abgeleitete Felder ---
  const phase = (claim.operative_status as string | null) ?? (claim.status as string | null) ?? null
  const tageInaktiv = letzteAktivitaetAm
    ? Math.floor((Date.now() - new Date(letzteAktivitaetAm).getTime()) / 86400000)
    : 999

  return {
    claimId,
    fallId,
    status: (claim.status as string | null) ?? null,
    phase,
    letzteAktivitaetAm,
    tageInaktiv,
    fahrzeug,
    offeneTasks,
    kurzverlauf,
  }
}
