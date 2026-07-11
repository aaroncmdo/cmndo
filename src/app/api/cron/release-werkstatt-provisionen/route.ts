// WP-E (Task 8): Taeglicher Cron (02:00 UTC) — prueft alle pending
// Werkstatt-Provisionen:
//
//   1. Storno-Pass: Ist der zugehoerige Claim auf "storniert" oder
//      "abgelehnt" gekippt, wird die Provision auf
//      status='storniert', storno_grund='fall_storniert',
//      storniert_am=NOW() gesetzt.
//   2. Release-Pass: pending Provisionen mit hold_until <= NOW(), Claim nicht
//      storniert/abgelehnt werden auf 'freigegeben' gesetzt. WS6 Money-Hebel:
//      reparatur-vermittelte Provisionen (trigger_event='reparatur_*') zusaetzlich
//      erst nach Reparatur-Completion (kein praematures Timer-Release ohne Reparatur).
//      Kein Email-Trigger — Werkstaetten sehen Provisionen im Portal.
//
// Auth: Bearer-Token via CRON_SECRET (Projekt-Konvention, analog
// /api/cron/release-makler-provisionen).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type PendingRow = {
  id: string
  claim_id: string | null
  hold_until: string
  trigger_event: string | null
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
    .select('id, claim_id, hold_until, trigger_event')
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

  // 2) Zugehoerige Claims laden (operative_status fuer Storno-Erkennung).
  const claimIds = Array.from(
    new Set(pending.map((p) => p.claim_id).filter((x): x is string => !!x)),
  )

  const cancelledClaimIds = new Set<string>()
  const completedClaimIds = new Set<string>()
  if (claimIds.length > 0) {
    const { data: claims, error: claimsErr } = await db
      .from('claims')
      .select('id, operative_status, geschlossen_grund')
      .in('id', claimIds)
    if (claimsErr) {
      return NextResponse.json({ error: claimsErr.message }, { status: 500 })
    }
    for (const c of claims ?? []) {
      const st = (c.operative_status as string | null) ?? null
      if (st === 'storniert' || st === 'abgelehnt') {
        cancelledClaimIds.add(c.id as string)
      }
      // WS6 Money-Hebel: Completion-Signal fuer reparatur-vermittelte Provisionen —
      // Claim abgeschlossen mit geschlossen_grund='reparatur_erledigt'.
      if (st === 'abgeschlossen' && (c.geschlossen_grund as string | null) === 'reparatur_erledigt') {
        completedClaimIds.add(c.id as string)
      }
    }
    // Zweites Completion-Signal: ein erledigter reparatur_termine (Werkstatt hat "Reparatur
    // abgeschlossen" gemeldet) — deckt Claims ab, die (noch) nicht auf abgeschlossen geflippt sind.
    const { data: rt } = await db
      .from('reparatur_termine')
      .select('claim_id')
      .eq('status', 'erledigt')
      .in('claim_id', claimIds)
    for (const r of rt ?? []) {
      if (r.claim_id) completedClaimIds.add(r.claim_id as string)
    }
  }

  // 3) Storno-Pass: pending deren Claim storniert/abgelehnt ist → flip.
  const stornoIds = pending
    .filter((p) => p.claim_id && cancelledClaimIds.has(p.claim_id))
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

  // 4) Release-Pass: pending, hold_until <= now, Claim nicht storniert. WS6 Money-Hebel:
  // reparatur-vermittelte Provisionen (trigger_event='reparatur_*') erst nach Reparatur-
  // Completion — die praemature 7-Tage-Timer-Freigabe OHNE Reparatur ist damit raus. QR-Inbound
  // (claim_created = Referral-Provision) behaelt die Timer-Freigabe. Der WS6-Completion-Flip
  // (event-driven, #4109) bleibt der schnelle Pfad; dieser Cron ist das Sicherheitsnetz.
  const stornoSet = new Set(stornoIds)
  const releaseIds = pending
    .filter((p) => {
      if (stornoSet.has(p.id)) return false
      if (p.hold_until > now) return false
      if (p.claim_id && cancelledClaimIds.has(p.claim_id)) return false
      const istReparaturVermittelt = (p.trigger_event ?? '').startsWith('reparatur')
      if (istReparaturVermittelt && (!p.claim_id || !completedClaimIds.has(p.claim_id))) return false
      return true
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
