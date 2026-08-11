import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { createLead, type LeadBase, type LeadExtra } from '@/lib/leads/create-lead'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { convertLeadToFall } from '@/lib/leads/convert-lead-to-fall'
import { findRecentIntakeLead } from './recent-intake-lead'
import type { DedupKeyInput } from './dedup-key'

// C2 (Fundament, Ein Intake): kapselt DIE Meldung mit garantierten, idempotenten Nachwirkungen.
// mode='lead-first'  -> Lead + FlowLink (Muster L: Konversion spaeter via /flow).
// mode='direct-claim' -> zusaetzlich Claim (via convertLeadToFall = Kern + Pflichtdok + Kunde-WA + KB).
// FlowLink IMMER (DECISIONS 2026-08-04 · C2 §7#1): idempotenter Kunde-Kanal-Fallback.
// Reihenfolge + Non-Fatalitaet je Sub-Effekt wie im Wrapper; Dedup zuerst.

export type CreateCaseInput = {
  mode: 'lead-first' | 'direct-claim'
  base: LeadBase
  extra?: LeadExtra
  /** Fuer die direct-claim-Konversion (KB-Zuweisung, Timeline-Actor).
   *  C2b: OPTIONAL — die public-Eingaenge (Embed-Finder B-1, Aircall-Webhook D-4b) haben keinen
   *  eingeloggten User und sind immer 'lead-first' (Konversion spaeter via /flow). Im
   *  direct-claim-Zweig bleibt er Pflicht (Guard unten). */
  triggerByUserId?: string
  /** Optionaler Dedup-Key (Person+Schaden). Fehlt/unbrauchbar -> kein Dedup. */
  dedup?: DedupKeyInput
  flowLink?: { serviceTyp?: string | null; sprache?: string | null }
}

export type CreateCaseResult =
  | { ok: true; leadId: string; claimId: string | null; flowLinkToken: string | null; deduped: boolean }
  | { ok: false; error: string }

export async function createCase(
  client: SupabaseClient<Database>,
  input: CreateCaseInput,
): Promise<CreateCaseResult> {
  // 1. Dedup — existierender frischer Lead/Claim zum selben Key? -> denselben zurueck, kein Zweit-Insert.
  if (input.dedup) {
    const hit = await findRecentIntakeLead(input.dedup)
    if (hit) {
      return { ok: true, leadId: hit.leadId, claimId: hit.claimId, flowLinkToken: null, deduped: true }
    }
  }

  // 2. Lead (createLead erzwingt source_channel + gueltigen status via LeadBase).
  const created = await createLead(client, input.base, input.extra)
  if (!created.ok) return { ok: false, error: created.error }
  const leadId = created.leadId

  // 3. FlowLink IMMER (schliesst die B-2/C-4-„kein Kunde-Kanal"-Luecke). Non-fatal: bei Fehler
  //    trotzdem weiter — der Fall/Lead steht, der Link ist nachziehbar (idempotent).
  const fl = await ensureCanonicalFlowLinkForLead(leadId, {
    serviceTyp: input.flowLink?.serviceTyp ?? null,
    sprache: input.flowLink?.sprache ?? null,
  })
  const flowLinkToken = fl.ok ? fl.token : null
  if (!fl.ok) console.error('[intake/createCase] FlowLink fehlgeschlagen (non-fatal):', fl.error)

  // 4. direct-claim: Konversion ueber den Wrapper (Kern + Pflichtdok + Kunde-WA + KB + link-data).
  //    convertLeadToFall WIRFT -> hier abfangen und in ein Result-Object uebersetzen.
  let claimId: string | null = null
  if (input.mode === 'direct-claim') {
    // C2b: triggerByUserId ist nur hier Pflicht (KB-Zuweisung + Timeline-Actor). Fehlt er,
    // waere die Konversion actor-los -> harter Fehler statt stiller Falsch-Zuordnung.
    if (!input.triggerByUserId) {
      console.error('[intake/createCase] direct-claim ohne triggerByUserId')
      return { ok: false, error: 'Interner Fehler: Fall-Anlage ohne Benutzer-Kontext.' }
    }
    try {
      const conv = await convertLeadToFall(client, leadId, input.triggerByUserId)
      claimId = conv.fallId // claims = SSoT, fall-id === claim-id
    } catch (err) {
      console.error('[intake/createCase] convertLeadToFall:', err)
      return { ok: false, error: 'Beim Anlegen des Falls ist etwas schiefgelaufen. Bitte versuche es erneut.' }
    }
  }

  return { ok: true, leadId, claimId, flowLinkToken, deduped: false }
}
