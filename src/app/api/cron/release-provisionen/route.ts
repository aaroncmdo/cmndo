// #8 P2 — EIN Cron fuer ALLE Provisions-Typen (makler + werkstatt + firmen_flotte).
//
// Loest die beiden per-Typ-Crons ab. 'firmen_flotte' (Mig 20260713181418) hatte NIE einen Release-Pfad:
// beide Alt-Crons filtern hart auf .eq('partner_typ', 'makler'|'werkstatt') => Flotten-Provisionen
// (150 EUR) blieben dauerhaft 'pending' und wurden bei Claim-Storno nie storniert. Die Flotten-Migration
// deferriert den Release selbst explizit auf "Phase 2 (generischer Cron)" — das ist diese Route.
//
// Gate unveraendert FG4-A: Completion-Signal + 7 Tage Hold; Storno hat Vorrang (completion-release-gate.ts).
// Auth: Bearer-Token via CRON_SECRET.
//
// OPS (VPS-crontab): diese Route taeglich 02:00 UTC armieren und die beiden Alt-Eintraege
//   /api/cron/release-makler-provisionen + /api/cron/release-werkstatt-provisionen entfernen.
//   Uebergangsweise ist ein Parallellauf ungefaehrlich: der Flip ist idempotent (pending -> freigegeben;
//   der zweite Lauf findet die Row nicht mehr als pending, also auch keine Doppel-Benachrichtigung).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runProvisionsRelease, RELEASE_PARTNER_TYPEN } from '@/lib/provisionen/release-runner'
import { notifyMaklerProvisionStatus } from '@/lib/provisionen/notify-makler-provision'
import { bestimmeIntraNetzwerkProvisionen } from '@/lib/netzwerk/provisions-suppression'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date().toISOString()
  const admin = createAdminClient()
  const result = await runProvisionsRelease(admin, {
    partnerTypen: RELEASE_PARTNER_TYPEN,
    now,
    onStatusChange: notifyMaklerProvisionStatus,
    // P3 Netzwerk: intra-Freundesnetzwerk-Provisionen unterdruecken statt freigeben (Spec 1 §13b).
    // makler ist extern (EXTERNE_PARTNER_TYPEN) -> vom Gate nie erfasst, feuert weiter.
    bestimmeUnterdrueckteProvisionen: (rows) => bestimmeIntraNetzwerkProvisionen(admin, rows),
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    partner_typen: RELEASE_PARTNER_TYPEN,
    checked: result.checked,
    storniert: result.storniert,
    released: result.released,
    unterdrueckt: result.unterdrueckt,
    notifs_emitted: result.notifsEmitted,
    timestamp: now,
  })
}
