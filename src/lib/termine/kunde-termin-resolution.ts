'use server'

// AAR-939 — Kunde-Selbstauskunft zum nur_gutachter/embed-B-Termin ("Kam dein
// Gutachter?"). Zwei owner-geschuetzte Server-Actions, die das Kunde-Banner
// verdrahtet:
//   • bestaetigeTerminAlsKunde       (JA)   → Termin durchgefuehrt + Claim terminal
//   • meldeSvNichtErschienenAlsKunde (NEIN) → Dispatcher-Klaerungs-Task (KEIN
//        direkter Claim-Move, KEIN sv_no_show_am — das ist bewusst Team-only,
//        Anti-Gaming; €70 bleibt per Default-Cron faellig).
//
// Owner-Check ueber den kanonischen Helper assertKundeOwnsClaim/-Fall. Result
// {ok,error?} (Kaskaden-Konvention). Eigene Datei statt der route-actions.ts,
// weil jene noch das alte {success}-Shape nutzt (kein Mix im File, AGENTS.md).

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertKundeOwnsClaim, assertKundeOwnsFall } from '@/lib/claims/kunde-ownership'
import { closeNurGutachterTerminAlsDurchgefuehrt } from '@/lib/termine/close-nur-gutachter-termin'
import { createEmbedBKlaerungTask } from '@/lib/termine/embed-b-klaerung-task'

type AdminClient = ReturnType<typeof createAdminClient>

type TerminRow = {
  id: string
  fall_id: string | null
  claim_id: string | null
  lead_id: string | null
  durchgefuehrt_am: string | null
  sv_no_show_am: string | null
  sv_ablehnung_am: string | null
}

type ResolvedCtx =
  | {
      ok: true
      db: AdminClient
      userId: string
      termin: TerminRow
      claimId: string
      fallId: string | null
      leadId: string | null
    }
  | { ok: false; error: string }

// Gemeinsame Vorhut beider Actions: Termin laden (admin), Kunde-Ownership pruefen
// (claim_id bevorzugt = SSoT, sonst fall_id) und den nur_gutachter-Service-Typ
// garantieren. Defense-in-depth — der Banner gated zwar server-seitig, die Action
// darf aber nicht fuer komplett-Claims / fremde Termine missbraucht werden.
async function resolveOwnedNurGutachterTermin(terminId: string): Promise<ResolvedCtx> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const db = createAdminClient()
  const { data: terminRaw } = await db
    .from('gutachter_termine')
    .select('id, fall_id, claim_id, lead_id, durchgefuehrt_am, sv_no_show_am, sv_ablehnung_am')
    .eq('id', terminId)
    .maybeSingle()
  if (!terminRaw) return { ok: false, error: 'Termin nicht gefunden' }
  const termin = terminRaw as TerminRow

  const email = user.email ?? null
  let claimId: string | null = null
  let fallId: string | null = termin.fall_id
  let leadId: string | null = termin.lead_id

  if (termin.claim_id) {
    const own = await assertKundeOwnsClaim(db, user.id, email, termin.claim_id)
    if (!own.ok) return { ok: false, error: 'Nicht autorisiert' }
    claimId = own.claimId
    fallId = own.fallId ?? termin.fall_id
    leadId = own.leadId ?? termin.lead_id
  } else if (termin.fall_id) {
    const own = await assertKundeOwnsFall(db, user.id, email, termin.fall_id)
    if (!own.ok) return { ok: false, error: 'Nicht autorisiert' }
    claimId = own.claimId
    fallId = own.fallId
    leadId = own.leadId ?? termin.lead_id
  }
  if (!claimId) return { ok: false, error: 'Kein Claim fuer diesen Termin' }

  const { data: claim } = await db
    .from('claims')
    .select('service_typ')
    .eq('id', claimId)
    .maybeSingle()
  if ((claim?.service_typ as string | null) !== 'nur_gutachter') {
    return { ok: false, error: 'Aktion nur fuer nur_gutachter-Termine' }
  }

  return { ok: true, db, userId: user.id, termin, claimId, fallId, leadId }
}

/**
 * JA — der Kunde bestaetigt, dass der Gutachter zum Termin erschienen ist.
 * Verankert durchgefuehrt_am + schliesst den Claim terminal (geteilte Logik mit
 * der SV-Action). Idempotent; bei bereits anders geklaertem Termin abweisen.
 */
export async function bestaetigeTerminAlsKunde(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveOwnedNurGutachterTermin(terminId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { db, userId, termin, claimId, fallId } = ctx

  if (termin.durchgefuehrt_am) return { ok: true } // Doppelklick / Realtime-Replay
  if (termin.sv_no_show_am || termin.sv_ablehnung_am) {
    return { ok: false, error: 'Dieser Termin ist bereits anders geklärt.' }
  }

  const res = await closeNurGutachterTerminAlsDurchgefuehrt(db, {
    terminId,
    claimId,
    byUserId: userId,
    grund: 'Termin durchgeführt (vom Kunden bestätigt)',
  })
  if (!res.ok) return res

  if (fallId) {
    try {
      await db.from('timeline').insert({
        fall_id: fallId,
        typ: 'termin',
        titel: 'Kunde bestätigt: Gutachter war da',
        beschreibung:
          'Der Kunde hat über das Portal bestätigt, dass der Gutachter zum Termin erschienen ist. Termin als durchgeführt verbucht.',
      })
    } catch {
      /* non-critical */
    }
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
  if (fallId) revalidatePath(`/kunde/faelle/${fallId}`)
  return { ok: true }
}

/**
 * NEIN — der Kunde meldet, dass der Gutachter NICHT erschienen ist. Bewegt den
 * Claim NICHT direkt und setzt sv_no_show_am NICHT (Team-only, Anti-Gaming):
 * erzeugt einen Dispatcher-Klaerungs-Task. Das Team bestaetigt den SV-No-Show
 * (markSvNoShowEmbedB) + vermittelt einen neuen Termin. €70 bleibt per Default.
 */
export async function meldeSvNichtErschienenAlsKunde(
  terminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolveOwnedNurGutachterTermin(terminId)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { db, termin, claimId, fallId, leadId } = ctx

  if (termin.durchgefuehrt_am) {
    return { ok: false, error: 'Dieser Termin wurde bereits als durchgeführt markiert.' }
  }

  const task = await createEmbedBKlaerungTask(db, {
    terminId,
    fallId,
    leadId,
    grund: 'kunde_meldet_sv_no_show',
  })
  if (!task.ok) return { ok: false, error: task.error }

  if (fallId) {
    try {
      await db.from('timeline').insert({
        fall_id: fallId,
        typ: 'termin',
        titel: 'Kunde meldet: Gutachter nicht erschienen',
        beschreibung:
          'Der Kunde hat über das Portal gemeldet, dass der Gutachter nicht zum Termin erschienen ist. Dispatch prüft und vermittelt einen neuen Termin.',
      })
    } catch {
      /* non-critical */
    }
  }

  revalidatePath(`/kunde/faelle/${claimId}`)
  if (fallId) revalidatePath(`/kunde/faelle/${fallId}`)
  return { ok: true }
}
