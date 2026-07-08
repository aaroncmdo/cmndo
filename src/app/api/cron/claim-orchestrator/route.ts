import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStagnant, STAGNATION } from '@/lib/orchestrator/stagnation'
import { buildClaimContext } from '@/lib/orchestrator/context'
import { reviewClaim } from '@/lib/orchestrator/run'
import { istTestOderSeedFall, hatAktiveOffeneTasks } from '@/lib/orchestrator/hygiene'
import { istTestEmail } from '@/lib/testdaten/ist-test-email'
import { checkAndRevertAutoQuality } from '@/lib/orchestrator/quality-regression'

export const dynamic = 'force-dynamic'

/**
 * AI-Claim-Orchestrator-Cron.
 *
 * Holt aktive, nicht abgeschlossene Claims (Basis-Tabellen — KEINE auth-gated Views),
 * filtert stagnierende Faelle per isStagnant, ruft reviewClaim (Claude Tool-Use) auf
 * und loggt das Ergebnis in cron_jobs_audit.
 *
 * VPS-Crontab-Eintrag (Aaron) — taegliche oder stuendliche Ausfuehrung:
 *   0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/claim-orchestrator
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    // Kandidaten-Query: Basis-Tabelle claims (service_role-lesbar, kein auth-Gate).
    // Subquery fuer last_activity via RPC wuerde DDL brauchen → JS-seitig erledigen:
    // Wir holen id + updated_at + last_activity (max timeline.created_at) via
    // separaten Timeline-Fetch in buildClaimContext; hier nur Grob-Filter.
    // Spec Override §4: aktive Claims mit last_activity aus timeline — einfachster
    // korrekter Weg: pro aktivem Claim buildClaimContext aufrufen, dann isStagnant.
    const { data: activeClaims, error: claimsError } = await supabase
      .from('claims')
      .select('id, updated_at, sv_id, geschaedigter_user_id, created_by_user_id')
      .eq('ist_aktiv', true)
      .is('abgeschlossen_am', null)
      .limit(500)

    if (claimsError) {
      throw new Error(`claims-Fetch fehlgeschlagen: ${claimsError.message}`)
    }

    // --- Kandidaten-Hygiene: Test-/Seed-Faelle raus (Spec §2) ---
    // Test-SV-IDs (Basis-Tabelle, ist_testaccount-Konvention).
    const { data: testSvs } = await supabase
      .from('sachverstaendige')
      .select('id')
      .eq('ist_testaccount', true)
    const testSvIds = new Set(((testSvs ?? []) as Array<{ id: string }>).map((s) => s.id))

    // Test-Kunde-IDs: Profile der Kandidaten-User laden, per Email-Regex filtern.
    const userIds = [
      ...new Set(
        ((activeClaims ?? []) as Array<{ geschaedigter_user_id: string | null; created_by_user_id: string | null }>)
          .flatMap((c) => [c.geschaedigter_user_id, c.created_by_user_id])
          .filter((x): x is string => !!x),
      ),
    ]
    const testUserIds = new Set<string>()
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, email').in('id', userIds)
      for (const p of (profs ?? []) as Array<{ id: string; email: string | null }>) {
        if (istTestEmail(p.email)) testUserIds.add(p.id)
      }
    }

    const kandidaten = ((activeClaims ?? []) as Array<{
      id: string
      updated_at: string | null
      sv_id: string | null
      geschaedigter_user_id: string | null
      created_by_user_id: string | null
    }>).filter((c) => !istTestOderSeedFall(c, { testSvIds, testUserIds }))

    // Fuer jeden aktiven Claim: Kontext laden, Stagnation pruefen, ggf. reviewClaim.
    let reviewed = 0
    let vorschlaege = 0

    for (const c of kandidaten) {
      // letzteAktivitaetAm kommt aus buildClaimContext (timeline.created_at oder updated_at).
      // Um den Anthropic-Call zu sparen, bauen wir den Kontext NUR bei stagnierenden Faellen.
      // Dafuer brauchen wir letzteAktivitaetAm vorab — wir lesen die letzte Timeline-Zeile
      // direkt (1 Query, kein buildClaimContext-Overhead fuer nicht-stagnierende Claims).
      let letzteAktivitaetAm: string | null = null
      try {
        const { data: lastTimeline } = await supabase
          .from('timeline')
          .select('created_at')
          .or(`claim_id.eq.${c.id},fall_id.eq.${c.id}`)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        letzteAktivitaetAm = (lastTimeline?.created_at as string | null) ?? (c.updated_at as string | null) ?? null
      } catch {
        letzteAktivitaetAm = (c.updated_at as string | null) ?? null
      }

      const stagnant = isStagnant(
        { istAktiv: true, abgeschlossenAm: null, letzteAktivitaetAm },
        new Date(),
      )
      if (!stagnant) continue

      // Stagnierend: vollstaendigen Kontext laden.
      const ctx = await buildClaimContext(c.id as string)
      if (!ctx) continue

      // Kandidaten-Hygiene: aktiv bearbeitete Faelle (>=1 offener Task) NICHT
      // reviewen — sie haben laufende Arbeit, sind nicht stagnant. Spart den
      // Anthropic-Call (ctx.offeneTasks wurde bereits geladen).
      if (hatAktiveOffeneTasks(ctx.offeneTasks.length)) continue

      reviewed++
      try {
        vorschlaege += await reviewClaim(ctx)
      } catch (err) {
        console.error('[cron/claim-orchestrator] reviewClaim fehlgeschlagen fuer', c.id, err)
      }
    }

    // Qualitaets-Regressions-Check (Phase 2): revertiert Auto-Typen mit hoher
    // bad_rate zurueck auf manual. No-op solange keine Auto-Tasks existieren
    // (Auto ist dormant via Kill-Switch ORCHESTRATOR_AUTO_ENABLED). Wirft nie.
    const autoRevert = await checkAndRevertAutoQuality()

    // Audit-Log: exakt dasselbe Muster wie pipeline-health.
    await supabase.rpc('log_cron_job_run', {
      p_job_name: 'claim-orchestrator',
      p_status: 'success',
      p_rows: reviewed,
      p_metadata: { vorschlaege, autoReverted: autoRevert.reverted.length },
    })

    return NextResponse.json({ ok: true, reviewed, vorschlaege, autoReverted: autoRevert.reverted.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[claim-orchestrator] Cron-Lauf fehlgeschlagen:', err)

    try {
      await supabase.rpc('log_cron_job_run', {
        p_job_name: 'claim-orchestrator',
        p_status: 'error',
        p_error: msg,
      })
    } catch (logErr) {
      console.error('[claim-orchestrator] log_cron_job_run fehlgeschlagen (geschluckt):', logErr)
    }

    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
