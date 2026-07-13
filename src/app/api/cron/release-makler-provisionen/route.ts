// AAR-493 (M11) + Makler-Value-Loop: Täglicher Cron (02:00 UTC) — prüft alle pending
// Makler-Provisionen:
//
//   1. Storno-Pass: Ist der zugehörige Fall 'storniert', wird die Provision auf
//      status='storniert' gesetzt UND der Makler via N5 benachrichtigt (vorher stumm).
//   2. Release-Pass: pending mit hold_until <= NOW() (und Fall nicht storniert) → 'freigegeben'.
//   3. Benachrichtigung: statt Ad-hoc-Email jetzt emitEvent('makler.provision_status') → N5
//      liefert über alle Kanäle (in_app/web_push/email) + Audit-Log + respektiert das
//      provision_freigegeben-Opt-Out (via preferences.ts loadMaklerEmailFallback).
//
// Auth: Bearer-Token via CRON_SECRET.

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { emitEvent } from '@/lib/notifications/emit'
import { istClaimStorniert, deriveCompletionTs, istReleaseBerechtigt } from '@/lib/provisionen/completion-release-gate'

export const dynamic = 'force-dynamic'

type PendingRow = {
  id: string
  fall_id: string | null
  claim_id: string | null
  betrag_netto_eur: number | string
  service_typ: 'komplett' | 'nur_gutachter'
  hold_until: string
  partner_id: string
}

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  // Alle pending Provisionen laden. Hold-Filter erst NACH dem Storno-Pass (erwischt auch
  // Provisionen die nach der Hold-Periode aber vor Cron-Run storniert wurden).
  const { data: pendingRaw, error: pendingErr } = await db
    .from('partner_provisionen')
    .select('id, fall_id, claim_id, betrag_netto_eur, service_typ, hold_until, partner_id')
    .eq('partner_typ', 'makler')
    .eq('status', 'pending')
    .limit(500)

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }

  const pending = (pendingRaw ?? []) as PendingRow[]
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, storniert: 0, released: 0, notifs_emitted: 0, checked: 0 })
  }

  // FG4-A: Claims + Completion-Signale laden (Completion+7d-Gate statt blindem hold_until).
  // Voll-Claim = operative_status='abgeschlossen'/status='reguliert_vollstaendig' → abgeschlossen_am;
  // nur_gutachter = jüngster durchgeführter Gutachter-Termin (durchgefuehrt_am).
  const claimIds = Array.from(
    new Set(pending.map((p) => p.claim_id).filter((x): x is string => !!x)),
  )
  type CompletionEntry = {
    claimNummer: string | null
    operativeStatus: string | null
    claimStatus: string | null
    serviceTyp: string | null
    abgeschlossenAm: string | null
    terminDurchgefuehrtAm: string | null
  }
  const completionMap = new Map<string, CompletionEntry>()
  if (claimIds.length > 0) {
    const { data: claims, error: claimsErr } = await db
      .from('claims')
      .select('id, claim_nummer, operative_status, status, service_typ, abgeschlossen_am')
      .in('id', claimIds)
    if (claimsErr) {
      return NextResponse.json({ error: claimsErr.message }, { status: 500 })
    }
    for (const c of claims ?? []) {
      completionMap.set(c.id as string, {
        claimNummer: (c.claim_nummer as string | null) ?? null,
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

  // Value-Loop: Makler pro Provision benachrichtigen (best-effort — bricht den Cron nie).
  // N5 handhabt Kanäle (in_app/web_push/email) + Opt-Outs + Audit. fan-out targetet payload.maklerId.
  const notifyMakler = async (
    p: PendingRow,
    status: 'freigegeben' | 'storniert',
    grund?: string,
  ): Promise<boolean> => {
    try {
      await emitEvent('makler.provision_status', {
        fallId: p.fall_id ?? p.claim_id ?? '',
        provisionId: p.id,
        maklerId: p.partner_id,
        status,
        betragEur: Number(p.betrag_netto_eur),
        grund,
      })
      return true
    } catch (err) {
      console.error(`[release-makler-provisionen] provision_status emit (${status}) failed`, err)
      return false
    }
  }

  let notifs_emitted = 0

  // 1) Storno-Pass: Claim storniert/abgelehnt → flip + Makler benachrichtigen (einheitlich via istClaimStorniert).
  const stornoRows = pending.filter((p) => istClaimStorniert(completionOf(p)?.operativeStatus ?? null))
  const stornoIds = stornoRows.map((p) => p.id)
  let storniert = 0
  if (stornoIds.length > 0) {
    const { error: stornoErr } = await db
      .from('partner_provisionen')
      .update({ status: 'storniert', storniert_am: now, storno_grund: 'fall_storniert' })
      .eq('partner_typ', 'makler')
      .in('id', stornoIds)
    if (stornoErr) {
      return NextResponse.json({ error: stornoErr.message }, { status: 500 })
    }
    storniert = stornoIds.length
    for (const p of stornoRows) {
      if (await notifyMakler(p, 'storniert', 'Der vermittelte Fall wurde storniert.')) notifs_emitted++
    }
  }

  // 2) Release-Pass: FG4-A — nur freigeben wenn der Claim ABGESCHLOSSEN ist (Completion-Signal) UND
  // 7 Tage seit Completion vergangen sind. Kein blinder hold_until mehr (der gab Provisionen vor der
  // Fall-Completion frei — Prod-Bug). Storno/nicht-abgeschlossen/unbekannt → HOLD.
  const stornoSet = new Set(stornoIds)
  const toRelease = pending.filter((p) => {
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

  let released = 0
  if (toRelease.length > 0) {
    const releaseIds = toRelease.map((p) => p.id)
    const { error: releaseErr } = await db
      .from('partner_provisionen')
      .update({ status: 'freigegeben' })
      .eq('partner_typ', 'makler')
      .in('id', releaseIds)
    if (releaseErr) {
      return NextResponse.json({ error: releaseErr.message }, { status: 500 })
    }
    released = releaseIds.length
    for (const p of toRelease) {
      if (await notifyMakler(p, 'freigegeben')) notifs_emitted++
    }
  }

  return NextResponse.json({
    ok: true,
    checked: pending.length,
    storniert,
    released,
    notifs_emitted,
    timestamp: now,
  })
}
