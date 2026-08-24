// Money-Integrity-Check-Cron — faehrt das operationalisierte Money-Model-Audit (Session 6f60c510)
// periodisch: USt-Tripel-Konsistenz + §14-Beleg-Reconciliation + Ledger-Cache-Drift. Findings landen
// laut in den VPS-Logs (Prefix `[money-integrity]`, JSON) und in der Response.
//
// Aktivierung: braucht einen VPS-crontab-Eintrag (wie die uebrigen Crons), z.B. taeglich 03:00 UTC:
//   0 3 * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/money-integrity-check
// Bis der Eintrag gesetzt ist, ist der Endpoint on-demand via Bearer-Auth aufrufbar (+ die Admin-Action
// `pruefeMoneyIntegritaet` im Finance-Hub fuehrt dieselben Checks ohne Cron aus).
//
// Follow-up (optional): aktives Push-Alerting (Slack/Email/Admin-Mitteilung) statt nur Log — sobald
// echter Money-Traffic laeuft. Detektion + Report sind hier vollstaendig; nur der Push-Kanal fehlt.
//
// Auth: Bearer-Token via CRON_SECRET.

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runMoneyIntegrityChecks } from '@/lib/finance/money-integrity-checks'
import { meldeFindingsAlsTask } from '@/lib/watchdog/finding-task'

export const dynamic = 'force-dynamic'

const TASK_CODE = 'money-integrity-finding'

export async function GET(request: Request) {
  // Vorher stand hier der Direktvergleich `!== \`Bearer ${process.env.CRON_SECRET}\``.
  // Fehlt die Variable, ergibt das "Bearer undefined" — genau dieser Header kaeme dann
  // durch. `assertCronAuth` ist fail-closed (ohne Secret niemals wahr).
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const report = await runMoneyIntegrityChecks(db)

  let taskAngelegt = false
  if (!report.ok) {
    // Money-Integritaets-Verletzung — laut loggen, damit VPS-Log-Monitoring anschlaegt.
    console.error(`[money-integrity] ${report.findings.length} FINDING(S):`, JSON.stringify(report.findings))

    // ⭐ Das Log allein reicht NICHT: Die Route antwortet auch mit Findings HTTP 200.
    // Ohne Task meldet `cron-call.sh` „ok" und eine Geld-Abweichung bleibt unbemerkt.
    const ergebnis = await meldeFindingsAlsTask(db, {
      taskCode: TASK_CODE,
      titel: `${report.findings.length} Money-Integritaets-Verletzung(en)`,
      einleitung:
        'Die Geld-Daten widersprechen sich: USt-Tripel, §14-Belege oder der Ledger-Cache ' +
        'stimmen nicht ueberein. Solche Abweichungen wachsen still weiter und sind spaeter ' +
        'nur mit hohem Aufwand rekonstruierbar.',
      zeilen: report.findings.map((f) => `${f.check} (${f.severity}, ${f.count}× in ${f.tabelle}): ${f.detail}`),
      prioritaet: 'dringend',
    })
    taskAngelegt = ergebnis.angelegt
  }

  return NextResponse.json({
    ok: report.ok,
    geprueft: report.geprueft,
    findings_count: report.findings.length,
    findings: report.findings,
    task_angelegt: taskAngelegt,
  })
}
