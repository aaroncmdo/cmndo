// Paid-Perk-Ladehelfer (Aaron 03.08.): liest die Bezahl-Grundlage fuer die
// Whitelabel-Wirkung. BEWUSST via Admin-Client: die Branding-Resolver laufen
// teils im Kunden-/anon-Kontext (kunden-theme, token-theme, /kunde/termin) —
// dort blockt RLS sowohl sv_netzwerk_abonnements (select_own-Policy) als auch
// ggf. die paket-/anzahlung-Spalten. Es wird NUR ein boolescher Ableitungswert
// nach aussen gereicht, kein Row-Inhalt; svId/orgId kommen aus der jeweils
// bereits autorisierten Aufloesungskette (Claim/Token/Session), nie aus
// Client-Input.
import { createAdminClient } from '@/lib/supabase/admin'
import { brandingBezahlt } from './gate'

/** Zaehlt der SV fuer die Whitelabel-Wirkung als zahlend? (fail-closed) */
export async function istBrandingBezahlt(svId: string | null | undefined): Promise<boolean> {
  if (!svId) return false
  try {
    const admin = createAdminClient()
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('paket, anzahlung_status, sv_netzwerk_abonnements(status)')
      .eq('id', svId)
      .maybeSingle()
    if (!sv) return false
    const aboRel = (sv as { sv_netzwerk_abonnements?: { status: string | null }[] | { status: string | null } | null })
      .sv_netzwerk_abonnements
    const abo = Array.isArray(aboRel) ? aboRel[0] : aboRel
    return brandingBezahlt(sv as { paket: string | null; anzahlung_status: string | null }, abo?.status ?? null)
  } catch (err) {
    console.error('[branding/bezahl-status] istBrandingBezahlt:', err)
    return false
  }
}

/**
 * Org-Branding (Buero) haengt am Bezahl-Status des INHABERS (Aaron 03.08.):
 * Sub-SVs erben die Wirkung, der Traeger des Perks ist der zahlende Inhaber.
 */
export async function istBrandingBezahltFuerOrg(orgId: string | null | undefined): Promise<boolean> {
  if (!orgId) return false
  try {
    const admin = createAdminClient()
    const { data: inhaber } = await admin
      .from('sachverstaendige')
      .select('id')
      .eq('organisation_id', orgId)
      .ilike('rolle_in_organisation', 'inhaber')
      .limit(1)
      .maybeSingle()
    return istBrandingBezahlt(inhaber?.id ?? null)
  } catch (err) {
    console.error('[branding/bezahl-status] istBrandingBezahltFuerOrg:', err)
    return false
  }
}
