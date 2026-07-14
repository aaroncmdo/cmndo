'use server'
// Cold-Mailer S3: Sende-Verlauf eines Leads (cold_mail_sends = SSoT).
// Der Status wird vom Resend-Webhook (api/webhooks/resend) fortgeschrieben.
import { requireRole } from '@/lib/auth/guards'

export type ColdMailVerlaufEintrag = {
  id: string
  betreff: string
  status: string
  gesendet_am: string
  geoeffnet_am: string | null
  geklickt_am: string | null
}

export async function ladeColdMailVerlauf(
  leadId: string,
): Promise<{ ok: true; data: ColdMailVerlaufEintrag[] } | { ok: false; error: string }> {
  const guard = await requireRole(['admin', 'dispatch'])
  if (!guard.success) return { ok: false, error: guard.error ?? 'Kein Zugriff' }

  const { data, error } = await guard.supabase
    .from('cold_mail_sends')
    .select('id, betreff, status, gesendet_am, geoeffnet_am, geklickt_am')
    .eq('lead_id', leadId)
    .order('gesendet_am', { ascending: false })

  if (error) return { ok: false, error: 'Verlauf konnte nicht geladen werden.' }
  return { ok: true, data: (data ?? []) as ColdMailVerlaufEintrag[] }
}
