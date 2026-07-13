// WP-E (Task 8): Taeglicher Cron (02:00 UTC) — prueft alle pending
// Werkstatt-Provisionen:
//
//   1. Storno-Pass: Ist der zugehoerige Claim auf "storniert" oder
//      "abgelehnt" gekippt, wird die Provision auf
//      status='storniert', storno_grund='fall_storniert',
//      storniert_am=NOW() gesetzt.
//   2. Release-Pass: Fuer alle verbleibenden pending Provisionen mit
//      hold_until <= NOW() (und Claim nicht storniert/abgelehnt) wird
//      der Status auf 'freigegeben' gesetzt.
//      Kein Email-Trigger — Werkstaetten sehen Provisionen im Portal.
//
// Auth: Bearer-Token via CRON_SECRET (Projekt-Konvention, analog
// /api/cron/release-makler-provisionen).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { istClaimStorniert, deriveCompletionTs, istReleaseBerechtigt } from '@/lib/provisionen/completion-release-gate'

export const dynamic = 'force-dynamic'

type PendingRow = {
  id: string
  claim_id: string | null
  hold_until: string
}

type CompletionEntry = {
  operativeStatus: string | null
  claimStatus: string | null
  serviceTyp: string | null
  abgeschlossenAm: string | null
  terminDurchgefuehrtAm: string | null
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  // 1) Alle pending Provisionen laden. Hold-Filter erst NACH Storno-Pass —
  // so erwischen wir auch Provisionen, die nach der Hold-Periode aber vor
  // dem Cron-Run storniert wurden.
  const { data: pendingRaw, error: pendingErr } = await db
    .from('partner_provisionen')
    .select('id, claim_id, hold_until')
    .eq('partner_typ', 'werkstatt')
    .eq('status', 'pending')
    .limit(500)

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }

  const pending = (pendingRaw ?? []) as PendingRow[]
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, storniert: 0, released: 0, checked: 0, timestamp: now })
  }

  // 2) FG4-A: Claims + Completion-Signale laden (Completion+7d-Gate statt blindem hold_until, einheitlich
  // mit release-makler-provisionen). Voll-Claim = abgeschlossen_am; nur_gutachter = durchgeführter Termin.
  const claimIds = Array.from(
    new Set(pending.map((p) => p.claim_id).filter((x): x is string => !!x)),
  )

  const completionMap = new Map<string, CompletionEntry>()
  if (claimIds.length > 0) {
    const { data: claims, error: claimsErr } = await db
      .from('claims')
      .select('id, operative_status, status, service_typ, abgeschlossen_am')
      .in('id', claimIds)
    if (claimsErr) {
      return NextResponse.json({ error: claimsErr.message }, { status: 500 })
    }
    for (const c of claims ?? []) {
      completionMap.set(c.id as string, {
        operativeStatus: (c.operative_status as string | null) ?? null,
        claimStatus: (c.status as string | null) ?? null,
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
        .select('claim_id, durchgefuehrt_am')
        .in('claim_id', nurGutachterIds)
        .not('durchgefuehrt_am', 'is', null)
        .order('durchgefuehrt_am', { ascending: false })
      for (const t of termine ?? []) {
        const cid = t.claim_id as string | null
        if (!cid) continue
        const e = completionMap.get(cid)
        if (e && !e.terminDurchgefuehrtAm) e.terminDurchgefuehrtAm = (t.durchgefuehrt_am as string | null) ?? null
      }
    }
  }
  const completionOf = (p: PendingRow): CompletionEntry | null =>
    p.claim_id ? completionMap.get(p.claim_id) ?? null : null

  // 3) Storno-Pass: Claim storniert/abgelehnt → flip (einheitlich via istClaimStorniert).
  const stornoIds = pending
    .filter((p) => istClaimStorniert(completionOf(p)?.operativeStatus ?? null))
    .map((p) => p.id)

  let storniert = 0
  if (stornoIds.length > 0) {
    const { error: stornoErr } = await db
      .from('partner_provisionen')
      .update({
        status: 'storniert',
        storniert_am: now,
        storno_grund: 'fall_storniert',
      })
      .eq('partner_typ', 'werkstatt')
      .in('id', stornoIds)
    if (stornoErr) {
      return NextResponse.json({ error: stornoErr.message }, { status: 500 })
    }
    storniert = stornoIds.length
  }

  // 4) Release-Pass: FG4-A — nur freigeben wenn der Claim ABGESCHLOSSEN ist (Completion-Signal) UND
  // 7 Tage seit Completion vergangen sind. Kein blinder hold_until mehr; Storno/nicht-abgeschlossen/
  // unbekannt → HOLD. Einheitlich mit release-makler-provisionen (Aaron 13.07.).
  const stornoSet = new Set(stornoIds)
  const releaseIds = pending
    .filter((p) => {
      if (stornoSet.has(p.id)) return false
      const c = completionOf(p)
      if (!c || istClaimStorniert(c.operativeStatus)) return false
      return istReleaseBerechtigt(
        deriveCompletionTs({
          serviceTyp: c.serviceTyp,
          operativeStatus: c.operativeStatus,
          claimStatus: c.claimStatus,
          abgeschlossenAm: c.abgeschlossenAm,
          terminDurchgefuehrtAm: c.terminDurchgefuehrtAm,
        }),
        now,
      )
    })
    .map((p) => p.id)

  let released = 0
  if (releaseIds.length > 0) {
    const { error: releaseErr } = await db
      .from('partner_provisionen')
      .update({ status: 'freigegeben' })
      .eq('partner_typ', 'werkstatt')
      .in('id', releaseIds)
    if (releaseErr) {
      return NextResponse.json({ error: releaseErr.message }, { status: 500 })
    }
    released = releaseIds.length
  }

  return NextResponse.json({
    ok: true,
    checked: pending.length,
    storniert,
    released,
    timestamp: now,
  })
}
