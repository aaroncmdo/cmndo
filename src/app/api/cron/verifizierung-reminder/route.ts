import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'

export const dynamic = 'force-dynamic'

/**
 * Verifizierungs-Reminder — seit 19.09.2026 bewusst ein No-op.
 *
 * Bis dahin (AAR-359 W4, Option B vom 08.08.): taeglich 11:20 per VPS-Crontab
 * (docs/vps-crontab.md), Tag-7-Halbzeitmail, nach Fristablauf `verifizierung_status =
 * 'frist_ueberschritten'` + Admin-Task + Mail „Verifizierung ueberfaellig". Der Status
 * schloss den Gutachter aus der Engine aus (applyDispatchableFilter / svDarfFaelleEmpfangen).
 *
 * Aaron 19.09.2026: „ich moechte nicht mehr verifizieren und ich moechte auch nicht mehr
 * nachhalten muessen, ob die Dokumente fehlen oder nicht … wenn Dokumente fehlen, soll der
 * Sachverstaendige trotzdem angezeigt werden und sogar auch buchbar sein."
 * Gemessen am selben Tag: 19 laufende/abgelaufene Fristen, 3 Gutachter dadurch gesperrt,
 * 5 verwaiste Admin-Aufgaben. Die Frist wird nirgends mehr gesetzt (Migration hat den
 * Bestand geleert), der Dispatch-Filter kennt den Status nicht mehr.
 *
 * Warum die Route bleibt statt zu verschwinden: die Crontab-Zeile auf dem VPS ist nicht
 * Teil des Repos. Bis sie entfernt ist, soll der Aufruf 200 liefern und NICHTS tun —
 * ein 404 saehe im Cron-Log wie ein Ausfall aus. Die Zeile kann danach gestrichen werden
 * (Hinweis in docs/vps-crontab.md).
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  console.log('[verifizierung-reminder] deaktiviert seit 2026-09-19 (Aaron: keine Dokumenten-Frist mehr) — nichts getan')
  return NextResponse.json({
    ok: true,
    deaktiviert: true,
    grund: 'Verifizierungs-Frist abgeschafft (Aaron 2026-09-19) — Crontab-Zeile kann entfernt werden',
    checked: 0,
    reminders7d: 0,
    fristUeberschritten: 0,
  })
}
