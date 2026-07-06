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
 * Speichert Steuerdaten eines Partners (ust_id + Adresse) fuer die Gutschrift-Erstellung.
 * Schreibt auf makler / werkstaetten / marketing_partner.
 *
 * Neue Spalten via Migration in diesem Branch — Typen folgen beim Merge-Regen (Regel 2).
 * Payload daher als `never` gecastet.
 */
export async function setzePartnerSteuerdaten(
  partnerTyp: 'makler' | 'werkstatt' | 'marketing',
  partnerId: string,
  daten: { ust_id?: string; adresse_strasse?: string; adresse_plz?: string; adresse_ort?: string },
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const TABLE_MAP = {
    makler: 'makler',
    werkstatt: 'werkstaetten',
    marketing: 'marketing_partner',
  } as const

  const updateObj: Record<string, string | null> = {}
  if ('ust_id' in daten) updateObj.ust_id = daten.ust_id?.trim() || null
  if ('adresse_strasse' in daten) updateObj.adresse_strasse = daten.adresse_strasse?.trim() || null
  if ('adresse_plz' in daten) updateObj.adresse_plz = daten.adresse_plz?.trim() || null
  if ('adresse_ort' in daten) updateObj.adresse_ort = daten.adresse_ort?.trim() || null

  if (Object.keys(updateObj).length === 0) {
    return { ok: false, error: 'Keine Daten' }
  }

  const table = TABLE_MAP[partnerTyp]
  const admin = createAdminClient()

  const { error } = await admin
    .from(table)
    .update(updateObj as never)
    .eq('id', partnerId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/finance/partner-abrechnungen')
  revalidatePath('/admin/werkstaetten')
  revalidatePath('/admin/finance/provisionen')
  return { ok: true }
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
 * Erstellt eine signierte Signed-URL fuer die Gutschrift-PDF eines Ledger-Eintrags.
 * Laedt aus partner_gutschriften den pdf_storage_path und gibt eine 5-Minuten-Signed-URL zurueck.
 */
export async function getPartnerGutschriftDownloadUrl(
  ledgerTabelle: string,
  ledgerId: string,
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  const admin = createAdminClient()

  const { data: g, error } = await admin
    .from('partner_gutschriften')
    .select('pdf_storage_path')
    .eq('ledger_tabelle', ledgerTabelle)
    .eq('ledger_id', ledgerId)
    .maybeSingle()

  if (error) return { ok: false, error: error.message }
  if (!g?.pdf_storage_path) return { ok: false, error: 'Keine Gutschrift-PDF vorhanden' }

  const { data: signed, error: urlErr } = await admin.storage
    .from('abrechnungen-pdf')
    .createSignedUrl(g.pdf_storage_path as string, 300)

  if (urlErr || !signed?.signedUrl) return { ok: false, error: urlErr?.message ?? 'Signed-URL-Fehler' }
  return { ok: true, url: signed.signedUrl }
}

/**
 * Laedt alle Billing-Zeilen + Aggregat + USt-Flag eines einzelnen Partners.
 * Wird vom Admin-Drawer in Makler-, Werkstatt-, Marketing- und Kanzlei-Listen on-demand aufgerufen.
 *
 * Fuer 'kanzlei': kein ist_kleinunternehmer (Forderungs-Partner, immer 19% USt) → null.
 * Fuer alle anderen Typen: gibt zusaetzlich gutschriftLedgerKeys zurueck.
 */
export async function ladePartnerBilling(
  partnerTyp: 'makler' | 'werkstatt' | 'marketing' | 'kanzlei',
  partnerId: string,
): Promise<
  | {
      ok: true
      rows: import('@/lib/finance/partner-billing').PartnerBillingRow[]
      aggregat: import('@/lib/finance/partner-billing').PartnerBillingAggregat
      istKleinunternehmer: boolean | null
      steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null } | null
      gutschriftLedgerKeys: string[]
    }
  | { ok: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return auth

  let istKleinunternehmer: boolean | null = null
  let steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null } | null = null
  let gutschriftLedgerKeys: string[] = []

  // Kanzlei ist Forderungs-Partner ohne Steuerdaten-Spalten → skip
  if (partnerTyp !== 'kanzlei') {
    const TABLE_MAP = {
      makler: 'makler',
      werkstatt: 'werkstaetten',
      marketing: 'marketing_partner',
    } as const

    const table = TABLE_MAP[partnerTyp]
    const admin = createAdminClient()

    // Spalten per Migration in Branch angelegt — Typen folgen beim Merge-Regen
    const { data } = await admin
      .from(table)
      .select('ist_kleinunternehmer, ust_id, adresse_strasse, adresse_plz, adresse_ort')
      .eq('id', partnerId)
      .single()
    const row = data as {
      ist_kleinunternehmer: boolean | null
      ust_id: string | null
      adresse_strasse: string | null
      adresse_plz: string | null
      adresse_ort: string | null
    } | null
    istKleinunternehmer = row?.ist_kleinunternehmer ?? null
    steuerdaten = row
      ? { ust_id: row.ust_id, adresse_strasse: row.adresse_strasse, adresse_plz: row.adresse_plz, adresse_ort: row.adresse_ort }
      : null

    // Gutschrift-Ledger-Keys laden (welche Auszahlungen haben eine PDF-Gutschrift)
    const { data: gs } = await admin
      .from('partner_gutschriften')
      .select('ledger_tabelle, ledger_id')
      .eq('partner_typ', partnerTyp)
      .eq('partner_id', partnerId)
    gutschriftLedgerKeys = (gs ?? []).map(
      (g: { ledger_tabelle: string; ledger_id: string }) => `${g.ledger_tabelle}:${g.ledger_id}`,
    )
  }

  const { getPartnerBilling } = await import('@/lib/finance/partner-billing')

  try {
    const { rows, aggregat } = await getPartnerBilling({ partnerTyp, partnerId })
    return { ok: true, rows, aggregat, istKleinunternehmer, steuerdaten, gutschriftLedgerKeys }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}
