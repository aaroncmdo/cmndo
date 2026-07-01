'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'

export type EmailSvCheckResult =
  | { isSv: false }
  | { isSv: true; sv_id: string | null }

/**
 * Prüft ob eine Email bereits mit einem Sachverständigen-Account verknüpft ist.
 * Dispatch-MA soll wissen wenn er einem SV einen FlowLink schickt — der würde
 * einfach einen Zweit-Account anlegen statt sich einzuloggen.
 *
 * P4-D: 1:1 wiederhergestellt nach dem P3b-Cutover (e405398b2), der die Action
 * mitgelöscht hatte (war an die _phases gekoppelt).
 */
export async function checkEmailIsSv(email: string): Promise<EmailSvCheckResult> {
  // AAR-auth-haertung (Write-Path-IDOR): vorher KEIN Auth-Guard -> unauth
  // Email-Enumeration-Oracle (ist <email> ein SV?). Jetzt Dispatch/KB/Admin only,
  // fail-closed auf {isSv:false}.
  const guard = await requireRole(['admin', 'dispatch', 'kundenbetreuer'])
  if (!guard.success) return { isSv: false }

  const normalized = email.trim().toLowerCase()
  if (!normalized || !normalized.includes('@')) return { isSv: false }

  const db = createAdminClient()
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('rolle', 'sachverstaendiger')
    .ilike('email', normalized)
    .maybeSingle()

  if (!profile) return { isSv: false }

  const { data: sv } = await db
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', profile.id)
    .maybeSingle()

  return { isSv: true, sv_id: sv?.id ?? null }
}
