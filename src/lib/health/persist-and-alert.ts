// Persist + Alerter fuer das Pipeline-Health-Framework.
// Spec: docs/superpowers/specs/2026-06-29-pipeline-observability-design.md §5
//
// persistAndAlert() schreibt Ergebnisse in health_check_runs, vergleicht mit
// dem letzten Status und alarmiert (Email + In-App) bei Verschlechterung eines
// ECHTEN Fundes (warn/crit) oder anhaltendem CRIT (taeglich).
//
// Ein 'error'-Status bedeutet: der Check selbst konnte NICHT laufen (Infra/Exception,
// z.B. Supabase-API kurz challenged -> error.message = Cloudflare-HTML-Fehlerseite) —
// das ist KEIN Daten-Fund. Ein einzelner Blip bleibt STILL (nur Dashboard); erst ein
// ANHALTENDER Fehler (auch der Vorlauf war 'error') alarmiert. Health-Funde laufen NICHT
// mehr ins Dead-Letter/Recovery-Monitor (kein "Async-Op gescheitert"-Task) — das
// dedizierte Health-Alerting (Email + In-App + /admin/health) deckt sie ab; die
// Doppel-Eskalation war redundanter Jargon-Spam.
//
// Alle Sends sind best-effort (try/catch) — kein Fehler darf den Lauf oder andere
// Checks unterbrechen. Wirft nie.

import { sendEmail as defaultSendEmail } from '@/lib/email/google/client'
import { createMitteilungMulti as defaultCreateMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'
import { buildHealthAlertEmailHtml } from './alert-email'
import { STATUS_RANK } from './types'
import type { CheckCtx, CheckResult, HealthCheck } from './types'

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000

export type AlertDeps = {
  sendEmail: typeof defaultSendEmail
  createMitteilungMulti: typeof defaultCreateMitteilungMulti
}

export async function persistAndAlert(
  ctx: CheckCtx,
  results: Array<{ check: HealthCheck; result: CheckResult }>,
  deps?: Partial<AlertDeps>,
): Promise<void> {
  const sendEmail = deps?.sendEmail ?? defaultSendEmail
  const createMitteilungMulti = deps?.createMitteilungMulti ?? defaultCreateMitteilungMulti

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

      // 2. Verschlechterung eines ECHTEN Fundes (warn/crit) pruefen. Ein 'error'-Vorlauf
      // (Check lief nicht) traegt keine Fund-Info -> fuer den Vergleich wie 'ok' behandeln,
      // sonst wuerde ein error->crit-Uebergang faelschlich unterdrueckt (Rank 2 == 2).
      const isFinding = result.status === 'crit' || result.status === 'warn'
      const lastFindingStatus = (
        last?.status === 'error' ? 'ok' : (last?.status ?? 'ok')
      ) as keyof typeof STATUS_RANK
      const findingWorse =
        isFinding && STATUS_RANK[result.status] > (STATUS_RANK[lastFindingStatus] ?? 0)

      // 3. Anhaltend CRIT (hoechstens taeglich re-alertieren). Der erste Alert einer
      // CRIT-Phase kommt aus `findingWorse` (ok/warn -> crit); dieser Zweig ist NUR die
      // Tages-Erinnerung: re-alertieren, wenn der letzte echte Alert > 24h her ist.
      // Nie alarmiert (lastAlertedAt == null) -> hier NICHT alarmieren (das erledigt
      // `findingWorse` beim Statuswechsel).
      const sustainedCrit =
        result.status === 'crit' &&
        last?.status === 'crit' &&
        lastAlertedAt != null &&
        Date.now() - new Date(lastAlertedAt).getTime() > TWENTY_FOUR_HOURS_MS

      // 3b. 'error' = der Check konnte NICHT laufen (Infra/Exception), KEIN Daten-Fund.
      // Ein einzelner Blip (haeufig: Supabase-API kurz challenged -> error.message = HTML)
      // bleibt STILL (nur Dashboard). Erst wenn der Fehler ANHAELT (auch der Vorlauf war
      // 'error') alarmieren wir -> echte, dauerhafte Stoerung. Re-Alert hoechstens taeglich.
      const sustainedError =
        result.status === 'error' &&
        last?.status === 'error' &&
        (lastAlertedAt == null ||
          Date.now() - new Date(lastAlertedAt).getTime() > TWENTY_FOUR_HOURS_MS)

      const shouldAlert = findingWorse || sustainedCrit || sustainedError

      // 4. Recovery (warn/crit/anhaltender error -> ok). NUR benachrichtigen, wenn der
      // degradierte Vorlauf tatsaechlich alarmiert wurde (last.alerted_at gesetzt) — ein
      // still geschluckter transienter Blip darf keine irrefuehrende "wieder ok"-Notiz erzeugen.
      const recovered =
        result.status === 'ok' &&
        last != null &&
        last.status !== 'ok' &&
        last.alerted_at != null

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

      }

      // 7. Recovery-Pfad — kurze In-App-Notiz an Admins.
      if (recovered) {
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
