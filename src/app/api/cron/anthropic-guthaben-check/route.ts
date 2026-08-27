// Guthaben-Waechter: meldet, wenn die Anthropic-API fuer die Prod-App nicht nutzbar ist.
//
// ANLASS: zwei Vorfaelle (20.08. + 23.08.2026), der zweite fuenf Tage unbemerkt. Ausgefallen
// waren alle drei Copiloten, die Briefing-Generierung, die b2b-Pipeline und die KI-Fall-
// steuerung. Beide Male fiel es nur ZUFAELLIG auf — es gab keine Stelle, die hinsah.
//
// Auth: assertCronAuth (fail-closed bei fehlendem CRON_SECRET).

import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeAnthropicGuthaben } from '@/lib/watchdog/anthropic-guthaben'
import { meldeFindingsAlsTask } from '@/lib/watchdog/finding-task'

export const dynamic = 'force-dynamic'

const TASK_CODE = 'anthropic-guthaben-leer'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const befund = await pruefeAnthropicGuthaben()
  const db = createAdminClient()
  let taskAngelegt = false

  if (befund.status === 'guthaben_leer') {
    console.error('[anthropic-guthaben] GUTHABEN LEER:', befund.meldung)
    const ergebnis = await meldeFindingsAlsTask(db, {
      taskCode: TASK_CODE,
      titel: 'Anthropic-Guthaben aufgebraucht — KI-Funktionen fallen aus',
      einleitung:
        'Die Anthropic-API lehnt Anfragen ab, weil das Guthaben der Organisation aufgebraucht ist. ' +
        'Betroffen sind nutzersichtbare Funktionen: der Claim-, Werkstatt- und Gutachter-Copilot, ' +
        'die Briefing-Generierung vor Vor-Ort-Terminen, die b2b-Pipeline und die KI-Fallsteuerung ' +
        '(claim_orchestrator, ki_aufsicht). Sie schlagen fehl, ohne dass Nutzer den Grund sehen.',
      zeilen: [
        `API-Antwort: ${befund.meldung}`,
        'Behebung: Guthaben unter Plans & Billing aufladen.',
        'Danach pruefen: derselbe Probe-Call muss HTTP 200 liefern (nicht annehmen — messen).',
      ],
      prioritaet: 'kritisch',
    })
    taskAngelegt = ergebnis.angelegt
  } else if (befund.status === 'anderer_fehler') {
    // Bewusst KEIN Task: ein Netz-/Serverfehler ist kein Zahlungsvorgang. Ein Waechter, der
    // bei jedem Aussetzer eine kritische Aufgabe anlegt, wird weggeklickt statt gelesen.
    console.error(`[anthropic-guthaben] anderer Fehler (http=${befund.http}):`, befund.meldung)
  } else if (befund.status === 'kein_key') {
    console.error('[anthropic-guthaben] ANTHROPIC_API_KEY ist nicht gesetzt')
  }

  return NextResponse.json({
    ok: befund.status === 'ok',
    status: befund.status,
    task_angelegt: taskAngelegt,
  })
}
