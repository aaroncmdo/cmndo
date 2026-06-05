'use server'

// AAR-939 Embed-B — Admin-Action: Funnel-Modus pro SV-Embed setzen.
// Admin-controlled (Aaron-Entscheidung): Self-Service (flowlink) hat Flow-/Billing-
// Impact, daher NICHT SV-self-serve. requireRole(['admin']) + service_role-Update
// (embed_sites hat keine authenticated-UPDATE-Policy → default-deny).

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'

export async function setEmbedFunnelModus(
  siteId: string,
  modus: 'callback' | 'flowlink',
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: 'Nur Admin.' }
  if (modus !== 'callback' && modus !== 'flowlink') return { ok: false, error: 'Ungueltiger Modus.' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const { data, error } = await db
    .from('embed_sites')
    .update({ funnel_modus: modus })
    .eq('id', siteId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Embed-Site nicht gefunden.' }

  revalidatePath('/admin/embed-sites')
  return { ok: true }
}
