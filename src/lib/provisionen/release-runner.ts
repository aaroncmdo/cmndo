// #8 Phase 2 (P2): EIN generischer Provisions-Release fuer ALLE partner_typen.
//
// Vorher: zwei per-Typ-Crons (release-makler-provisionen / release-werkstatt-provisionen), beide mit
// hartem `.eq('partner_typ', …)`. 'firmen_flotte' (Mig 20260713181418) wurde damit von KEINEM Cron je
// selektiert => die 150 EUR blieben dauerhaft 'pending' (totes Kapital) und wurden bei Claim-Storno
// auch nie storniert. Die Flotten-Migration deferriert den Release selbst explizit:
//   "Betrag 150 fix. Release = Phase 2 (generischer Cron)."  <- genau das ist dieser Runner.
//
// Die Gate-Logik bleibt unveraendert FG4-A (completion-release-gate.ts): Completion-Signal + 7 Tage,
// Storno hat Vorrang. Dieser Runner ist reine Fetch-/Update-Glue drumherum — kein neues Money-Verhalten.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { istClaimStorniert, deriveCompletionTs, istReleaseBerechtigt } from './completion-release-gate'
import { bezugInExpr } from '@/lib/termine/bezug-filter'

/** partner_provisionen.partner_typ — DB-CHECK (makler/werkstatt/firmen_flotte seit
 *  Mig 20260713181418, makler_empfehlung 20260718205558). */
export type ProvisionPartnerTyp = 'makler' | 'werkstatt' | 'firmen_flotte' | 'makler_empfehlung'

/**
 * Alle Typen, die der generische Cron abarbeitet. 'makler_empfehlung' (10€-Sponsor-Override)
 * fehlte hier bis 08.08. — dieselbe Luecke wie firmen_flotte vor der P2-Unifikation: der Cron
 * selektierte die Rows nie -> sie blieben ewig 'pending' + waren im v_partner_billing unsichtbar.
 * makler_empfehlung ist EXTERN (EXTERNE_PARTNER_TYPEN) -> Suppression greift nie, feuert immer frei.
 */
export const RELEASE_PARTNER_TYPEN: ProvisionPartnerTyp[] = ['makler', 'werkstatt', 'firmen_flotte', 'makler_empfehlung']

export type ReleasePendingRow = {
  id: string
  partner_typ: ProvisionPartnerTyp | string
  fall_id: string | null
  claim_id: string | null
  betrag_netto_eur: number | string
  service_typ: string | null
  partner_id: string
}

export type ReleaseStatus = 'freigegeben' | 'storniert'

export type ReleaseErgebnis =
  | { ok: true; checked: number; storniert: number; released: number; unterdrueckt: number; notifsEmitted: number }
  | { ok: false; error: string }

export type RunProvisionsReleaseOpts = {
  partnerTypen: ProvisionPartnerTyp[]
  now: string
  /**
   * Best-effort-Benachrichtigung pro betroffener Row (der Caller entscheidet je partner_typ).
   * Rueckgabe true = wirklich benachrichtigt (zaehlt in notifsEmitted). Wirft der Hook, bricht der
   * Cron NICHT — der Status-Flip ist wichtiger als die Notification.
   */
  onStatusChange?: (row: ReleasePendingRow, status: ReleaseStatus, grund?: string) => Promise<boolean>
  /**
   * Freundes-Graph-Gate (P3 Netzwerk, K2/K13). Erhaelt die release-BERECHTIGTEN Rows und liefert die
   * Teilmenge der Provisions-Ids, die intra-Freundesnetzwerk sind -> werden auf 'unterdrueckt' gesetzt
   * statt freigegeben (still, ohne onStatusChange). makler/makler_empfehlung sind extern -> nie im Set.
   * Wirft der Hook, degradiert der Lauf fail-open zu Status quo (alles freigeben) mit lautem Log.
   */
  bestimmeUnterdrueckteProvisionen?: (releaseBerechtigt: ReleasePendingRow[]) => Promise<Set<string>>
  /** Max. Rows pro Lauf (Default 500 — wie die Vorgaenger-Crons). */
  limit?: number
}

type CompletionEntry = {
  operativeStatus: string | null
  serviceTyp: string | null
  abgeschlossenAm: string | null
  terminDurchgefuehrtAm: string | null
}

export async function runProvisionsRelease(
  db: SupabaseClient<Database>,
  opts: RunProvisionsReleaseOpts,
): Promise<ReleaseErgebnis> {
  const { partnerTypen, now, onStatusChange, bestimmeUnterdrueckteProvisionen, limit = 500 } = opts

  // Pending-Query. Hold-Filter erst NACH dem Storno-Pass — so erwischen wir auch Provisionen, die nach
  // der Hold-Periode, aber vor dem Cron-Run storniert wurden.
  const { data: pendingRaw, error: pendingErr } = await db
    .from('partner_provisionen')
    .select('id, partner_typ, fall_id, claim_id, betrag_netto_eur, service_typ, partner_id')
    .in('partner_typ', partnerTypen)
    .eq('status', 'pending')
    .limit(limit)

  if (pendingErr) return { ok: false, error: pendingErr.message }

  const pending = (pendingRaw ?? []) as unknown as ReleasePendingRow[]
  if (pending.length === 0) {
    return { ok: true, checked: 0, storniert: 0, released: 0, unterdrueckt: 0, notifsEmitted: 0 }
  }

  // Completion-Signale: Voll-Claim = abgeschlossen_am; nur_gutachter = juengster durchgefuehrter Termin.
  const claimIds = Array.from(new Set(pending.map((p) => p.claim_id).filter((x): x is string => !!x)))
  const completionMap = new Map<string, CompletionEntry>()

  if (claimIds.length > 0) {
    const { data: claims, error: claimsErr } = await db
      .from('claims')
      // T3-slice-2a: claims.status raus — deriveCompletionTs prueft jetzt operative_status (abgeschlossen|reguliert_vollstaendig).
      .select('id, operative_status, service_typ, abgeschlossen_am')
      .in('id', claimIds)
    if (claimsErr) return { ok: false, error: claimsErr.message }

    for (const c of (claims ?? []) as Record<string, unknown>[]) {
      completionMap.set(c.id as string, {
        operativeStatus: (c.operative_status as string | null) ?? null,
        serviceTyp: (c.service_typ as string | null) ?? null,
        abgeschlossenAm: (c.abgeschlossen_am as string | null) ?? null,
        terminDurchgefuehrtAm: null,
      })
    }

    const nurGutachterIds = Array.from(completionMap.entries())
      .filter(([, e]) => e.serviceTyp === 'nur_gutachter')
      .map(([id]) => id)
    if (nurGutachterIds.length > 0) {
      const { data: termine } = await db
        .from('gutachter_termine')
        .select('claim_id, bezug_id, bezug_typ, durchgefuehrt_am')
        .or(bezugInExpr('claim', nurGutachterIds))
        .not('durchgefuehrt_am', 'is', null)
        .order('durchgefuehrt_am', { ascending: false })
      for (const t of (termine ?? []) as Record<string, unknown>[]) {
        // bezug-aware: native Claim-Termine haben claim_id NULL, tragen den Claim in bezug_id.
        const cid = (t.claim_id as string | null) ?? (t.bezug_typ === 'claim' ? (t.bezug_id as string | null) : null)
        if (!cid) continue
        const e = completionMap.get(cid)
        if (e && !e.terminDurchgefuehrtAm) e.terminDurchgefuehrtAm = (t.durchgefuehrt_am as string | null) ?? null
      }
    }
  }

  const completionOf = (p: ReleasePendingRow): CompletionEntry | null =>
    p.claim_id ? completionMap.get(p.claim_id) ?? null : null

  let notifsEmitted = 0
  const notify = async (row: ReleasePendingRow, status: ReleaseStatus, grund?: string): Promise<void> => {
    if (!onStatusChange) return
    try {
      if (await onStatusChange(row, status, grund)) notifsEmitted++
    } catch (err) {
      console.error('[release-runner] onStatusChange failed', err)
    }
  }

  // 1) Storno-Pass: Claim storniert/abgelehnt -> Provision storniert (nie freigeben).
  // Der Update braucht KEINEN partner_typ-Filter: die IDs stammen aus der oben getypten Selektion (PK).
  const stornoRows = pending.filter((p) => istClaimStorniert(completionOf(p)?.operativeStatus ?? null))
  let storniert = 0
  if (stornoRows.length > 0) {
    const { error } = await db
      .from('partner_provisionen')
      .update({ status: 'storniert', storniert_am: now, storno_grund: 'fall_storniert' })
      .in('id', stornoRows.map((p) => p.id))
    if (error) return { ok: false, error: error.message }
    storniert = stornoRows.length
    for (const p of stornoRows) await notify(p, 'storniert', 'Der vermittelte Fall wurde storniert.')
  }

  // 2) Release-Pass: nur freigeben wenn der Claim ABGESCHLOSSEN ist (Completion) UND 7 Tage vorbei sind.
  const stornoSet = new Set(stornoRows.map((p) => p.id))
  const releaseRows = pending.filter((p) => {
    if (stornoSet.has(p.id)) return false
    const c = completionOf(p)
    if (!c || istClaimStorniert(c.operativeStatus)) return false
    return istReleaseBerechtigt(
      deriveCompletionTs({
        serviceTyp: c.serviceTyp,
        operativeStatus: c.operativeStatus,
        abgeschlossenAm: c.abgeschlossenAm,
        terminDurchgefuehrtAm: c.terminDurchgefuehrtAm,
      }),
      now,
    )
  })

  // 2b) Suppression-Pass (P3 Netzwerk): intra-Freundesnetzwerk-Provisionen werden unterdrueckt
  // statt freigegeben (Abo deckt die Leistung — Spec 1 §13b). Nur release-BERECHTIGTE Rows werden
  // gegated; Storno/Hold bleiben unberuehrt. Fail-open: wirft der Hook, wird alles freigegeben.
  let unterdruecktSet = new Set<string>()
  if (bestimmeUnterdrueckteProvisionen && releaseRows.length > 0) {
    try {
      unterdruecktSet = await bestimmeUnterdrueckteProvisionen(releaseRows)
    } catch (err) {
      console.error('[release-runner] Suppression-Gate warf — fail-open zu Status quo (freigeben):', err)
      unterdruecktSet = new Set()
    }
  }
  const unterdrueckteRows = releaseRows.filter((p) => unterdruecktSet.has(p.id))
  const freizugebendeRows = releaseRows.filter((p) => !unterdruecktSet.has(p.id))

  let unterdrueckt = 0
  if (unterdrueckteRows.length > 0) {
    const { error } = await db
      .from('partner_provisionen')
      .update({ status: 'unterdrueckt', storno_grund: 'intra_netzwerk' })
      .in('id', unterdrueckteRows.map((p) => p.id))
    if (error) return { ok: false, error: error.message }
    unterdrueckt = unterdrueckteRows.length
    // K13 "still": KEIN notify — intra-Netzwerk ist operativ, nicht verguetungsrelevant.
  }

  let released = 0
  if (freizugebendeRows.length > 0) {
    const { error } = await db
      .from('partner_provisionen')
      .update({ status: 'freigegeben' })
      .in('id', freizugebendeRows.map((p) => p.id))
    if (error) return { ok: false, error: error.message }
    released = freizugebendeRows.length
    for (const p of freizugebendeRows) await notify(p, 'freigegeben')
  }

  return { ok: true, checked: pending.length, storniert, released, unterdrueckt, notifsEmitted }
}
