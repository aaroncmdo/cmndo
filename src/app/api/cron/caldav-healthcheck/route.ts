import { NextResponse } from 'next/server'
import { runCaldavHealthcheck } from '@/lib/kalender/caldav/healthcheck'

// AAR-717: Healthcheck-Cron für CalDAV-Verbindungen.
//
// Schedule (vercel.json): */15 * * * *  — alle 15 Minuten
//
// Pingt jede aktive sv_kalender_verbindungen.provider='caldav'-Row, setzt
// bei Fehler last_error + erstellt einmalig Admin- + SV-Task, bei Erfolg
// resettet last_error und schließt offene Tasks.
//
// Auth: Authorization: Bearer ${CRON_SECRET} (analog allen anderen Crons).

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runCaldavHealthcheck()
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    console.error('[caldav-healthcheck] Cron-Fehler:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 },
    )
  }
}
