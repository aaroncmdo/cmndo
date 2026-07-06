import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isStagnant, STAGNATION } from '@/lib/orchestrator/stagnation'
import { buildClaimContext } from '@/lib/orchestrator/context'
import { reviewClaim } from '@/lib/orchestrator/run'

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
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
      .select('id, updated_at')
      .eq('ist_aktiv', true)
      .is('abgeschlossen_am', null)
      .limit(500)

    if (claimsError) {
      throw new Error(`claims-Fetch fehlgeschlagen: ${claimsError.message}`)
    }

    // Fuer jeden aktiven Claim: Kontext laden, Stagnation pruefen, ggf. reviewClaim.
    let reviewed = 0
    let vorschlaege = 0

    for (const c of activeClaims ?? []) {
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

      // Stagnierend: vollstaendigen Kontext laden + Claude aufrufen.
      const ctx = await buildClaimContext(c.id as string)
      if (!ctx) continue

      reviewed++
      try {
        vorschlaege += await reviewClaim(ctx)
      } catch (err) {
        console.error('[cron/claim-orchestrator] reviewClaim fehlgeschlagen fuer', c.id, err)
      }
    }

    // Audit-Log: exakt dasselbe Muster wie pipeline-health.
    await supabase.rpc('log_cron_job_run', {
      p_job_name: 'claim-orchestrator',
      p_status: 'success',
      p_rows: reviewed,
      p_metadata: { vorschlaege },
    })

    return NextResponse.json({ ok: true, reviewed, vorschlaege })
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
