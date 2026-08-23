// Termine-Integrity-Check-Cron — faehrt den SV-Buchungs-Doppelbuchungs-Audit (Session 6c630247,
// ATTESTATION-sv-buchung-doppelbuchung-audit) periodisch: Buchung<->Buchung (Exclusion-Constraint-
// Integritaet) + Buchung<->CalDAV + Buchung<->Urlaub. Findings landen laut in den VPS-Logs (Prefix
// `[termine-integrity]`, JSON) und in der Response.
//
// Aktivierung: braucht einen VPS-crontab-Eintrag (wie die uebrigen Crons), z.B. stuendlich:
//   0 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/termine-integrity-check
// Bis der Eintrag gesetzt ist, ist der Endpoint on-demand via Bearer-Auth aufrufbar (+ die Admin-Action
// `pruefeTermineIntegritaet` im Admin-Dashboard fuehrt dieselben Checks ohne Cron aus).
//
// Follow-up (optional): aktives Push-Alerting (Slack/Email/Admin-Mitteilung) statt nur Log — die
// Detektion + der Report sind hier vollstaendig; nur der Push-Kanal fehlt.
//
// Auth: assertCronAuth (fail-closed bei UNSET CRON_SECRET — anders als die alte Inline-Variante).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { runTermineIntegrityChecks } from '@/lib/termine/termine-integrity-checks'
import { meldeFindingsAlsTask } from '@/lib/watchdog/finding-task'

export const dynamic = 'force-dynamic'

const TASK_CODE = 'termine-integrity-finding'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const report = await runTermineIntegrityChecks(db)

  let taskAngelegt = false
  if (!report.ok) {
    // Doppelbuchungs-Verletzung — laut loggen, damit VPS-Log-Monitoring anschlaegt.
    console.error(`[termine-integrity] ${report.findings.length} FINDING(S):`, JSON.stringify(report.findings))

    // ⭐ Das Log allein reicht NICHT: Die Route antwortet auch mit Findings HTTP 200.
    // Eine Doppelbuchung, die niemand sieht, wird zum Termin, zu dem zwei Leute kommen.
    const ergebnis = await meldeFindingsAlsTask(db, {
      taskCode: TASK_CODE,
      titel: `${report.findings.length} Termin-Integritaets-Verletzung(en)`,
      einleitung:
        'SV-Buchungen ueberschneiden sich oder widersprechen Kalender bzw. Urlaub. ' +
        'Unentdeckt fuehrt das zu Doppelterminen beim Kunden — der teuerste Zeitpunkt, ' +
        'es zu bemerken, ist vor Ort.',
      zeilen: report.findings.map((f) => `${f.check} (${f.severity}, ${f.count}× in ${f.tabelle}): ${f.detail}`),
      prioritaet: report.findings.some((f) => f.severity === 'critical') ? 'kritisch' : 'dringend',
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
