// Makler-Wochenreport: verdichtet die Aktivitaet eines Maklers ueber ein Zeitfenster
// (Standard 7 Tage) zu einem Digest, den der Wochen-Cron per E-Mail verschickt.
//
// Attribution:
//   - Leads  → ueber promotion_codes.makler_id → promoIds → leads.promotion_code_id
//     (leads hat KEINE direkte makler_id-Spalte).
//   - Provisionen → direkt ueber makler_provisionen.makler_id (+ trigger_at als
//     Fenster-Spalte, wie in den Dashboard-Queries).
//
// Der DB-Fetch (buildMaklerWochenReport) delegiert die Skip-/Shaping-Logik an das
// pure verdichteWochenReport — das ist der getestete Seam. Versand ist DEFAULT-ON
// (Bestandspartner-Konto-Digest); Abmeldung ueber den One-Click-Link in der Mail
// setzt makler.wochenreport_abgemeldet_am (ladeWochenReportEmpfaenger filtert das).

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  berechneStaffelFortschritt,
  type StaffelStufe,
  type StaffelFortschritt,
} from '@/lib/werkstatt/staffel'

export type MaklerReportEmpfaenger = {
  id: string
  email: string
  firma: string
  vorname: string
}

/** Roh-Kennzahlen (direkt aus den Queries) — Input fuer das pure verdichteWochenReport. */
export type MaklerWochenReportRoh = {
  neueLeads: number
  neueVermittlungen: number
  neueVermittlungenSumme: number
  offeneLeads: number
  freigegebenAnzahl: number
  freigegebenSumme: number
  /** Vermittlungen mit Status freigegeben|ausgezahlt (Basis fuer die Staffel). */
  settledCount: number
  staffelStufen: StaffelStufe[]
}

/** Verdichtete Report-Daten (oder null = ueberspringen). */
export type MaklerWochenReportData = {
  neueLeads: number
  neueVermittlungen: number
  neueVermittlungenSumme: number
  offeneLeads: number
  freigegebenAnzahl: number
  freigegebenSumme: number
  settledCount: number
  /** null wenn der Makler keine Staffel-Stufen konfiguriert hat. */
  staffel: StaffelFortschritt | null
}

/**
 * Pure: Roh-Zahlen → Report-Daten ODER null (= keine Mail).
 *
 * Skip-Regel: kein Content = keine Mail. Uebersprungen wird nur der komplett
 * dormante Makler — ruhige Woche UND keine offene Pipeline UND nichts abrechenbar.
 * Ein Opt-in-Makler mit laufender Pipeline bekommt seinen Wochen-Nudge auch in
 * einer ruhigen Woche.
 */
export function verdichteWochenReport(
  roh: MaklerWochenReportRoh,
): MaklerWochenReportData | null {
  const hatContent =
    roh.neueLeads > 0 ||
    roh.neueVermittlungen > 0 ||
    roh.offeneLeads > 0 ||
    roh.freigegebenAnzahl > 0
  if (!hatContent) return null

  const staffel =
    roh.staffelStufen.length > 0
      ? berechneStaffelFortschritt(roh.settledCount, roh.staffelStufen)
      : null

  return {
    neueLeads: roh.neueLeads,
    neueVermittlungen: roh.neueVermittlungen,
    neueVermittlungenSumme: roh.neueVermittlungenSumme,
    offeneLeads: roh.offeneLeads,
    freigegebenAnzahl: roh.freigegebenAnzahl,
    freigegebenSumme: roh.freigegebenSumme,
    settledCount: roh.settledCount,
    staffel,
  }
}

type CountRes = { count: number | null }
type BetragRes = { data: Array<{ betrag_netto_eur: number | string }> | null }

function summe(rows: Array<{ betrag_netto_eur: number | string }> | null): number {
  return (rows ?? []).reduce((s, r) => s + Number(r.betrag_netto_eur ?? 0), 0)
}

/**
 * Laedt die Roh-Kennzahlen fuer EINEN Makler im Fenster [fensterStart, fensterEnde)
 * und verdichtet sie. Erwartet einen Admin-Client (Cron laeuft ohne User-Session).
 */
export async function buildMaklerWochenReport(
  db: SupabaseClient,
  makler: MaklerReportEmpfaenger,
  fensterStart: Date,
  fensterEnde: Date,
): Promise<MaklerWochenReportData | null> {
  const startIso = fensterStart.toISOString()
  const endIso = fensterEnde.toISOString()

  // Makler → Promo-Codes → Leads (leads hat keine direkte makler_id).
  const { data: promoRows } = await db
    .from('promotion_codes')
    .select('id')
    .eq('makler_id', makler.id)
  const promoIds = (promoRows ?? []).map((p) => p.id as string)
  const hatPromos = promoIds.length > 0

  const leerCount: Promise<CountRes> = Promise.resolve({ count: 0 })

  const [neueLeadsRes, offeneLeadsRes, neueProvRes, freigegebenRes, settledRes, stufenRes] =
    await Promise.all([
      hatPromos
        ? (db
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .in('promotion_code_id', promoIds)
            .gte('created_at', startIso)
            .lt('created_at', endIso) as unknown as Promise<CountRes>)
        : leerCount,
      hatPromos
        ? (db
            .from('leads')
            .select('id', { count: 'exact', head: true })
            .in('promotion_code_id', promoIds)
            // FIX (Status-Enum-Audit 05.07.): 'qualifiziert' ∉ lead_status -> 'quali-offen'.
            .in('status', ['neu', 'quali-offen']) as unknown as Promise<CountRes>)
        : leerCount,
      db
        .from('makler_provisionen')
        .select('betrag_netto_eur')
        .eq('makler_id', makler.id)
        .neq('status', 'storniert')
        .gte('trigger_at', startIso)
        .lt('trigger_at', endIso) as unknown as Promise<BetragRes>,
      db
        .from('makler_provisionen')
        .select('betrag_netto_eur')
        .eq('makler_id', makler.id)
        .eq('status', 'freigegeben') as unknown as Promise<BetragRes>,
      db
        .from('makler_provisionen')
        .select('id', { count: 'exact', head: true })
        .eq('makler_id', makler.id)
        .in('status', ['freigegeben', 'ausgezahlt']) as unknown as Promise<CountRes>,
      db
        .from('makler_staffel_stufen')
        .select('schwelle, bonus_betrag_netto')
        .eq('makler_id', makler.id) as unknown as Promise<{
        data: Array<{ schwelle: number; bonus_betrag_netto: number }> | null
      }>,
    ])

  return verdichteWochenReport({
    neueLeads: neueLeadsRes.count ?? 0,
    neueVermittlungen: (neueProvRes.data ?? []).length,
    neueVermittlungenSumme: summe(neueProvRes.data),
    offeneLeads: offeneLeadsRes.count ?? 0,
    freigegebenAnzahl: (freigegebenRes.data ?? []).length,
    freigegebenSumme: summe(freigegebenRes.data),
    settledCount: settledRes.count ?? 0,
    staffelStufen: (stufenRes.data ?? []).map((s) => ({
      schwelle: Number(s.schwelle),
      bonus_betrag_netto: Number(s.bonus_betrag_netto),
    })),
  })
}

/**
 * Laedt alle Report-Empfaenger (default-on Modell): jeder Makler mit E-Mail, der
 * sich NICHT abgemeldet hat (wochenreport_abgemeldet_am IS NULL). Abmeldung laeuft
 * ueber den One-Click-Link in der Mail (kein Opt-in-Toggle mehr — das erreichte
 * praktisch niemanden). Makler-Count ist klein → load-all + JS-Filter genuegt.
 */
export async function ladeWochenReportEmpfaenger(
  db: SupabaseClient,
): Promise<MaklerReportEmpfaenger[]> {
  const { data } = await db
    .from('makler')
    .select('id, email, firma, ansprechpartner_vorname')
    .is('wochenreport_abgemeldet_am', null)

  return (data ?? [])
    .filter((m) => typeof m.email === 'string' && m.email.length > 0)
    .map((m) => ({
      id: m.id as string,
      email: m.email as string,
      firma: (m.firma as string | null) ?? '',
      vorname: (m.ansprechpartner_vorname as string | null) ?? '',
    }))
}
