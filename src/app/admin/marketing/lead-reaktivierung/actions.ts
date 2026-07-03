'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getWinbackCandidates, markWinbackSent } from '@/lib/leads/winback'
import { sendLeadWinbackEmail } from '@/lib/email/lead-winback'

// Batch-Größe pro Klick — hält die Server-Action unter Next-Timeout + Resend-
// Rate-Limit. Idempotent (winback_sent_at) → Admin klickt für den nächsten Batch
// erneut, bis die Kohorte leer ist.
const BATCH = 50

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') throw new Error('Kein Zugriff')
}

export async function sendeWinbackKampagne(): Promise<{
  ok: boolean
  gesendet: number
  fehlgeschlagen: number
  error?: string
}> {
  try {
    await requireAdmin()
  } catch (e) {
    return { ok: false, gesendet: 0, fehlgeschlagen: 0, error: e instanceof Error ? e.message : 'Kein Zugriff' }
  }

  // Service-Client für Versand + Lead-Update (RLS-Bypass) — Admin-Gate ist bereits durch.
  const db = createServiceClient()
  const candidates = await getWinbackCandidates(db, BATCH)

  let gesendet = 0
  let fehlgeschlagen = 0
  for (const lead of candidates) {
    const ok = await sendLeadWinbackEmail(lead)
    if (!ok) {
      fehlgeschlagen += 1
      continue
    }
    // Erst nach erfolgreichem Versand markieren — ein Fehler beim Markieren
    // zählt als fehlgeschlagen (der Lead bleibt drin, wird beim nächsten Batch
    // erneut versucht; Resend dedupliziert nicht, aber der Fall ist selten).
    const marked = await markWinbackSent(db, lead.id)
    if (!marked) {
      fehlgeschlagen += 1
      continue
    }
    gesendet += 1
  }

  revalidatePath('/admin/marketing/lead-reaktivierung')
  return { ok: true, gesendet, fehlgeschlagen }
}
