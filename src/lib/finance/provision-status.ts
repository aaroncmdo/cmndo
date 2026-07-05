import type { SupabaseClient } from '@supabase/supabase-js'
import { computeProvisionUst } from './partner-billing-ust'
import { erstellePartnerGutschrift } from './partner-gutschrift'
import { generateAndUploadPartnerGutschriftPdf } from './partner-gutschrift-pdf'

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
  partnerTyp: 'makler' | 'werkstatt' | 'marketing'
  leistungText: string
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
    partnerTyp: 'makler',
    leistungText: 'Vermittlungsprovision',
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
    partnerTyp: 'werkstatt',
    leistungText: 'Vermittlungsprovision',
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
    partnerTyp: 'marketing',
    leistungText: 'Vermittlungsprovision',
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
    partnerTyp: 'makler',
    leistungText: 'Staffel-Bonus',
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
    partnerTyp: 'werkstatt',
    leistungText: 'Staffel-Bonus',
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
 * Liest netto + Partner-FK + ist_kleinunternehmer, blockt wenn USt-Status unbekannt,
 * friert USt ein (nur ust_*-Spalten), erstellt die Gutschrift (blockiert bei unvollstaendigen
 * Steuerdaten), generiert das PDF (Kompensations-Delete bei Fehler) und setzt erst dann
 * Status auf ausgezahlt/paid. Idempotenz-Pre-Check: bei Retry mit bestehender Gutschrift
 * (UNIQUE ledger_tabelle+ledger_id) wird erstelle uebersprungen; PDF-Generierung nur wenn
 * pdf_storage_path noch null.
 */
export async function auszahlenProvision(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const meta = META[tabelle]

  // Step 1 — Lesen: netto + partner_id + ist_kleinunternehmer
  // Freeze-Spalten + Partner-ist_kleinunternehmer: Migration in diesem Branch, Typen folgen beim Merge-Regen (Regel 2).
  const selectStr = `${meta.betrag}, ${meta.fk}, ${meta.partner}(${meta.partnerFlag})`
  const { data, error: readError } = await db
    .from(tabelle)
    .select(selectStr)
    .eq('id', id)
    .single()

  if (readError) return { ok: false, error: readError.message }

  const nettoEur: number = (data as any)[meta.betrag]
  const partnerId: string | null | undefined = (data as any)[meta.fk]
  if (!partnerId) return { ok: false, error: 'Partner-Zuordnung fehlt' }

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

  // Step 2 — Freeze: schreibt nur ust_* Spalten, NOCH KEIN status
  const { error: freezeErr } = await db
    .from(tabelle)
    .update({ ust_satz: ust.ustSatz, ust_betrag: ust.ustBetrag, betrag_brutto: ust.brutto })
    .eq('id', id)
  if (freezeErr) return { ok: false, error: freezeErr.message }

  // Step 3 — Idempotency pre-check: gibt es bereits eine Gutschrift fuer diesen Ledger-Eintrag?
  // Deliberate hardening: ohne diesen Check wuerde ein transientes Fail auf dem finalen status-Update
  // alle Retries deadlocken (UNIQUE ledger_tabelle+ledger_id verhindert Re-Creation).
  const { data: existingRow } = await db
    .from('partner_gutschriften')
    .select('*')
    .eq('ledger_tabelle', tabelle)
    .eq('ledger_id', id)
    .maybeSingle()

  let row: Record<string, any> | null = existingRow ?? null
  let justCreated = false

  if (!row) {
    // Gutschrift erstellen — blockiert Auszahlung wenn Steuerdaten unvollstaendig
    const g = await erstellePartnerGutschrift(db, {
      tabelle,
      ledgerId: id,
      partnerTyp: meta.partnerTyp,
      partnerId,
      betraege: {
        nettoCent: Math.round(nettoEur * 100),
        ustSatz: ust.ustSatz,
        ustBetrag: ust.ustBetrag === null ? null : Math.round(ust.ustBetrag * 100),
        bruttoCent: Math.round((ust.brutto ?? 0) * 100),
      },
      leistungText: meta.leistungText,
    })
    if (!g.ok) return { ok: false, error: g.error }

    // Zeile nachladen fuer PDF-Input
    const { data: refetched } = await db
      .from('partner_gutschriften')
      .select('*')
      .eq('id', g.gutschriftId)
      .maybeSingle()
    if (!refetched) return { ok: false, error: 'Gutschrift-Datensatz nach Anlage nicht gefunden' }

    row = refetched
    justCreated = true
  }

  // At this point row is guaranteed non-null: either existingRow was truthy, or
  // the if(!row) block assigned refetched (or returned early on error).
  const gutschriftRow = row as Record<string, any>

  // Step 4 — PDF generieren (nur wenn noch kein pdf_storage_path gesetzt)
  if (!gutschriftRow.pdf_storage_path) {
    const pdf = await generateAndUploadPartnerGutschriftPdf({
      gutschrift_nr: gutschriftRow.gutschrift_nr,
      erstellt_am: gutschriftRow.erstellt_am,
      leistung_text: gutschriftRow.leistung_text,
      betrag_netto: gutschriftRow.betrag_netto,
      ust_satz: gutschriftRow.ust_satz,
      ust_betrag: gutschriftRow.ust_betrag,
      betrag_brutto: gutschriftRow.betrag_brutto,
      empfaenger_snapshot: gutschriftRow.empfaenger_snapshot,
      aussteller_snapshot: gutschriftRow.aussteller_snapshot,
    })
    if (!pdf.ok) {
      // Kompensations-Delete: nur die soeben angelegte Zeile entfernen
      if (justCreated) await db.from('partner_gutschriften').delete().eq('id', gutschriftRow.id)
      return { ok: false, error: pdf.error }
    }
    const { error: patchErr } = await db
      .from('partner_gutschriften')
      .update({ pdf_storage_path: pdf.pdfPath })
      .eq('id', gutschriftRow.id)
    // do NOT delete — row+PDF are valid; retry re-patches via the pre-check
    if (patchErr) return { ok: false, error: patchErr.message }
  }

  // Step 5 — Status auf paid setzen (letzter Ledger-Write; nur erreichbar wenn Gutschrift + PDF vorhanden)
  const now = new Date().toISOString()
  const statusPatch: Record<string, unknown> = { status: meta.paidStatus }
  if (meta.paidCol) {
    statusPatch[meta.paidCol] = now
  }
  const { error: statusErr } = await db.from(tabelle).update(statusPatch).eq('id', id)
  if (statusErr) return { ok: false, error: statusErr.message }

  return { ok: true }
}
