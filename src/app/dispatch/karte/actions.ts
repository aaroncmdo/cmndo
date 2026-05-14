'use server'

import { createClient } from '@/lib/supabase/server'
import { getKarteSnapshot } from '@/lib/dispatch/karte/get-karte-snapshot'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import type { KarteSnapshot } from '@/lib/dispatch/karte/types'

export async function refetchKarteSnapshot(): Promise<
  { ok: true; data: KarteSnapshot } | { ok: false; error: string }
> {
  try {
    await requirePortalAccess(['dispatch', 'admin'])
  } catch {
    return { ok: false, error: 'unauthorized' }
  }
  const supabase = await createClient()
  const data = await getKarteSnapshot(supabase)
  return { ok: true, data }
}
