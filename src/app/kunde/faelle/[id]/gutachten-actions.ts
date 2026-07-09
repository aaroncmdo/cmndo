'use server'

// AV7 (abrechnungsweg-abhaengige Auftragssicht): der Kunde laedt sein Gutachten-PDF direkt
// herunter (Aaron 09.07.: „das Gutachten muss auch fuer den Kunden verfuegbar sein"). Bisher
// gab es nur den GutachtenWeiterleitungButton (Email). Spiegelt oeffneGutachtenPdf (werkstatt),
// aber gegatet ueber assertKundeOwnsClaim statt v_werkstatt_auftrag-RLS. Nur FERTIGGESTELLTE
// Gutachten (fertiggestellt_am gesetzt = vom SV finalisiert/KB-freigegeben) werden ausgeliefert.

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertKundeOwnsClaim } from '@/lib/claims/kunde-ownership'
import { getStorageUrl, STORAGE_TTL } from '@/lib/storage/url'

export async function oeffneGutachtenPdfKunde(
  claimId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!claimId) return { ok: false, error: 'Kein Fall.' }

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet.' }

  // Ownership-Gate (Service-Role fuer den Cross-Table-Check).
  const admin = createAdminClient()
  const ownership = await assertKundeOwnsClaim(admin, user.id, user.email ?? null, claimId)
  if (!ownership.ok) return { ok: false, error: 'Nicht autorisiert.' }

  // bericht_pdf_url des fertiggestellten Gutachtens via Service-Client.
  const svc = createServiceClient()
  const { data: g } = await svc
    .from('gutachten')
    .select('bericht_pdf_url')
    .eq('claim_id', claimId)
    .not('bericht_pdf_url', 'is', null)
    .not('fertiggestellt_am', 'is', null)
    .order('fertiggestellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  const pfad = (g as { bericht_pdf_url: string | null } | null)?.bericht_pdf_url ?? null
  if (!pfad) return { ok: false, error: 'Kein Gutachten verfügbar.' }

  if (pfad.startsWith('http://') || pfad.startsWith('https://')) {
    return { ok: true, url: pfad }
  }

  const url = await getStorageUrl(svc, 'gutachten', pfad, {
    ttl: STORAGE_TTL.download,
    download: true,
  })
  if (!url) return { ok: false, error: 'Download-Link konnte nicht erstellt werden.' }

  return { ok: true, url }
}
