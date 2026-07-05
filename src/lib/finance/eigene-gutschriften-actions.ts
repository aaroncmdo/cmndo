'use server'

// AAR-664: Nur async Funktionen exportieren — keine Typen/Konst aus 'use server'-Files.
// EigeneGutschrift-Typ lebt in PartnerGutschriftenListe.tsx (Client-Seite).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { EigeneGutschrift } from '@/components/shared/finance/PartnerGutschriftenListe'

export async function getEigeneGutschriften(): Promise<EigeneGutschrift[]> {
  const supabase = await createClient()
  // RLS pg_partner_self_read -> nur eigene Zeilen; kein expliziter partner-Filter noetig.
  const { data } = await supabase
    .from('partner_gutschriften')
    .select('id, gutschrift_nr, betrag_brutto, erstellt_am, status')
    .order('erstellt_am', { ascending: false })
  return (data ?? []) as EigeneGutschrift[]
}

export async function getEigeneGutschriftUrl(
  gutschriftId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  // RLS: ein Fremd-Partner sieht die Zeile nicht -> maybeSingle() = null -> "nicht gefunden".
  const { data: g } = await supabase
    .from('partner_gutschriften')
    .select('pdf_storage_path')
    .eq('id', gutschriftId)
    .maybeSingle()
  const pdfPath = (g as { pdf_storage_path: string | null } | null)?.pdf_storage_path
  if (!pdfPath) return { ok: false, error: 'Gutschrift nicht gefunden' }
  const admin = createAdminClient()
  const { data: signed, error } = await admin.storage
    .from('onboarding-rechnungen')
    .createSignedUrl(pdfPath, 300)
  if (error || !signed?.signedUrl)
    return { ok: false, error: error?.message ?? 'Signed-URL-Fehler' }
  return { ok: true, url: signed.signedUrl }
}
