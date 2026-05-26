import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { submitToIndexNow } from '@/lib/seo/indexnow'

// geo-freshness Phase 1 (L3): haelt die GEO-Feeds warm + pingt sie an IndexNow.
// Schedule: VPS-Crontab (NICHT vercel.json — die App laeuft auf VPS/PM2), taeglich 06:00.
// Aufruf: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://claimondo.de/api/cron/refresh-feeds
//
// Hinweis: Die /feed*-Routen kommen mit PR #1762 (Branch kitta/geo-feeds-freshness-
// claimondo). Bis dahin sind revalidatePath + IndexNow-Ping harmlose No-ops auf
// (noch) 404-URLs — die Route bleibt vorwaerts-kompatibel.
export const dynamic = 'force-dynamic'

const FEED_PATHS = ['/feed.xml', '/feed.json', '/feed/katalog.xml', '/feed/katalog.json']

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  for (const path of FEED_PATHS) revalidatePath(path)
  const indexNow = await submitToIndexNow(FEED_PATHS)

  return NextResponse.json({
    ok: true,
    revalidated: FEED_PATHS.length,
    indexNow,
    timestamp: new Date().toISOString(),
  })
}
