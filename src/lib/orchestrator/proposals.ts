import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { AiProposal, ProposalDraft } from './types'

/** Stabiler Schluessel: Claim + Typ + Rolle + Kern-Payload (ohne Begruendung). */
export function dedupeKey(claimId: string, d: ProposalDraft): string {
  const kern = JSON.stringify({ c: claimId, t: d.vorschlagTyp, r: d.zielRolle ?? '', p: d.payload })
  return createHash('sha256').update(kern).digest('hex').slice(0, 32)
}

/** Schreibt Drafts als offene Vorschlaege. Dedup via Partial-Unique-Index (offen).
 *  Kollision (bereits offener gleicher Vorschlag) -> still uebersprungen. */
export async function persistProposals(claimId: string, modell: string, drafts: ProposalDraft[]): Promise<number> {
  if (!drafts.length) return 0
  const db = createAdminClient()
  let count = 0
  for (const d of drafts) {
    const { error } = await db.from('ai_claim_proposals').insert({
      claim_id: claimId, vorschlag_typ: d.vorschlagTyp, ziel_rolle: d.zielRolle,
      payload: d.payload, begruendung: d.begruendung, modell, dedupe_key: dedupeKey(claimId, d),
    })
    if (!error) count++
    // 23505 = unique_violation (Dedup-Kollision, erwartet) — still ueberspringen; alles andere loggen.
    else if (error.code !== '23505' && !error.message.includes('duplicate key')) console.error('[orchestrator] persist failed:', error.message)
  }
  return count
}

export async function listOpenProposals(): Promise<AiProposal[]> {
  const db = createAdminClient()
  const { data } = await db.from('ai_claim_proposals')
    .select('id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload, begruendung, status')
    .eq('status', 'offen').order('erstellt_am', { ascending: false }).limit(200)
  return (data as AiProposal[] | null) ?? []
}

export async function decideProposal(
  id: string, status: 'angenommen' | 'verworfen' | 'bearbeitet', userId: string, feedback?: string,
): Promise<{ ok: boolean; error?: string }> {
  const db = createAdminClient()
  const { error } = await db.from('ai_claim_proposals')
    .update({ status, entschieden_von: userId, entschieden_am: new Date().toISOString(), feedback: feedback ?? null })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
