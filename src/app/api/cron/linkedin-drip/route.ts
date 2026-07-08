import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { fetchFeedItems } from '@/lib/linkedin/feed-source'
import { selectNextUnposted } from '@/lib/linkedin/select-next'
import { composePost } from '@/lib/linkedin/compose'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const orgId = process.env.LINKEDIN_ORG_ID
  if (!orgId) return NextResponse.json({ error: 'LINKEDIN_ORG_ID fehlt' }, { status: 500 })
  const authorUrn = orgId.startsWith('urn:') ? orgId : `urn:li:organization:${orgId}`

  let items
  try {
    items = await fetchFeedItems()
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 })
  }

  const admin = createAdminClient()
  const { data: seenRows, error: seenErr } = await admin.from('linkedin_posts').select('feed_guid')
  if (seenErr) return NextResponse.json({ ok: false, error: seenErr.message }, { status: 500 })
  const seen = new Set((seenRows ?? []).map((r: { feed_guid: string }) => r.feed_guid))

  const next = selectNextUnposted(items, seen)
  if (!next) return NextResponse.json({ ok: true, drafted: null })

  const composed_text = await composePost(next)
  const { error } = await admin.from('linkedin_posts').insert({
    feed_guid: next.guid, feed_url: next.url, title: next.title, excerpt: next.excerpt,
    composed_text, status: 'entwurf', author_urn: authorUrn, scheduled_for: new Date().toISOString(),
  })
  // UNIQUE(feed_guid) guards against a race double-insert.
  if (error && error.code !== '23505' && !error.message.includes('duplicate')) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, drafted: next.guid })
}
