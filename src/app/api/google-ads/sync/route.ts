import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// POST /api/google-ads/sync — Google Ads CPL-Daten Import.
// Env: GOOGLE_ADS_DEVELOPER_TOKEN + GOOGLE_ADS_CUSTOMER_ID + GOOGLE_ADS_REFRESH_TOKEN.
// Ohne Keys: graceful skip.

export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN
  const clientId = process.env.GOOGLE_CLIENT_ID ?? process.env.GOOGLE_CALENDAR_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET ?? process.env.GOOGLE_CALENDAR_CLIENT_SECRET

  if (!devToken || !customerId || !refreshToken || !clientId || !clientSecret) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'Google Ads API Credentials nicht gesetzt' })
  }

  try {
    // Access Token holen via Refresh
    const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    })
    const tokenData = await tokenResp.json()
    if (!tokenData.access_token) return NextResponse.json({ ok: false, error: 'Token refresh failed' })

    // Google Ads API: Campaign-Performance des aktuellen Monats
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const today = now.toISOString().slice(0, 10)

    const query = `SELECT campaign.name, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '${monthStart}' AND '${today}'`

    const adsResp = await fetch(`https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        'developer-token': devToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    })

    if (!adsResp.ok) return NextResponse.json({ ok: false, error: `Google Ads API ${adsResp.status}` })

    const adsData = await adsResp.json()
    let totalCostEur = 0
    let totalConversions = 0

    for (const batch of adsData) {
      for (const row of batch.results ?? []) {
        totalCostEur += (row.metrics?.costMicros ?? 0) / 1_000_000
        totalConversions += row.metrics?.conversions ?? 0
      }
    }

    const cpl = totalConversions > 0 ? Math.round((totalCostEur / totalConversions) * 100) / 100 : 0

    // In DB speichern
    const db = createAdminClient()
    try {
      await db.from('finance_monatsberichte').upsert({
        monat: now.getMonth() + 1,
        jahr: now.getFullYear(),
        google_ads_kosten_eur: Math.round(totalCostEur * 100) / 100,
        google_ads_leads: totalConversions,
        google_ads_cpl_eur: cpl,
        google_ads_sync_am: new Date().toISOString(),
      }, { onConflict: 'monat,jahr' })
    } catch { /* fire-and-forget */ }

    return NextResponse.json({ ok: true, totalCostEur: Math.round(totalCostEur * 100) / 100, totalConversions, cpl })
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) })
  }
}
