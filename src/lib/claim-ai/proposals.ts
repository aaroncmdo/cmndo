// Copilot-Proposals in den geteilten Spine ai_claim_proposals (quelle='copilot').
import { createHash, randomUUID } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import type { ClaimAiDraft } from './verbs'

export type ClaimProposalRow = {
  id: string
  claim_id: string
  erstellt_am: string
  vorschlag_typ: string
  ziel_rolle: string | null
  payload: Record<string, unknown>
  begruendung: string
  status: 'offen' | 'angenommen' | 'verworfen' | 'bearbeitet'
  quelle: string
  ausfuehrung_ergebnis: Record<string, unknown> | null
  entschieden_am: string | null
}

// Interaktive Vorschlaege sind bewusst NICHT content-deduped (jeder Klick zaehlt) —
// randomUUID im Key umgeht den Partial-Unique-Index (dedupe_key WHERE status=offen).
function copilotDedupeKey(claimId: string, d: ClaimAiDraft): string {
  return createHash('sha256')
    .update(claimId + d.vorschlagTyp + JSON.stringify(d.payload) + randomUUID())
    .digest('hex')
    .slice(0, 32)
}

export async function persistCopilotProposals(
  claimId: string,
  modell: string,
  drafts: ClaimAiDraft[],
): Promise<string[]> {
  if (!drafts.length) return []
  const db = createAdminClient()
  const ids: string[] = []
  for (const d of drafts) {
    const { data, error } = await db
      .from('ai_claim_proposals')
      .insert({
        claim_id: claimId,
        vorschlag_typ: d.vorschlagTyp,
        ziel_rolle: d.zielRolle,
        payload: d.payload,
        begruendung: d.begruendung,
        modell,
        dedupe_key: copilotDedupeKey(claimId, d),
        quelle: 'copilot',
      })
      .select('id')
      .single()
    if (!error && data?.id) ids.push(data.id as string)
    else if (error) console.error('[claim-ai] persist proposal failed:', error.message)
  }
  return ids
}

export async function listClaimProposals(claimId: string): Promise<ClaimProposalRow[]> {
  const db = createAdminClient()
  const { data } = await db
    .from('ai_claim_proposals')
    .select('id, claim_id, erstellt_am, vorschlag_typ, ziel_rolle, payload, begruendung, status, quelle, ausfuehrung_ergebnis, entschieden_am')
    .eq('claim_id', claimId)
    // Ink. 1: nur Copilot-Vorschlaege. Der LIVE-Orchestrator schreibt escalation/
    // next_step (payload {grund}/{hinweis}) in denselben Spine; ohne diesen Filter
    // erschienen sie hier mit Freigeben-Button, und der Executor (VERB_KIND ?? 'auto')
    // wuerde ihre payload still verwerfen. Orchestrator-Anzeige + -Handling = Ink. 3.
    .eq('quelle', 'copilot')
    .order('erstellt_am', { ascending: false })
  return (data as ClaimProposalRow[] | null) ?? []
}
