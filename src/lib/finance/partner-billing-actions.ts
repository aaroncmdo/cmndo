'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  freigebenProvision,
  storniereProvision,
  auszahlenProvision,
  PROVISION_TABELLEN,
} from '@/lib/finance/provision-status'
import {
  markBezahlt,
  retryEinzug,
  stornoAbrechnung,
} from '@/app/admin/abrechnungen/actions'

// AAR-664: Nur async Funktionen exportieren — keine Konst/Typen aus 'use server'-Files.

/** Inline Admin-Guard — gibt { ok:true } zurueck oder { ok:false, error } wenn nicht admin. */
async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht autorisiert' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nicht autorisiert' }
  return { ok: true }
}

/**
 * Markiert eine Rechnung manuell als bezahlt (z.B. nach Bank-Ueberweisung).
 * Nur fuer quelle='abrechnungen' unterstuetzt.
 */
export async function markiereAlsBezahlt(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (quelle !== 'abrechnungen') {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const r = await markBezahlt(id)
  revalidatePath('/admin/finance/partner-abrechnungen')
  return r.success ? { ok: true } : { ok: false, error: r.error }
}

/**
 * Loest einen erneuten Stripe-Lastschrift-Einzug aus.
 * Nur fuer quelle='abrechnungen' unterstuetzt.
 */
export async function loeseEinzugErneutAus(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (quelle !== 'abrechnungen') {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const r = await retryEinzug(id)
  revalidatePath('/admin/finance/partner-abrechnungen')
  return r.success ? { ok: true } : { ok: false, error: r.error }
}

/**
 * Gibt eine Provision frei (Status -> 'freigegeben').
 * Quelle muss eine der 5 Provisions-/Bonus-Tabellen sein.
 */
export async function gebeProvisionFrei(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (!(PROVISION_TABELLEN as readonly string[]).includes(quelle)) {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const admin = createAdminClient()
  const r = await freigebenProvision(admin, quelle as (typeof PROVISION_TABELLEN)[number], id)
  revalidatePath('/admin/finance/partner-abrechnungen')
  return r
}

/**
 * Zahlt eine Provision aus (Freeze USt + Status -> ausgezahlt/paid).
 * Quelle muss eine der 5 Provisions-/Bonus-Tabellen sein.
 */
export async function zahleProvisionAus(
  quelle: string,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (!(PROVISION_TABELLEN as readonly string[]).includes(quelle)) {
    return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
  }

  const admin = createAdminClient()
  const r = await auszahlenProvision(admin, quelle as (typeof PROVISION_TABELLEN)[number], id)
  revalidatePath('/admin/finance/partner-abrechnungen')
  return r
}

/**
 * Storniert eine Rechnung oder Provision.
 * - quelle='abrechnungen' -> stornoAbrechnung (Stripe Refund + Storno-Rechnung)
 * - quelle in PROVISION_TABELLEN -> storniereProvision
 */
export async function storniere(
  quelle: string,
  id: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  if (quelle === 'abrechnungen') {
    const r = await stornoAbrechnung(id, grund)
    revalidatePath('/admin/finance/partner-abrechnungen')
    return r.success ? { ok: true } : { ok: false, error: r.error }
  }

  if ((PROVISION_TABELLEN as readonly string[]).includes(quelle)) {
    const admin = createAdminClient()
    const r = await storniereProvision(
      admin,
      quelle as (typeof PROVISION_TABELLEN)[number],
      id,
      grund,
    )
    revalidatePath('/admin/finance/partner-abrechnungen')
    return r
  }

  return { ok: false, error: 'Aktion für diese Quelle nicht verfügbar' }
}

/**
 * Setzt den USt-Status eines Partners (Kleinunternehmer ja/nein).
 * Schreibt ist_kleinunternehmer auf makler / werkstaetten / marketing_partner.
 *
 * Hinweis: ist_kleinunternehmer ist via Migration in diesem Branch neu — Typen
 * folgen beim Merge-Regen (Regel 2). Payload daher als `never` gecastet.
 */
export async function setzePartnerUstStatus(
  partnerTyp: 'makler' | 'werkstatt' | 'marketing',
  partnerId: string,
  istKleinunternehmer: boolean,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const TABLE_MAP = {
    makler: 'makler',
    werkstatt: 'werkstaetten',
    marketing: 'marketing_partner',
  } as const

  const table = TABLE_MAP[partnerTyp]
  const admin = createAdminClient()

  // ist_kleinunternehmer: Spalte per Migration in Branch angelegt, Typen noch nicht regeneriert.
  const { error } = await admin
    .from(table)
    .update({ ist_kleinunternehmer: istKleinunternehmer } as never)
    .eq('id', partnerId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/finance/partner-abrechnungen')
  return { ok: true }
}

/**
 * Laedt alle Billing-Zeilen + Aggregat + USt-Flag eines einzelnen Partners.
 * Wird vom Admin-Drawer in Makler-, Werkstatt-, Marketing- und Kanzlei-Listen on-demand aufgerufen.
 *
 * Fuer 'kanzlei': kein ist_kleinunternehmer (Forderungs-Partner, immer 19% USt) → null.
 */
export async function ladePartnerBilling(
  partnerTyp: 'makler' | 'werkstatt' | 'marketing' | 'kanzlei',
  partnerId: string,
): Promise<
  | { ok: true; rows: import('@/lib/finance/partner-billing').PartnerBillingRow[]; aggregat: import('@/lib/finance/partner-billing').PartnerBillingAggregat; istKleinunternehmer: boolean | null }
  | { ok: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  let istKleinunternehmer: boolean | null = null

  // Kanzlei ist Forderungs-Partner ohne ist_kleinunternehmer-Spalte → skip
  if (partnerTyp !== 'kanzlei') {
    const TABLE_MAP = {
      makler: 'makler',
      werkstatt: 'werkstaetten',
      marketing: 'marketing_partner',
    } as const

    const table = TABLE_MAP[partnerTyp]
    const admin = createAdminClient()

    // ist_kleinunternehmer per Migration in Branch angelegt — Typen folgen beim Merge-Regen
    const { data } = await admin
      .from(table)
      .select('ist_kleinunternehmer')
      .eq('id', partnerId)
      .single()
    istKleinunternehmer =
      (data as { ist_kleinunternehmer: boolean | null } | null)?.ist_kleinunternehmer ?? null
  }

  const { getPartnerBilling } = await import('@/lib/finance/partner-billing')

  try {
    const { rows, aggregat } = await getPartnerBilling({ partnerTyp, partnerId })
    return { ok: true, rows, aggregat, istKleinunternehmer }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}
