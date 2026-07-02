import { runB2BPipeline } from '@/lib/wissen/pipeline'

export const dynamic = 'force-dynamic'

/**
 * B2B Content-Pipeline Cron-Route.
 *
 * Auth: Authorization: Bearer $CRON_SECRET (Header) oder ?secret=<CRON_SECRET> (Query).
 * Beides gemaess Plan-Spec (erweitert das Repo-Basis-Pattern um Query-Fallback fuer
 * einfachere VPS-Crontab-Konfiguration ohne Header-Support).
 *
 * VPS-Crontab-Eintrag (Aaron) — taeglich:
 *   0 4 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://app.claimondo.de/api/cron/wissen-pipeline-b2b
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  const url = new URL(req.url)

  if (!secret || (auth !== `Bearer ${secret}` && url.searchParams.get('secret') !== secret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const r = await runB2BPipeline()
  return Response.json(r, { status: r.ok ? 200 : 500 })
}
