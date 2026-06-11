// AAR-493 (M11): Täglicher Cron (02:00 UTC) — prüft alle pending
// Makler-Provisionen:
//
//   1. Storno-Pass: Ist der zugehörige Fall auf "storniert" gekippt,
//      wird die Provision auf status='storniert' + storno_grund
//      'fall_storniert' + storniert_am=NOW() gesetzt.
//   2. Release-Pass: Für alle verbleibenden pending Provisionen mit
//      hold_until <= NOW() (und Fall nicht storniert) wird der
//      Status auf 'freigegeben' gesetzt.
//   3. Email-Trigger: Nach erfolgreichem Release wird — wenn der
//      Makler in seinen notification_preferences nicht "false" für
//      "provision_freigegeben" gesetzt hat — eine Email gesendet.
//
// Auth: Bearer-Token via CRON_SECRET (Projekt-Konvention, siehe
// z.B. /api/cron/fall-abschluss).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendProvisionReleaseEmail } from '@/lib/email/makler-notifications'

export const dynamic = 'force-dynamic'

type PendingRow = {
  id: string
  fall_id: string | null
  claim_id: string | null
  betrag_netto_eur: number | string
  service_typ: 'komplett' | 'nur_gutachter'
  hold_until: string
  makler_id: string
}

type MaklerRow = {
  id: string
  email: string
  ansprechpartner_vorname: string | null
  notification_preferences: Record<string, unknown> | null
}

type FallRow = {
  id: string
  claim_nummer: string | null
  status: string
}

type LeadRow = {
  fall_id: string | null
  vorname: string | null
  nachname: string | null
}

function buildKundeName(vorname: string | null, nachname: string | null) {
  const full = [vorname, nachname].filter(Boolean).join(' ').trim()
  return full.length > 0 ? full : null
}

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()

  // 1) Alle pending Provisionen laden. Hold-Filter wenden wir erst NACH
  // dem Storno-Pass an — dann erwischen wir auch Provisionen die nach
  // der Hold-Periode aber vor Cron-Run storniert wurden.
  const { data: pendingRaw, error: pendingErr } = await db
    .from('makler_provisionen')
    .select('id, fall_id, claim_id, betrag_netto_eur, service_typ, hold_until, makler_id')
    .eq('status', 'pending')
    .limit(500)

  if (pendingErr) {
    return NextResponse.json({ error: pendingErr.message }, { status: 500 })
  }

  const pending = (pendingRaw ?? []) as PendingRow[]
  if (pending.length === 0) {
    return NextResponse.json({ ok: true, storniert: 0, released: 0, emails_sent: 0, checked: 0 })
  }

  // 2) Zugehörige Claims laden (status + Aktennummer für Email).
  // CMM-49 Reader-Sweep: faelle-frei — status (Storno-Check) + claim_nummer kommen direkt aus
  // claims via makler_provisionen.claim_id (native FK, derive-trigger-gefuellt). operative_status
  // ist die CMM-74-SSoT (== faelle.status 0-diff bei non-null). fallMap bleibt fall_id-gekeyt
  // (Storno/Release-Logik + leads-Lookup unveraendert); der fall_id kommt aus makler_provisionen
  // selbst (KEIN claim_id→fall_id-Reverse).
  const claimIds = Array.from(
    new Set(pending.map((p) => p.claim_id).filter((x): x is string => !!x)),
  )
  const fallMap = new Map<string, FallRow>()
  if (claimIds.length > 0) {
    const { data: claims, error: claimsErr } = await db
      .from('claims')
      .select('id, claim_nummer, operative_status')
      .in('id', claimIds)
    if (claimsErr) {
      return NextResponse.json({ error: claimsErr.message }, { status: 500 })
    }
    const claimMap = new Map<string, { claim_nummer: string | null; operative_status: string | null }>()
    for (const c of claims ?? []) {
      claimMap.set(c.id as string, {
        claim_nummer: (c.claim_nummer as string | null) ?? null,
        operative_status: (c.operative_status as string | null) ?? null,
      })
    }
    for (const p of pending) {
      if (!p.fall_id || !p.claim_id) continue
      const c = claimMap.get(p.claim_id)
      if (!c) continue
      // operative_status = SSoT (CMM-74). Die 2 prod-Faelle mit null operative_status verlieren
      // den frueheren faelle.status-Fallback (faelle stirbt) → status '' (≠ 'storniert' → Freigabe).
      // makler_provisionen aktuell 0 Rows → kein Live-Impact; null-operative_status ist ein
      // CMM-74-Mirror-Gap, kein Reader-Concern.
      fallMap.set(p.fall_id, {
        id: p.fall_id,
        status: c.operative_status ?? '',
        claim_nummer: c.claim_nummer,
      })
    }
  }

  // 3) Storno-Pass: Alle pending deren Fall 'storniert' ist → flip.
  const stornoIds = pending
    .filter((p) => p.fall_id && fallMap.get(p.fall_id)?.status === 'storniert')
    .map((p) => p.id)

  let storniert = 0
  if (stornoIds.length > 0) {
    const { error: stornoErr } = await db
      .from('makler_provisionen')
      .update({
        status: 'storniert',
        storniert_am: now,
        storno_grund: 'fall_storniert',
      })
      .in('id', stornoIds)
    if (stornoErr) {
      return NextResponse.json({ error: stornoErr.message }, { status: 500 })
    }
    storniert = stornoIds.length
  }

  // 4) Release-Pass: Verbleibende pending, hold_until <= now, Fall nicht storniert.
  const stornoSet = new Set(stornoIds)
  const toRelease = pending.filter((p) => {
    if (stornoSet.has(p.id)) return false
    if (p.hold_until > now) return false
    const fallStatus = p.fall_id ? fallMap.get(p.fall_id)?.status : null
    return fallStatus !== 'storniert'
  })

  let released = 0
  let emails_sent = 0
  if (toRelease.length > 0) {
    const releaseIds = toRelease.map((p) => p.id)
    const { error: releaseErr } = await db
      .from('makler_provisionen')
      .update({ status: 'freigegeben' })
      .in('id', releaseIds)
    if (releaseErr) {
      return NextResponse.json({ error: releaseErr.message }, { status: 500 })
    }
    released = releaseIds.length

    // Makler-Daten + Kundennamen für Email parallel laden.
    const maklerIds = Array.from(new Set(toRelease.map((p) => p.makler_id)))
    const leadFallIds = toRelease
      .map((p) => p.fall_id)
      .filter((x): x is string => !!x)

    const maklerPromise = db
      .from('makler')
      .select('id, email, ansprechpartner_vorname, notification_preferences')
      .in('id', maklerIds)
    const leadsPromise =
      leadFallIds.length > 0
        ? db
            .from('leads')
            .select('fall_id, vorname, nachname')
            .in('fall_id', leadFallIds)
        : null

    const [maklerRes, leadsRes] = await Promise.all([maklerPromise, leadsPromise])

    const maklerMap = new Map<string, MaklerRow>()
    for (const m of ((maklerRes.data ?? []) as MaklerRow[])) maklerMap.set(m.id, m)
    const leadMap = new Map<string, LeadRow>()
    if (leadsRes) {
      for (const l of ((leadsRes.data ?? []) as LeadRow[])) {
        if (l.fall_id) leadMap.set(l.fall_id, l)
      }
    }

    for (const p of toRelease) {
      const makler = maklerMap.get(p.makler_id)
      if (!makler?.email) continue
      const prefs = (makler.notification_preferences ?? {}) as Record<string, unknown>
      if (prefs.provision_freigegeben === false) continue

      const fall = p.fall_id ? fallMap.get(p.fall_id) ?? null : null
      const lead = p.fall_id ? leadMap.get(p.fall_id) ?? null : null
      const kundeName = lead ? buildKundeName(lead.vorname, lead.nachname) : null

      try {
        const res = await sendProvisionReleaseEmail({
          to: makler.email,
          vorname: makler.ansprechpartner_vorname,
          fallNummer: fall?.claim_nummer ?? null,
          kundeName,
          betrag: Number(p.betrag_netto_eur),
          serviceTyp: p.service_typ,
        })
        if (res.sent) emails_sent++
      } catch (err) {
        console.error('[release-makler-provisionen] email failed', err)
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked: pending.length,
    storniert,
    released,
    emails_sent,
    timestamp: now,
  })
}
