// Persist + Alerter fuer das Pipeline-Health-Framework.
// Spec: docs/superpowers/specs/2026-06-29-pipeline-observability-design.md §5
//
// persistAndAlert() schreibt Ergebnisse in health_check_runs, vergleicht mit
// dem letzten Status und alarmiert (Email + In-App + Dead-Letter) bei Verschlechterung
// oder anhaltendem CRIT (taeglich). Alle Sends sind best-effort (try/catch) —
// kein Fehler darf den Lauf oder andere Checks unterbrechen. Wirft nie.

import { sendEmail as defaultSendEmail } from '@/lib/email/google/client'
import { createMitteilungMulti as defaultCreateMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'
import {
  recordFailedOperation as defaultRecordFailedOperation,
  markOperationResolved as defaultMarkOperationResolved,
} from '@/lib/reliability/dead-letter'
import { buildHealthAlertEmailHtml } from './alert-email'
import { STATUS_RANK } from './types'
import type { CheckCtx, CheckResult, HealthCheck } from './types'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export type AlertDeps = {
  sendEmail: typeof defaultSendEmail
  createMitteilungMulti: typeof defaultCreateMitteilungMulti
  recordFailedOperation: typeof defaultRecordFailedOperation
  markOperationResolved: typeof defaultMarkOperationResolved
}

export async function persistAndAlert(
  ctx: CheckCtx,
  results: Array<{ check: HealthCheck; result: CheckResult }>,
  deps?: Partial<AlertDeps>,
): Promise<void> {
  const sendEmail = deps?.sendEmail ?? defaultSendEmail
  const createMitteilungMulti = deps?.createMitteilungMulti ?? defaultCreateMitteilungMulti
  const recordFailedOperation = deps?.recordFailedOperation ?? defaultRecordFailedOperation
  const markOperationResolved = deps?.markOperationResolved ?? defaultMarkOperationResolved

  for (const { check, result } of results) {
    try {
      // 1. Letzten Lauf lesen (kein roh-SQL — nur Spaltennamen + Filter-Methoden).
      const { data: lastRows } = await ctx.supabase
        .from('health_check_runs')
        .select('status, alerted_at')
        .eq('check_id', check.id)
        .order('run_at', { ascending: false })
        .limit(1)

      const last = lastRows?.[0] ?? null

      // 1b. Letzten TATSAECHLICHEN Alert-Zeitpunkt lesen (juengste Zeile mit
      // alerted_at gesetzt). NICHT last.alerted_at nehmen: der vorige Lauf kann
      // korrekt still gewesen sein (alerted_at=null), obwohl ein frueherer Lauf
      // < 24h alarmierte. Sonst kippt sustainedCrit im 2-Stunden-Takt (jeder 2.
      // Lauf) statt taeglich zu re-alertieren -> Alert-Spam (Prod-Fund 03.07.).
      const { data: lastAlertRows } = await ctx.supabase
        .from('health_check_runs')
        .select('alerted_at')
        .eq('check_id', check.id)
        .not('alerted_at', 'is', null)
        .order('alerted_at', { ascending: false })
        .limit(1)
      const lastAlertedAt = (lastAlertRows?.[0]?.alerted_at as string | null | undefined) ?? null

      // 2. Verschlechterung pruefen.
      const lastStatusRank = STATUS_RANK[(last?.status as keyof typeof STATUS_RANK) ?? 'ok'] ?? 0
      const currentRank = STATUS_RANK[result.status]
      const worse = currentRank > lastStatusRank

      // 3. Anhaltend CRIT (hoechstens taeglich re-alertieren). Der erste Alert einer
      // CRIT-Phase kommt aus `worse` (ok/warn -> crit); dieser Zweig ist NUR die
      // Tages-Erinnerung: re-alertieren, wenn der letzte echte Alert > 24h her ist.
      // Nie alarmiert (lastAlertedAt == null) -> hier NICHT alarmieren (das erledigt
      // `worse` beim Statuswechsel).
      const sustainedCrit =
        result.status === 'crit' &&
        last?.status === 'crit' &&
        lastAlertedAt != null &&
        Date.now() - new Date(lastAlertedAt).getTime() > TWENTY_FOUR_HOURS_MS

      const shouldAlert = worse || sustainedCrit

      // 4. Recovery (crit/warn → ok).
      const recovered = result.status === 'ok' && last != null && last.status !== 'ok'

      // 5. Neue Zeile einfuegen.
      const alerted_at = shouldAlert ? new Date().toISOString() : null
      try {
        await ctx.supabase.from('health_check_runs').insert({
          check_id: check.id,
          category: check.category,
          status: result.status,
          metric: result.metric ?? null,
          detail: result.detail,
          sample_ids: result.sampleIds ?? [],
          alerted_at,
        })
      } catch (insertErr) {
        console.error('[health] insert health_check_runs fehlgeschlagen (geschluckt):', insertErr)
      }

      // 6. Alert senden.
      if (shouldAlert) {
        // Admin-Empfaenger laden.
        let adminEmails: string[] = []
        let adminEmpfaenger: Array<{ id: string; rolle: 'admin' }> = []

        try {
          const { data: admins } = await ctx.supabase
            .from('profiles')
            .select('id, email')
            .eq('rolle', 'admin')

          if (admins && admins.length > 0) {
            adminEmails = admins.map((a: { email: string }) => a.email).filter(Boolean)
            adminEmpfaenger = admins.map((a: { id: string }) => ({ id: a.id, rolle: 'admin' as const }))
          }
        } catch (profileErr) {
          console.error('[health] Admin-Profile-Abfrage fehlgeschlagen (geschluckt):', profileErr)
        }

        const statusLabel = result.status === 'crit' ? 'KRITISCH' : result.status === 'error' ? 'FEHLER' : 'WARNUNG'
        const subject = `[Claimondo Health] ${statusLabel}: ${check.title}`

        // 6a. Email.
        if (adminEmails.length > 0) {
          try {
            await sendEmail({
              to: adminEmails,
              subject,
              html: buildHealthAlertEmailHtml([
                { title: check.title, status: result.status, detail: result.detail },
              ]),
              empfaengerTyp: 'admin',
              template: 'health-alert',
            })
          } catch (emailErr) {
            console.error('[health] Alert-Email fehlgeschlagen (geschluckt):', emailErr)
          }
        }

        // 6b. In-App Mitteilung.
        if (adminEmpfaenger.length > 0) {
          try {
            // MitteilungPrioritaet: 'normal' | 'hoch' | 'dringend' ('kritisch' existiert nicht).
            // Staffelung (Spec §5.2): warn → 'hoch', crit/error → 'dringend'.
            const prioritaet = result.status === 'warn' ? 'hoch' : 'dringend'
            await createMitteilungMulti(adminEmpfaenger, {
              kategorie: 'update',
              prioritaet,
              titel: subject,
              inhalt: result.detail,
              route_url: '/admin/health',
            })
          } catch (mitteilungErr) {
            console.error('[health] Alert-Mitteilung fehlgeschlagen (geschluckt):', mitteilungErr)
          }
        }

        // 6c. Dead-Letter bei crit/error.
        if (result.status === 'crit' || result.status === 'error') {
          try {
            await recordFailedOperation({
              operationType: 'pipeline_health',
              dedupKey: `health-${check.id}`,
              entityType: 'health_check',
              entityId: check.id,
              error: result.detail,
            })
          } catch (dlErr) {
            console.error('[health] recordFailedOperation fehlgeschlagen (geschluckt):', dlErr)
          }
        }
      }

      // 7. Recovery-Pfad.
      if (recovered) {
        try {
          await markOperationResolved(`health-${check.id}`)
        } catch (resolveErr) {
          console.error('[health] markOperationResolved fehlgeschlagen (geschluckt):', resolveErr)
        }

        // Kurze In-App-Notiz an Admins.
        try {
          const { data: admins } = await ctx.supabase
            .from('profiles')
            .select('id')
            .eq('rolle', 'admin')

          if (admins && admins.length > 0) {
            const adminEmpfaengerRecovered = admins.map((a: { id: string }) => ({
              id: a.id,
              rolle: 'admin' as const,
            }))
            await createMitteilungMulti(adminEmpfaengerRecovered, {
              kategorie: 'update',
              prioritaet: 'normal',
              titel: `${check.title} wieder ok`,
              inhalt: `Check "${check.title}" hat sich von "${last?.status ?? 'unbekannt'}" auf "ok" erholt.`,
              route_url: '/admin/health',
            })
          }
        } catch (recoveryNotifErr) {
          console.error('[health] Recovery-Mitteilung fehlgeschlagen (geschluckt):', recoveryNotifErr)
        }
      }
    } catch (outerErr) {
      // Aeusserer Catch: auch ein unerwarteter Fehler bei einem Check darf die
      // anderen nicht unterbrechen und darf persistAndAlert nicht werfen lassen.
      console.error(`[health] persistAndAlert fuer check "${check.id}" fehlgeschlagen (geschluckt):`, outerErr)
    }
  }
}
