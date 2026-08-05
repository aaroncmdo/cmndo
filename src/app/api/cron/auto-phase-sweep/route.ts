import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkFallAutoPhase } from '@/lib/autoPhase'

export const dynamic = 'force-dynamic'

/**
 * Auto-Phase-Sweep-Cron — der periodische Aufhol-Backstop fuer den operativen Status.
 *
 * Problem (Diagnose 05.08.): operative_status advanced sonst NUR event-getrieben
 * (Gutachten-Upload, QC, Onboarding-Resume). Fehlt das Event, friert der Claim ein.
 * Prod-Befund: 21 Claims auf 'ersterfassung', davon 6 MIT sv_id aber ohne je einen
 * transitionFallStatus (Engine-Bypass in flow/[token]/actions.ts findBestSV) -> der
 * Stepper zeigt dauerhaft "Erfassung", obwohl ein SV zugewiesen ist.
 *
 * Dieser Cron ruft checkFallAutoPhase ueber ALLE offenen Claims -> holt jeden Claim so
 * weit, wie seine stabilen Signale (sv_id/termin/gutachten/zahlung) erlauben. Rein
 * DETERMINISTISCH (kein KI-Call, anders als claim-orchestrator) und idempotent:
 * ein Claim ohne moeglichen Advance bleibt unberuehrt. checkFallAutoPhase funnelt
 * jeden Uebergang durch transitionFallStatus -> Timeline + phase_transitions +
 * fall.status_changed-Event bleiben konsistent.
 *
 * ⚠ ROLLOUT (Aaron): der ERSTE Lauf holt die 6 Bestands-Altfaelle auf ->
 * transitionFallStatus emittiert je ein fall.status_changed-Event (Kunde-Notification
 * "Gutachter zugewiesen" + SV-Termin-Task). Das ist die ueberfaellig-korrekte Aktion,
 * aber ein Schwall fuer wochenalte Faelle. Rollout-Optionen im PR/Marker dokumentiert.
 *
 * VPS-Crontab-Eintrag (Aaron) — z.B. alle 15 Minuten:
 *   *\/15 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/auto-phase-sweep
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  try {
    // Optional ?claimId=<uuid>: laeuft nur diesen einen Claim (Prod-Smoke + kontrolliertes
    // Aufholen der Bestands-Altfaelle EINZELN, ohne den vollen Notification-Schwall). Ohne
    // Param = voller Sweep ueber alle offenen Claims (der crontab-Lauf).
    const nurClaimId = new URL(request.url).searchParams.get('claimId')

    // Offene Claims (Basis-Tabelle, service_role — kein auth-Gate). ist_aktiv + kein
    // abgeschlossen_am = die nicht-terminalen; checkFallAutoPhase ist fuer den Rest idempotent.
    let query = supabase
      .from('claims')
      .select('id, operative_status')
      .eq('ist_aktiv', true)
      .is('abgeschlossen_am', null)
    if (nurClaimId) query = query.eq('id', nurClaimId)
    const { data: offeneClaims, error } = await query.limit(500)

    if (error) throw new Error(`claims-Fetch fehlgeschlagen: ${error.message}`)

    let geprueft = 0
    let advanced = 0
    for (const c of (offeneClaims ?? []) as Array<{ id: string; operative_status: string | null }>) {
      geprueft++
      const vorher = c.operative_status
      try {
        // claims.id == fall_id (AAR-939); checkFallAutoPhase loest via Bridge zu claim_id auf.
        await checkFallAutoPhase(c.id)
      } catch (err) {
        console.error('[cron/auto-phase-sweep] checkFallAutoPhase', c.id, err instanceof Error ? err.message : err)
        continue
      }
      // Advance-Zaehler: nur bei tatsaechlicher Aenderung (1 Re-Read; die Sweep-Groesse ist klein).
      const { data: nachher } = await supabase
        .from('claims').select('operative_status').eq('id', c.id).maybeSingle()
      if (nachher && (nachher.operative_status as string | null) !== vorher) advanced++
    }

    await supabase.rpc('log_cron_job_run', {
      p_job_name: 'auto-phase-sweep',
      p_status: 'success',
      p_rows: geprueft,
      p_metadata: { advanced },
    })

    return NextResponse.json({ ok: true, geprueft, advanced })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[auto-phase-sweep] Cron-Lauf fehlgeschlagen:', err)
    try {
      await supabase.rpc('log_cron_job_run', {
        p_job_name: 'auto-phase-sweep',
        p_status: 'error',
        p_error: msg,
      })
    } catch (logErr) {
      console.error('[auto-phase-sweep] log_cron_job_run fehlgeschlagen (geschluckt):', logErr)
    }
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
