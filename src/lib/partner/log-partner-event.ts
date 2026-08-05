// System-Event-Writer fuer den Partner-Cockpit-Feed. service-role (createAdminClient),
// ist_system=true, erstellt_von=null. FIRE-AND-FORGET: ein Fehler bricht NIE den Haupt-Write
// der aufrufenden operativen Action (AGENTS §Server-Actions — Non-critical Sub-Operation).
import { createAdminClient } from '@/lib/supabase/admin'
import type { PartnerTyp, PartnerAktivitaetTyp } from './aktivitaet-types'

export type LogPartnerEventInput = {
  partnerTyp: PartnerTyp
  partnerId: string
  typ: PartnerAktivitaetTyp
  text: string
  meta?: Record<string, unknown> | null
}

export function buildPartnerEventRow(input: LogPartnerEventInput) {
  return {
    partner_typ: input.partnerTyp,
    partner_id: input.partnerId,
    typ: input.typ,
    text: input.text,
    meta: input.meta ?? null,
    ist_system: true,
    erstellt_von: null,
  }
}

export async function logPartnerEvent(input: LogPartnerEventInput): Promise<void> {
  try {
    const db = createAdminClient()
    const { error } = await db.from('partner_aktivitaeten').insert(buildPartnerEventRow(input))
    if (error) console.error('[logPartnerEvent] insert failed (non-fatal):', error.message)
  } catch (err) {
    console.error('[logPartnerEvent] threw (non-fatal):', err)
  }
}
