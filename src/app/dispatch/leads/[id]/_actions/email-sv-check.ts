'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type EmailSvCheckResult =
  | { isSv: false }
  | { isSv: true; sv_id: string | null }

/**
 * Prüft ob eine Email bereits mit einem Sachverständigen-Account verknüpft ist.
 * Dispatch-MA soll wissen wenn er einem SV einen FlowLink schickt — der würde
 * einfach einen Zweit-Account anlegen statt sich einzuloggen.
 */
export async function checkEmailIsSv(email: string): Promise<EmailSvCheckResult> {
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
