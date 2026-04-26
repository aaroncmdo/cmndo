// AAR-841: Kanzlei-Pakete + Settings Queries

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type KanzleiPaket = {
  id: string
  claim_id: string
  empfaenger_typ: 'partnerkanzlei' | 'eigene_kanzlei'
  empfaenger_kanzlei_name: string
  empfaenger_kanzlei_email: string | null
  empfaenger_kanzlei_telefon: string | null
  empfaenger_kanzlei_kontaktperson: string | null
  inhalt_dokumente_jsonb: Array<{ type: string; url?: string; name?: string }>
  status: 'entwurf' | 'versendet' | 'bestaetigt' | 'fehlgeschlagen'
  versendet_am: string | null
  versendet_durch_user_id: string | null
  versand_methode: 'email' | 'post' | 'portal_lexdrive' | null
  versand_external_id: string | null
  bestaetigt_am: string | null
  created_at: string
  updated_at: string
  notiz: string | null
}

export type PartnerKanzleiSettings = {
  name: string
  email: string
  telefon: string
  whatsappUrl: string
  terminUrl: string
  kontaktperson: string
}

/**
 * AAR-842: Helper für Kanzlei-Block-UI. Gibt das aktuell aktive Paket pro
 * Claim zurück (status=versendet oder bestaetigt, neuestes zuerst). Wird auch
 * von AAR-840 (markClaimAsAnExterneKanzlei-Pre-Check) und AAR-843 (Timeline-
 * Render) konsumiert. NULL wenn kein aktives Paket existiert.
 */
export async function getActiveKanzleiPaket(claimId: string): Promise<KanzleiPaket | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kanzlei_pakete')
    .select(
      'id, claim_id, empfaenger_typ, empfaenger_kanzlei_name, empfaenger_kanzlei_email, empfaenger_kanzlei_telefon, empfaenger_kanzlei_kontaktperson, inhalt_dokumente_jsonb, status, versendet_am, versendet_durch_user_id, versand_methode, versand_external_id, bestaetigt_am, created_at, updated_at, notiz',
    )
    .eq('claim_id', claimId)
    .in('status', ['versendet', 'bestaetigt'])
    .order('versendet_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[AAR-842] getActiveKanzleiPaket:', error.message)
    return null
  }

  return (data as KanzleiPaket | null) ?? null
}

export async function getKanzleiPaketeForClaim(claimId: string): Promise<KanzleiPaket[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('kanzlei_pakete')
    .select(
      'id, claim_id, empfaenger_typ, empfaenger_kanzlei_name, empfaenger_kanzlei_email, empfaenger_kanzlei_telefon, empfaenger_kanzlei_kontaktperson, inhalt_dokumente_jsonb, status, versendet_am, versendet_durch_user_id, versand_methode, versand_external_id, bestaetigt_am, created_at, updated_at, notiz',
    )
    .eq('claim_id', claimId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[AAR-841] getKanzleiPaketeForClaim:', error.message)
    return []
  }

  return (data ?? []) as KanzleiPaket[]
}

/** Lädt Partnerkanzlei-Settings (LexDrive). Admin-Client weil settings-RLS möglicherweise restriktiv. */
export async function getPartnerKanzleiSettings(): Promise<PartnerKanzleiSettings | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('settings')
    .select('key, value')
    .like('key', 'kanzlei_partner_%')

  if (error || !data) {
    console.error('[AAR-841] getPartnerKanzleiSettings:', error?.message)
    return null
  }

  const map = new Map<string, string>()
  for (const row of data) map.set(row.key as string, (row.value as string) ?? '')

  const name = map.get('kanzlei_partner_name')
  const email = map.get('kanzlei_partner_email')
  if (!name || !email) return null

  return {
    name,
    email,
    telefon:        map.get('kanzlei_partner_telefon')        ?? '',
    whatsappUrl:    map.get('kanzlei_partner_whatsapp_url')   ?? '',
    terminUrl:      map.get('kanzlei_partner_termin_url')     ?? '',
    kontaktperson:  map.get('kanzlei_partner_kontaktperson')  ?? '',
  }
}
