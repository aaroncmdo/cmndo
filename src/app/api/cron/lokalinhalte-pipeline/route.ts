import { runLokalinhaltePipeline } from '@/lib/lokalinhalt/pipeline'

export const dynamic = 'force-dynamic'
// Jede Stadt kostet einen KI-Aufruf; drei davon dauern gut eine Minute.
// Ohne maxDuration bricht der Serverless-Default-Timeout den Lauf ab —
// dieselbe Konvention wie wissen-pipeline-b2b und sync-external-calendars.
export const maxDuration = 300

/**
 * Hyperlokale Ortsinhalte — Batch-Erzeugung.
 *
 * Nimmt die naechsten Staedte OHNE Inhalt (groesste zuerst), generiert je einen
 * Entwurf, schickt ihn durchs Substanz-Gate und veroeffentlicht ihn direkt,
 * wenn es haelt. Was durchfaellt, landet in 'in_review'.
 *
 * WARUM ES DIESE ROUTE BRAUCHT: Seit dem 18.08. kann ein Inhalt ohne Freigabe
 * live gehen — ausgeloest wurde er aber weiterhin von einem Klick je Stadt im
 * Admin. Bei 173 Staedten blieb die Tabelle deshalb bei 0 Zeilen. Erst dieser
 * Cron macht daraus den "automatischen Content", der gemeint war.
 *
 * Auth: Authorization: Bearer $CRON_SECRET oder ?secret=<CRON_SECRET>
 * (Query-Fallback wie bei wissen-pipeline-b2b, fuer VPS-Crontabs ohne Header).
 *
 * ⚠ VPS-CRONTAB-EINTRAG FEHLT NOCH — ohne ihn laeuft die Route nie von selbst.
 * Genau diese Luecke hat schon einmal einen fertigen Cron monatelang schlafen
 * lassen. Taeglich, versetzt zur B2B-Pipeline (die laeuft 4 Uhr):
 *   30 4 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/lokalinhalte-pipeline
 *
 * `?limit=N` uebersteuert die Standardmenge (3) — fuer einen kontrollierten
 * Erstlauf oder zum Nachziehen. Nach oben gedeckelt, damit ein Tippfehler
 * nicht 173 KI-Aufrufe ausloest.
 */
const MAX_LIMIT = 10

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const url = new URL(req.url)

  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('secret') !== secret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const roh = Number.parseInt(url.searchParams.get('limit') ?? '', 10)
  const limit = Number.isFinite(roh) ? Math.min(Math.max(roh, 1), MAX_LIMIT) : undefined

  const r = await runLokalinhaltePipeline(limit)
  return Response.json(r, { status: r.ok ? 200 : 500 })
}
