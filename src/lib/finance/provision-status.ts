import type { SupabaseClient } from '@supabase/supabase-js'
import { computeProvisionUst } from './partner-billing-ust'

export const PROVISION_TABELLEN = [
  'makler_provisionen',
  'werkstatt_provisionen',
  'provisionen_maik',
  'makler_staffel_bonus',
  'werkstatt_staffel_bonus',
] as const

export type ProvisionTabelle = (typeof PROVISION_TABELLEN)[number]

// Per-ledger status/storno vocabulary verified against database.types.ts:
//   makler_provisionen     → status: freigegeben/storniert; HAS storniert_am + storno_grund
//   werkstatt_provisionen  → status: freigegeben/storniert; HAS storniert_am + storno_grund
//   makler_staffel_bonus   → status: freigegeben/storniert; NO storniert_am / storno_grund
//   werkstatt_staffel_bonus→ status: freigegeben/storniert; NO storniert_am / storno_grund
//   provisionen_maik       → status: pending/confirmed/paid/reversed; HAS reversed_grund (NO storniert_am)
type LedgerMeta = {
  betrag: string
  partner: string
  fk: string
  partnerFlag: string
  paidStatus: string
  paidCol?: string
  releaseStatus: string
  stornoStatus: string
  stornoCol?: string
  grundCol?: string
}

const META: Record<ProvisionTabelle, LedgerMeta> = {
  makler_provisionen: {
    betrag: 'betrag_netto_eur',
    partner: 'makler',
    fk: 'makler_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'ausgezahlt',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    stornoCol: 'storniert_am',
    grundCol: 'storno_grund',
  },
  werkstatt_provisionen: {
    betrag: 'betrag_netto_eur',
    partner: 'werkstaetten',
    fk: 'werkstatt_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'ausgezahlt',
    paidCol: 'ausgezahlt_am',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    stornoCol: 'storniert_am',
    grundCol: 'storno_grund',
  },
  provisionen_maik: {
    betrag: 'netto_provision',
    partner: 'marketing_partner',
    fk: 'marketing_partner_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'paid',
    paidCol: 'paid_at',
    releaseStatus: 'confirmed',
    stornoStatus: 'reversed',
    // no stornoCol — provisionen_maik has no storniert_am equivalent
    grundCol: 'reversed_grund',
  },
  makler_staffel_bonus: {
    betrag: 'bonus_betrag_netto',
    partner: 'makler',
    fk: 'makler_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'ausgezahlt',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    // no stornoCol/grundCol — makler_staffel_bonus has no storno timestamp/reason cols
  },
  werkstatt_staffel_bonus: {
    betrag: 'bonus_betrag_netto',
    partner: 'werkstaetten',
    fk: 'werkstatt_id',
    partnerFlag: 'ist_kleinunternehmer',
    paidStatus: 'ausgezahlt',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    // no stornoCol/grundCol — werkstatt_staffel_bonus has no storno timestamp/reason cols
  },
} as const

/** Setzt Status -> releaseStatus (freigegeben / confirmed je nach Ledger). */
export async function freigebenProvision(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const meta = META[tabelle]
  const { error } = await db.from(tabelle).update({ status: meta.releaseStatus }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/** Setzt Status -> stornoStatus; setzt stornoCol=now und grundCol=grund nur wenn die Spalte existiert. */
export async function storniereProvision(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
  grund: string,
): Promise<{ ok: boolean; error?: string }> {
  const meta = META[tabelle]
  const patch: Record<string, unknown> = { status: meta.stornoStatus }
  if (meta.stornoCol) {
    patch[meta.stornoCol] = new Date().toISOString()
  }
  if (meta.grundCol) {
    patch[meta.grundCol] = grund
  }
  const { error } = await db.from(tabelle).update(patch).eq('id', id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * Liest netto + Partner-ist_kleinunternehmer, blockt wenn USt-Status unbekannt,
 * friert USt via computeProvisionUst ein und setzt Status auf ausgezahlt/paid.
 */
export async function auszahlenProvision(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const meta = META[tabelle]
  // Freeze-Spalten + Partner-ist_kleinunternehmer: Migration in diesem Branch, Typen folgen beim Merge-Regen (Regel 2).
  const selectStr = `${meta.betrag}, ${meta.partner}(${meta.partnerFlag})`
  const { data, error: readError } = await db
    .from(tabelle)
    .select(selectStr)
    .eq('id', id)
    .single()

  if (readError) return { ok: false, error: readError.message }

  const nettoEur: number = (data as any)[meta.betrag]
  // Supabase select('a(b)') liefert je nach Cardinality Array oder Objekt -- immer normalisieren.
  const partnerRaw = (data as any)[meta.partner]
  const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw
  const istKleinunternehmer: boolean | null = partner?.[meta.partnerFlag] ?? null

  const ust = computeProvisionUst(nettoEur, istKleinunternehmer)

  if (!ust.bekannt) {
    return {
      ok: false,
      error: 'USt-Status des Partners unbekannt — bitte erst erfassen.',
    }
  }

  const now = new Date().toISOString()
  // Freeze-Spalten + Partner-ist_kleinunternehmer: Migration in diesem Branch, Typen folgen beim Merge-Regen (Regel 2).
  const patch: Record<string, unknown> = {
    status: meta.paidStatus,
    ust_satz: ust.ustSatz,
    ust_betrag: ust.ustBetrag,
    betrag_brutto: ust.brutto,
  }
  if ('paidCol' in meta && meta.paidCol) {
    patch[meta.paidCol] = now
  }

  const { error: writeError } = await db.from(tabelle).update(patch).eq('id', id)
  if (writeError) return { ok: false, error: writeError.message }
  return { ok: true }
}
