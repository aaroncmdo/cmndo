// Leads des Kunden, aus denen noch kein Claim wurde (Flow nicht bis zur SA-Unterschrift).
// Alle drei Ownership-Wege des Portals (claim_parties / claims.geschaedigter_user_id /
// lead.email -> claim) enden bei CLAIMS — ohne diese Sicht saehe ein Kunde nach dem Login
// ohne Link eine leere Liste (Soll-Blatt 2026-09-19-kunde-kommt-ohne-link-ins-konto, 1c Weg 2
// Schritt 5). Gelesen wird ueber den Admin-Client, gescopt auf den Kontakt des eingeloggten
// Users: die leads-Policy hat keinen Kunden-Zweig und bekommt keinen.
import type { SupabaseClient } from '@supabase/supabase-js'
import { findeVorgaengeZuKontakt } from '@/lib/auth/lead-kontakt'

export type OffenerLead = { id: string; createdAt: string; schadentyp: string | null; kennzeichen: string | null }

type LeadRow = { id: string; created_at: string; schadentyp: string | null; kennzeichen: string | null }

export async function ladeOffeneLeadsFuerKunde(
  admin: SupabaseClient,
  kontakt: { email: string | null; telefon: string | null },
): Promise<OffenerLead[]> {
  if (!kontakt.email && !kontakt.telefon) return []
  const { leadIds } = await findeVorgaengeZuKontakt(admin, kontakt)
  if (leadIds.length === 0) return []
  const { data, error } = await admin
    .from('leads')
    .select('id, created_at, schadentyp, kennzeichen')
    .in('id', leadIds)
    .is('konvertiert_zu_fall_id', null)
    .order('created_at', { ascending: false })
    .limit(5)
  if (error) {
    console.error('[offene-leads]', error.message)
    return []
  }
  return ((data ?? []) as LeadRow[]).map((l) => ({
    id: l.id,
    createdAt: l.created_at,
    schadentyp: l.schadentyp,
    kennzeichen: l.kennzeichen,
  }))
}
