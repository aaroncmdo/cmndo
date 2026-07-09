// AAR-85: SLA-Check Cron — findet Breaches und legt Eskalations-Tasks an
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { checkAndEscalateBreaches } from '@/lib/sla/tracker'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await checkAndEscalateBreaches()
  return NextResponse.json({ ok: true, ...result, checked_at: new Date().toISOString() })
}
