'use server'

// AAR-zb1-wizard: Server-Helper. Findet eine bestehende Pending-Anfrage
// für (lead_id, slot='fahrzeugschein') mit ocr=true oder legt eine neue
// an. Idempotent gegenüber Page-Reload — der Wizard kann den Helper
// beim Render mehrfach rufen ohne Token-Müll zu produzieren.
//
// Eine Anfrage gilt als "Pending" wenn:
//   - status IN ('gesendet', 'teilweise')
//   - expires_at in der Zukunft
//   - slots-Array enthält Eintrag mit slot_id='fahrzeugschein' und ocr=true

import { createAdminClient } from '@/lib/supabase/admin'

export type EnsureZb1Result =
  | { ok: true; token: string }
  | { ok: false; error: string }

export async function ensureZb1Anfrage(leadId: string): Promise<EnsureZb1Result> {
  if (!leadId) return { ok: false, error: 'leadId fehlt' }

  const db = createAdminClient()

  // 1. Lookup: gibt es eine pending Anfrage mit fahrzeugschein-Slot?
  const { data: existing } = await db
    .from('dokument_upload_anfragen')
    .select('token, lead_id')
    .eq('lead_id', leadId)
    .in('status', ['gesendet', 'teilweise'])
    .gte('expires_at', new Date().toISOString())
    .contains('slots', [{ slot_id: 'fahrzeugschein', ocr: true }])
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (existing && (existing as { token?: string }).token) {
    return { ok: true, token: (existing as { token: string }).token }
  }

  // 2. Neue Anfrage anlegen. Token = crypto.randomUUID() (32 Hex-Chars,
  //    > 16 chars wie vom Endpoint vorausgesetzt).
  const token = crypto.randomUUID().replace(/-/g, '')
  const slots = [
    {
      slot_id: 'fahrzeugschein',
      label: 'Fahrzeugschein (Vorderseite)',
      ocr: true,
      hochgeladen: false,
      doc_url: null,
      hochgeladen_am: null,
    },
  ]
  // expires_at = +7 Tage. Das Onboarding dauert idR Minuten, aber bei
  // Page-Reload nach z.B. 2 Tagen soll dieselbe Anfrage weiter verwendbar
  // sein.
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()

  const { data: created, error } = await db
    .from('dokument_upload_anfragen')
    .insert({
      lead_id: leadId,
      token,
      slots,
      status: 'gesendet',
      kanal: 'onboarding-wizard',
      gesendet_am: now,
      expires_at: expiresAt,
    })
    .select('token')
    .single()

  if (error || !created) {
    return { ok: false, error: `Anfrage konnte nicht erstellt werden: ${error?.message ?? 'unbekannt'}` }
  }

  return { ok: true, token: (created as { token: string }).token }
}
