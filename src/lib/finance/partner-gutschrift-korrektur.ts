import type { SupabaseClient } from '@supabase/supabase-js'
import { computeProvisionUst } from './partner-billing-ust'
import {
  erstelleStornoGutschrift,
  erstellePartnerGutschrift,
  versendePartnerGutschrift,
} from './partner-gutschrift'
import { generateAndUploadPartnerGutschriftPdf } from './partner-gutschrift-pdf'
import { resolveLedgerKontext, type ProvisionTabelle } from './provision-status'

export type KorrekturBetraege = {
  nettoCent: number
  ustSatz: number | null
  ustBetragCent: number | null
  bruttoCent: number
}

/**
 * Bestimmt die Ziel-Beträge einer Gutschrift-Korrektur.
 *
 * Default = Recompute aus aktuellem Ledger-Netto + Partner-USt-Status (computeProvisionUst).
 * Override (Admin) auf `nettoCent` und/oder `ustSatz`; `ustBetrag` + `brutto` werden IMMER
 * daraus abgeleitet, damit `brutto = netto + ust_betrag` konsistent bleibt (kein inkonsistenter
 * §14c-Beleg). Alles in Cent (Integer) gerechnet.
 */
export function computeKorrekturBetraege(input: {
  currentNettoEur: number
  istKleinunternehmer: boolean | null
  override?: { nettoCent?: number; ustSatz?: number }
}): { ok: true; betraege: KorrekturBetraege } | { ok: false; error: string } {
  const def = computeProvisionUst(input.currentNettoEur, input.istKleinunternehmer)

  const nettoCent = input.override?.nettoCent ?? Math.round(input.currentNettoEur * 100)
  if (!Number.isFinite(nettoCent) || nettoCent < 0) {
    return { ok: false, error: 'Ungültiger Netto-Betrag' }
  }

  const ustSatz = input.override?.ustSatz ?? def.ustSatz
  if (ustSatz === null || ustSatz === undefined) {
    return {
      ok: false,
      error: 'USt-Status des Partners unbekannt — Steuerdaten erfassen oder USt-Satz manuell setzen.',
    }
  }

  const ustBetragCent = Math.round((nettoCent * ustSatz) / 100)
  const bruttoCent = nettoCent + ustBetragCent
  return { ok: true, betraege: { nettoCent, ustSatz, ustBetragCent, bruttoCent } }
}

/**
 * Prüft die §14c-Vollständigkeit der Partner-Steuerdaten VOR dem Storno (fail-fast ohne Write,
 * damit eine doomed Korrektur keine Storno-Nummer verbrennt). Spiegelt das Completeness-Gate in
 * erstellePartnerGutschrift.
 */
async function pruefePartnerSteuerdaten(
  db: SupabaseClient<any>,
  partnerTyp: 'makler' | 'werkstatt' | 'marketing',
  partnerId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const table =
    partnerTyp === 'makler' ? 'makler' : partnerTyp === 'werkstatt' ? 'werkstaetten' : 'marketing_partner'
  const { data: partner, error } = await db.from(table).select('*').eq('id', partnerId).single()
  if (error || !partner) return { ok: false, error: 'Partner nicht gefunden' }
  const p = partner as Record<string, any>
  const adresseVollstaendig = !!(p.adresse_strasse?.trim() && p.adresse_plz?.trim() && p.adresse_ort?.trim())
  const ustDatenOk = p.ist_kleinunternehmer === true || !!p.ust_id?.trim()
  if (!adresseVollstaendig || !ustDatenOk) {
    return { ok: false, error: 'Empfänger-Steuerdaten unvollständig — Gutschrift nicht korrigierbar' }
  }
  return { ok: true }
}

/** Generiert PDF + Versand fuer eine Gutschrift-Zeile (non-fatal, spiegelt provision-status.ts). */
async function pdfUndVersand(
  db: SupabaseClient<any>,
  gutschriftId: string,
  stornoBezug?: { bezugNummer: string; bezugDatum: string; grund: string },
): Promise<void> {
  const { data: rowD } = await db.from('partner_gutschriften').select('*').eq('id', gutschriftId).maybeSingle()
  if (!rowD) return
  const r = rowD as Record<string, any>
  const pdf = await generateAndUploadPartnerGutschriftPdf({
    gutschrift_nr: r.gutschrift_nr,
    erstellt_am: r.erstellt_am,
    leistung_datum: r.leistung_datum ?? null,
    leistung_text: r.leistung_text,
    betrag_netto: r.betrag_netto,
    ust_satz: r.ust_satz,
    ust_betrag: r.ust_betrag,
    betrag_brutto: r.betrag_brutto,
    empfaenger_snapshot: r.empfaenger_snapshot,
    aussteller_snapshot: r.aussteller_snapshot,
    ...(stornoBezug ? { storno: stornoBezug } : {}),
  })
  if (pdf.ok) {
    await db.from('partner_gutschriften').update({ pdf_storage_path: pdf.pdfPath }).eq('id', gutschriftId)
    await versendePartnerGutschrift(db, gutschriftId)
  }
}

/**
 * Korrigiert eine ausgestellte Partner-Gutschrift: Storno der aktiven Original + korrigierte
 * Neuausstellung (recompute-reissue). Reihenfolge sicherheitskritisch — Storno VOR Reissue (der
 * relaxte Unique-Index laesst nur 1 aktive Original je Ledger), Pre-Validierung VOR Storno,
 * Kompensations-Revert falls der Reissue doch fehlschlaegt (Ledger behaelt dann wieder genau eine
 * gueltige Gutschrift). PDF/Versand fuer beide Belege non-fatal.
 */
export async function korrigierePartnerGutschrift(
  db: SupabaseClient<any>,
  ledgerTabelle: string,
  ledgerId: string,
  grund: string,
  override?: { nettoCent?: number; ustSatz?: number },
): Promise<{ ok: true; stornoNummer: string; korrekturNummer: string } | { ok: false; error: string }> {
  try {
    // 1. Aktive Original finden (typ='gutschrift', nicht storniert) — dank relaxtem Index <=1.
    const { data: orig } = await db
      .from('partner_gutschriften')
      .select('*')
      .eq('ledger_tabelle', ledgerTabelle)
      .eq('ledger_id', ledgerId)
      .eq('typ', 'gutschrift')
      .neq('status', 'storniert')
      .maybeSingle()
    if (!orig) return { ok: false, error: 'Keine aktive Gutschrift zum Korrigieren gefunden' }
    const origRow = orig as Record<string, any>
    const origStatus: string = origRow.status

    // 2. Ledger-Kontext (Netto + Partner + USt-Status + Leistungsdatum/-text).
    const kt = await resolveLedgerKontext(db, ledgerTabelle as ProvisionTabelle, ledgerId)
    if (!kt.ok) return { ok: false, error: kt.error }
    const { nettoEur, partnerId, partnerTyp, istKleinunternehmer, leistungsDatum, leistungText } = kt.ctx

    // 3. Ziel-Beträge (Recompute + Override, abgeleitet).
    const bet = computeKorrekturBetraege({ currentNettoEur: nettoEur, istKleinunternehmer, override })
    if (!bet.ok) return { ok: false, error: bet.error }

    // 4. Pre-Validate §14c-Steuerdaten VOR jedem Write.
    const val = await pruefePartnerSteuerdaten(db, partnerTyp, partnerId)
    if (!val.ok) return { ok: false, error: val.error }

    // 5. Storno der aktiven Original.
    const storno = await erstelleStornoGutschrift(db, origRow.id, grund)
    if (!storno.ok) return { ok: false, error: storno.error }

    // 6. Korrigierte Neuausstellung.
    const reissue = await erstellePartnerGutschrift(db, {
      tabelle: ledgerTabelle,
      ledgerId,
      partnerTyp,
      partnerId,
      betraege: {
        nettoCent: bet.betraege.nettoCent,
        ustSatz: bet.betraege.ustSatz,
        ustBetrag: bet.betraege.ustBetragCent,
        bruttoCent: bet.betraege.bruttoCent,
      },
      leistungText,
      leistungsDatum,
    })
    if (!reissue.ok) {
      // Kompensations-Revert: Storno rueckgaengig (Zeile loeschen + Original-Status restaurieren),
      // damit der Ledger wieder genau eine gueltige Gutschrift hat und keine Storno-Nummer verbrennt.
      await db.from('partner_gutschriften').delete().eq('id', storno.stornoId)
      await db.from('partner_gutschriften').update({ status: origStatus }).eq('id', origRow.id)
      console.error('[korrektur-gutschrift] Reissue fehlgeschlagen, Storno revertiert:', reissue.error)
      return { ok: false, error: 'Korrektur fehlgeschlagen: ' + reissue.error }
    }

    // 7. PDFs + Versand (non-fatal).
    try {
      const bezugDatum = new Date(origRow.erstellt_am).toLocaleDateString('de-DE', {
        timeZone: 'Europe/Berlin',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
      await pdfUndVersand(db, storno.stornoId, {
        bezugNummer: origRow.gutschrift_nr,
        bezugDatum,
        grund,
      })
      await pdfUndVersand(db, reissue.gutschriftId)
    } catch (err) {
      console.error('[korrektur-gutschrift] PDF/Versand non-fatal:', err instanceof Error ? err.message : err)
    }

    return { ok: true, stornoNummer: storno.nummer, korrekturNummer: reissue.nummer }
  } catch (err) {
    return { ok: false, error: (err as Error).message ?? 'Unbekannter Fehler' }
  }
}
