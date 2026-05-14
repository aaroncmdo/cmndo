'use server'

import { createClient } from '@/lib/supabase/server'
import { getTriageLeads } from '@/lib/dispatch/karte/triage-leads'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import type { TriageSnapshot } from '@/lib/dispatch/karte/types'

export async function refetchTriageSnapshot(): Promise<
  { ok: true; data: TriageSnapshot } | { ok: false; error: string }
> {
  try {
    await requirePortalAccess(['dispatch', 'admin'])
  } catch {
    return { ok: false, error: 'unauthorized' }
  }
  const supabase = await createClient()
  const data = await getTriageLeads(supabase)
  return { ok: true, data }
}
