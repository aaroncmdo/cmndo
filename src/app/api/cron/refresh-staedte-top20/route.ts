import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { STAEDTE } from '@/app/kfz-gutachter/staedte'
import { getStadtLastUpdatedISO } from '@/app/kfz-gutachter/freshness'
import { submitToIndexNow } from '@/lib/seo/indexnow'

// geo-freshness Phase 1 (L3): revalidiert die 20 zuletzt aktualisierten Stadt-Pages
// (ISR-Pre-Warm) + pingt sie an IndexNow. Top-20 statt aller ~85 = IndexNow-Throttle-
// Schutz; die Hub-Cities mit hyperlocaler Tiefe stehen durch ihr juengeres lastUpdated
// vorne. Schedule: VPS-Crontab, taeglich 05:00.
// Aufruf: curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://claimondo.de/api/cron/refresh-staedte-top20
export const dynamic = 'force-dynamic'

const TOP_N = 20

export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const top = [...STAEDTE]
    .sort((a, b) => getStadtLastUpdatedISO(b.slug).localeCompare(getStadtLastUpdatedISO(a.slug)))
    .slice(0, TOP_N)

  const paths = top.map((s) => `/kfz-gutachter/${s.slug}`)
  for (const path of paths) revalidatePath(path)
  const indexNow = await submitToIndexNow(paths)

  return NextResponse.json({
    ok: true,
    refreshed: paths.length,
    indexNow,
    timestamp: new Date().toISOString(),
  })
}
