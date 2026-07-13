'use server'

import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import type { PoolCode } from '@/app/admin/werkstaetten/qr-pool/QrPoolClient'

export async function getQrPoolDaten(): Promise<
  | { ok: true; codes: PoolCode[]; werkstaetten: { id: string; name: string }[] }
  | { ok: false; error: string }
> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  const admin = createAdminClient()
  const [{ data: codes }, { data: werkstaetten }] = await Promise.all([
    admin
      .from('werkstatt_qr_pool')
      .select('id, token, status, charge, created_at')
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('werkstaetten')
      .select('id, name')
      .eq('status', 'aktiv')
      .order('name', { ascending: true }),
  ])

  return {
    ok: true,
    codes: (codes ?? []) as PoolCode[],
    werkstaetten: (werkstaetten ?? []) as { id: string; name: string }[],
  }
}
