import { NextResponse, type NextRequest } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// C (AAR-audit-trusted-devices): Purge abgelaufener + alt-widerrufener Trusted-
// Device-Tokens. Der Validator lehnt abgelaufene ohnehin ab (Sicherheit bleibt),
// aber auth_remember_tokens waechst sonst unbegrenzt (Audit fand abgelaufene,
// nie aufgeraeumte Zeilen). Widerrufene bleiben 30 Tage als Audit-Spur, dann weg.
//
// Auth: Authorization: Bearer ${CRON_SECRET}. VPS-Crontab: 1x taeglich.
export async function GET(request: NextRequest) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const now = new Date().toISOString()
  const revokedCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { error, count } = await db
    .from('auth_remember_tokens')
    .delete({ count: 'exact' })
    .or(`expires_at.lt.${now},revoked_am.lt.${revokedCutoff}`)

  if (error) {
    console.error('[cron:purge-remember-tokens]', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, geloescht: count ?? 0 })
}
