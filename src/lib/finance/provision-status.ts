import type { SupabaseClient } from '@supabase/supabase-js'
import { computeProvisionUst } from './partner-billing-ust'
import { LEDGER_TABELLEN } from './ledger-tabellen'
import {
  erstellePartnerGutschrift,
  versendePartnerGutschrift,
  erstelleStornoGutschrift,
} from './partner-gutschrift'
import { generateAndUploadPartnerGutschriftPdf } from './partner-gutschrift-pdf'
import { partnerTabelleFuer, type PartnerTyp } from './partner-tabellen'

// Nach der Provisions-Unifikation: EINE Provisions- + EINE Staffel-Tabelle (partner_typ-Union),
// maik separat. Die Alt-Tabellen sind aus dem View + allen Readern raus (Phase 2); v_partner_billing
// emittiert quelle_tabelle nur noch aus dieser Liste. Quelle = die typsichere LEDGER_TABELLEN-
// Konstante -> EINE Definition der gueltigen Ledger-Tabellen (schliesst die T6b-Bug-Klasse).
export const PROVISION_TABELLEN = [
  LEDGER_TABELLEN.PARTNER_PROVISIONEN,
  LEDGER_TABELLEN.PARTNER_STAFFEL_BONUS,
] as const

export type ProvisionTabelle = (typeof PROVISION_TABELLEN)[number]

// Ledger-Vokabular (nach Provisions-Unifikation, verifiziert gegen prod-Schema):
//   partner_provisionen   → status: freigegeben/ausgezahlt/storniert; HAS storniert_am + storno_grund
//                           + ausgezahlt_am (paidCol, fuer makler+werkstatt vereinheitlicht)
//   partner_staffel_bonus → status: freigegeben/ausgezahlt/storniert; NO storniert_am/storno_grund/ausgezahlt_am
// Beide sind Union-Tabellen: partner_typ als Spalte (partnerTypCol) -> Partner-Tabelle + Steuer-Status
// werden pro Row aufgeloest (partner_provisionen ist FK-los zu makler/werkstaetten -> kein Embed).
type LedgerMeta = {
  betrag: string
  fk: string
  partnerFlag: string
  partner?: string          // nur non-Union (maik): Embed-Partner-Tabelle
  partnerTyp?: PartnerTyp  // nur non-Union (maik): statischer Typ
  partnerTypCol?: string    // Union: Spalte mit partner_typ (dynamisch aufgeloest)
  paidStatus: string
  paidCol?: string
  releaseStatus: string
  stornoStatus: string
  stornoCol?: string
  grundCol?: string
  leistungText: string
  leistungDatumCol: string
}

const META: Record<ProvisionTabelle, LedgerMeta> = {
  partner_provisionen: {
    betrag: 'betrag_netto_eur',
    fk: 'partner_id',
    partnerFlag: 'ist_kleinunternehmer',
    partnerTypCol: 'partner_typ',
    paidStatus: 'ausgezahlt',
    paidCol: 'ausgezahlt_am',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    stornoCol: 'storniert_am',
    grundCol: 'storno_grund',
    leistungText: 'Vermittlungsprovision',
    leistungDatumCol: 'trigger_at',
  },
  partner_staffel_bonus: {
    betrag: 'bonus_betrag_netto',
    fk: 'partner_id',
    partnerFlag: 'ist_kleinunternehmer',
    partnerTypCol: 'partner_typ',
    paidStatus: 'ausgezahlt',
    releaseStatus: 'freigegeben',
    stornoStatus: 'storniert',
    // no stornoCol/grundCol — partner_staffel_bonus has no storno timestamp/reason cols
    leistungText: 'Staffel-Bonus',
    leistungDatumCol: 'erstellt_am',
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

  // Non-fatal: bei Storno einer AUSGEZAHLTEN Provision eine Storno-Gutschrift (Korrekturbeleg)
  // ausstellen. Der Ledger-Storno oben ist die Primaeraktion und darf NIE an einer Beleg-/PDF-/
  // Mail-Panne scheitern — ein ausgezahlter Payout muss reversibel bleiben.
  try {
    const { data: orig } = await db
      .from('partner_gutschriften')
      .select('*')
      .eq('ledger_tabelle', tabelle)
      .eq('ledger_id', id)
      .eq('typ', 'gutschrift')
      .neq('status', 'storniert')
      .maybeSingle()

    if (orig) {
      const origRow = orig as Record<string, any>
      const s = await erstelleStornoGutschrift(db, origRow.id, grund)
      if (s.ok) {
        const { data: stornoRow } = await db
          .from('partner_gutschriften')
          .select('*')
          .eq('id', s.stornoId)
          .maybeSingle()
        if (stornoRow) {
          const sr = stornoRow as Record<string, any>
          // Zero-padded (05.07.2026), konsistent mit fmtDate im PDF (day/month:'2-digit').
          const bezugDatum = new Date(origRow.erstellt_am).toLocaleDateString('de-DE', {
            timeZone: 'Europe/Berlin',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          })
          const pdf = await generateAndUploadPartnerGutschriftPdf({
            gutschrift_nr: sr.gutschrift_nr,
            erstellt_am: sr.erstellt_am,
            leistung_datum: sr.leistung_datum ?? null,
            leistung_text: sr.leistung_text,
            betrag_netto: sr.betrag_netto,
            ust_satz: sr.ust_satz,
            ust_betrag: sr.ust_betrag,
            betrag_brutto: sr.betrag_brutto,
            empfaenger_snapshot: sr.empfaenger_snapshot,
            aussteller_snapshot: sr.aussteller_snapshot,
            storno: { bezugNummer: origRow.gutschrift_nr, bezugDatum, grund },
          })
          if (pdf.ok) {
            await db
              .from('partner_gutschriften')
              .update({ pdf_storage_path: pdf.pdfPath })
              .eq('id', s.stornoId)
            await versendePartnerGutschrift(db, s.stornoId)
          }
        }
      }
    }
  } catch (err) {
    console.error('[storno-gutschrift] non-fatal:', err instanceof Error ? err.message : err)
  }

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

  // Step 1 — Lesen: netto + partner_id (+ partner_typ bei Union) + leistungDatumCol.
  // Union-Tabellen (partner_provisionen/-staffel_bonus) sind polymorph -- partner_id hat KEINEN FK
  // zu makler/werkstaetten -> kein PostgREST-Embed moeglich; ist_kleinunternehmer wird ueber
  // partner_typ + einen separaten Partner-Read aufgeloest. maik bleibt beim FK-Embed.
  const isUnion = !!meta.partnerTypCol
  const selectStr = isUnion
    ? `${meta.betrag}, ${meta.fk}, ${meta.partnerTypCol}, ${meta.leistungDatumCol}`
    : `${meta.betrag}, ${meta.fk}, ${meta.partner}(${meta.partnerFlag}), ${meta.leistungDatumCol}`
  const { data, error: readError } = await db
    .from(tabelle)
    .select(selectStr)
    .eq('id', id)
    .single()

  if (readError) return { ok: false, error: readError.message }

  const nettoEur: number = (data as any)[meta.betrag]
  const partnerId: string | null | undefined = (data as any)[meta.fk]
  if (!partnerId) return { ok: false, error: 'Partner-Zuordnung fehlt' }

  // Leistungsdatum je Ledger: trigger_at / created_at / erstellt_am
  const leistungsDatum: string | null = (data as any)[meta.leistungDatumCol] ?? null

  // partner_typ + ist_kleinunternehmer aufloesen. Union: partner_typ aus der Row -> passende
  // Partner-Tabelle separat lesen. Non-Union (maik): statischer partnerTyp + FK-Embed normalisieren.
  let partnerTyp: PartnerTyp
  let istKleinunternehmer: boolean | null
  if (isUnion) {
    partnerTyp = (data as any)[meta.partnerTypCol as string] as PartnerTyp
    // firmen_flotte -> firmen (Aaron 14.07.); unbekannter Typ -> null (kein stiller Fallback).
    const partnerTable = partnerTabelleFuer(partnerTyp)
    if (!partnerTable) return { ok: false, error: `Unbekannter partner_typ '${partnerTyp}'` }
    const { data: pRow } = await db
      .from(partnerTable)
      .select(meta.partnerFlag)
      .eq('id', partnerId)
      .maybeSingle()
    istKleinunternehmer = (pRow as any)?.[meta.partnerFlag] ?? null
  } else {
    partnerTyp = meta.partnerTyp as PartnerTyp
    // Supabase select('a(b)') liefert je nach Cardinality Array oder Objekt -- immer normalisieren.
    const partnerRaw = (data as any)[meta.partner as string]
    const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw
    istKleinunternehmer = partner?.[meta.partnerFlag] ?? null
  }

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

  // Step 3 — Idempotency pre-check: existiert bereits eine ORIGINAL-Gutschrift (typ='gutschrift')
  // fuer diesen Ledger? Der typ-Filter ist PFLICHT: nach einem Reversal existieren ZWEI Zeilen
  // (storniertes Original + Storno-Beleg). Ohne Filter matcht .maybeSingle() beide → liefert
  // {data:null, error:PGRST116} (postgrest-js gibt NICHT die erste Zeile zurueck) → das wuerde
  // faelschlich als "keine Gutschrift" gelesen. Mit Filter ist das Ergebnis dank partiellem
  // Unique-Index (WHERE typ='gutschrift') deterministisch <=1.
  // Deliberate hardening: ohne diesen Check wuerde ein transientes Fail auf dem finalen status-Update
  // alle Retries deadlocken (Index verhindert Re-Creation).
  const { data: existingRow } = await db
    .from('partner_gutschriften')
    .select('*')
    .eq('ledger_tabelle', tabelle)
    .eq('ledger_id', id)
    .eq('typ', 'gutschrift')
    .maybeSingle()

  // Eine bereits STORNIERTE Original-Gutschrift darf nicht wiederverwendet werden — sonst wuerde
  // die Provision mit einem gecancelten Beleg als "ausgezahlt" markiert. Re-Auszahlung klar blocken
  // (der partielle Unique-Index laesst ohnehin keine neue Original-Gutschrift fuer denselben Ledger zu).
  if (existingRow && (existingRow as Record<string, any>).status === 'storniert') {
    return {
      ok: false,
      error: 'Diese Provision wurde bereits storniert — eine erneute Auszahlung ist nicht möglich.',
    }
  }

  let row: Record<string, any> | null = existingRow ?? null
  let justCreated = false

  if (!row) {
    // Gutschrift erstellen — blockiert Auszahlung wenn Steuerdaten unvollstaendig
    const g = await erstellePartnerGutschrift(db, {
      tabelle,
      ledgerId: id,
      partnerTyp,
      partnerId,
      betraege: {
        nettoCent: Math.round(nettoEur * 100),
        ustSatz: ust.ustSatz,
        ustBetrag: ust.ustBetrag === null ? null : Math.round(ust.ustBetrag * 100),
        bruttoCent: Math.round((ust.brutto ?? 0) * 100),
      },
      leistungText: meta.leistungText,
      leistungsDatum,
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
      leistung_datum: gutschriftRow.leistung_datum ?? null,
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

  // Non-fatal: Gutschrift-Versand darf den erfolgreichen Payout nicht brechen.
  try { await versendePartnerGutschrift(db, gutschriftRow.id) } catch { /* non-fatal */ }

  return { ok: true }
}

/**
 * Liest den Ledger-Kontext (Netto + Partner + USt-Status + Leistungsdatum/-text) fuer einen
 * Ledger-Eintrag — spiegelt den Read-Teil von auszahlenProvision (Step 1). Exportiert, damit die
 * Gutschrift-Korrektur (partner-gutschrift-korrektur.ts) dieselbe Partner-/USt-Aufloesung nutzt.
 * (auszahlenProvision behaelt seinen inline-Read, um den Money-Payout-Pfad unangetastet zu lassen.)
 */
export async function resolveLedgerKontext(
  db: SupabaseClient<any>,
  tabelle: ProvisionTabelle,
  id: string,
): Promise<
  | {
      ok: true
      ctx: {
        nettoEur: number
        partnerId: string
        partnerTyp: PartnerTyp
        istKleinunternehmer: boolean | null
        leistungsDatum: string | null
        leistungText: string
      }
    }
  | { ok: false; error: string }
> {
  const meta = META[tabelle]
  const isUnion = !!meta.partnerTypCol
  const selectStr = isUnion
    ? `${meta.betrag}, ${meta.fk}, ${meta.partnerTypCol}, ${meta.leistungDatumCol}`
    : `${meta.betrag}, ${meta.fk}, ${meta.partner}(${meta.partnerFlag}), ${meta.leistungDatumCol}`
  const { data, error } = await db.from(tabelle).select(selectStr).eq('id', id).single()
  if (error) return { ok: false, error: error.message }

  const nettoEur: number = (data as any)[meta.betrag]
  const partnerId: string | null | undefined = (data as any)[meta.fk]
  if (!partnerId) return { ok: false, error: 'Partner-Zuordnung fehlt' }
  const leistungsDatum: string | null = (data as any)[meta.leistungDatumCol] ?? null

  let partnerTyp: PartnerTyp
  let istKleinunternehmer: boolean | null
  if (isUnion) {
    partnerTyp = (data as any)[meta.partnerTypCol as string] as PartnerTyp
    // firmen_flotte -> firmen (Aaron 14.07.); unbekannter Typ -> null (kein stiller Fallback).
    const partnerTable = partnerTabelleFuer(partnerTyp)
    if (!partnerTable) return { ok: false, error: `Unbekannter partner_typ '${partnerTyp}'` }
    const { data: pRow } = await db.from(partnerTable).select(meta.partnerFlag).eq('id', partnerId).maybeSingle()
    istKleinunternehmer = (pRow as any)?.[meta.partnerFlag] ?? null
  } else {
    partnerTyp = meta.partnerTyp as PartnerTyp
    const partnerRaw = (data as any)[meta.partner as string]
    const partner = Array.isArray(partnerRaw) ? partnerRaw[0] : partnerRaw
    istKleinunternehmer = partner?.[meta.partnerFlag] ?? null
  }

  return {
    ok: true,
    ctx: { nettoEur, partnerId, partnerTyp, istKleinunternehmer, leistungsDatum, leistungText: meta.leistungText },
  }
}
