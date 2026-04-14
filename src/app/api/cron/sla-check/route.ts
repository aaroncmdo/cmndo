// AAR-85: SLA-Check Cron — findet Breaches und legt Eskalations-Tasks an
import { NextResponse } from 'next/server'
import { checkAndEscalateBreaches } from '@/lib/sla/tracker'

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await checkAndEscalateBreaches()
  return NextResponse.json({ ok: true, ...result, checked_at: new Date().toISOString() })
}
