'use server'

// Public Buchungs-Action fuer /beratung/[leadId] — verified die Signatur ERNEUT
// (der Client koennte die Action direkt aufrufen), Rate-Limit fail-closed,
// Kernlogik in lib/partner/beratungs-booking (Raster-Validierung + Dedupe +
// Host-First-Fit + fail-closed Recheck + M1-Fehlertexte).

import { createAdminClient } from '@/lib/supabase/admin'
import { checkIpRateLimit } from '@/lib/rate-limit/ip-rate-limit'
import { verifyBeratungsSig } from '@/lib/start-link/beratung-sig'
import { bucheBeratungPublic } from '@/lib/partner/beratungs-booking'

export async function bucheBeratungOnline(input: {
  leadId: string
  exp: string
  sig: string
  startIso: string
}): Promise<{ ok: true; videoLink: string | null; startIso: string } | { ok: false; error: string }> {
  const v = verifyBeratungsSig(input.leadId, input.exp ?? null, input.sig ?? null)
  if (!v.ok) {
    return { ok: false, error: 'Der Buchungslink ist ungültig oder abgelaufen.' }
  }

  const rl = await checkIpRateLimit('beratung-booking', { failClosed: true })
  if (!rl.allowed) return { ok: false, error: 'Zu viele Anfragen, bitte kurz warten.' }

  return bucheBeratungPublic(createAdminClient(), {
    leadId: input.leadId,
    startIso: input.startIso,
  })
}
