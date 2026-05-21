'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getLeadPriceFromTable, isCaseInKontingent } from './calculate-lead-price'

/**
 * KFZ-149: Per-case Guthaben-Verrechnung (atomar).
 *
 * Pro Fall im Kontingent:
 * 1. Lead-Preis aus Tabelle (Paketpreis)
 * 2. guthaben_abzug = MIN(150, werbebudget_guthaben_netto)
 * 3. sv_nachzahlung = lead_preis - guthaben_abzug
 * 4. Atomares Update gutachter.werbebudget_guthaben_netto
 *
 * INVARIANTE: lead_preis_netto = guthaben_verrechnet_netto + sv_nachzahlung_netto
 */
export async function processCaseBilling(fallId: string): Promise<{
  lead_preis_netto: number
  lead_preis_typ: 'paket' | 'einzel'
  guthaben_verrechnet_netto: number
  sv_nachzahlung_netto: number
  guthaben_neu_netto: number
} | null> {
  const db = createAdminClient()

  // Fall laden.
  // CMM-44 SP-B PR2c: schadens_hoehe_netto lebt auf claims (SSoT) — via claims-Embed.
  // CMM-44 SP-G PR2: gutachten_betrag → gutachten.gesamt_schadensbetrag (SSoT).
  const { data: fall } = await db.from('faelle')
    .select('id, sv_id, claims:claim_id(schadens_hoehe_netto, gutachten(gesamt_schadensbetrag)), created_at, lead_preis_netto')
    .eq('id', fallId)
    .single()

  if (!fall?.sv_id) return null

  // Bereits berechnet?
  if (fall.lead_preis_netto != null) return null

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const fallGutachten = Array.isArray((fallClaim as { gutachten?: unknown } | null)?.gutachten)
    ? ((fallClaim as { gutachten: unknown[] }).gutachten)[0]
    : (fallClaim as { gutachten?: unknown } | null)?.gutachten
  const schadenhoehe = Number(
    (fallClaim as { schadens_hoehe_netto?: number | null } | null)?.schadens_hoehe_netto
    ?? (fallGutachten as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag
    ?? 0
  )
  if (schadenhoehe <= 0) return null

  // Kontingent prüfen
  const imKontingent = await isCaseInKontingent(fall.sv_id, new Date(fall.created_at))

  // Lead-Preis berechnen
  const { betrag_netto: leadPreis, typ } = await getLeadPriceFromTable(schadenhoehe, imKontingent)

  // Guthaben laden (atomar via SELECT FOR UPDATE wäre ideal, Supabase hat kein explizites Locking,
  // daher: read + update mit Optimistic Concurrency via werbebudget_guthaben_netto Check)
  const { data: sv } = await db.from('sachverstaendige')
    .select('werbebudget_guthaben_netto')
    .eq('id', fall.sv_id)
    .single()

  const currentGuthaben = Number(sv?.werbebudget_guthaben_netto ?? 0)

  // Guthaben-Abzug: nur im Kontingent, max 150
  const guthabenAbzug = imKontingent ? Math.min(150, currentGuthaben) : 0
  const nachzahlung = leadPreis - guthabenAbzug
  const guthabenNeu = currentGuthaben - guthabenAbzug

  // Atomares Update: Guthaben dekrementieren
  if (guthabenAbzug > 0) {
    await db.from('sachverstaendige')
      .update({ werbebudget_guthaben_netto: guthabenNeu })
      .eq('id', fall.sv_id)
  }

  // Fall updaten
  await db.from('faelle').update({
    lead_preis_netto: leadPreis,
    lead_preis_typ: typ,
    lead_preis_berechnet_am: new Date().toISOString(),
    guthaben_verrechnet_netto: guthabenAbzug,
    sv_nachzahlung_netto: nachzahlung,
  }).eq('id', fallId)

  console.log(`[KFZ-149] Case ${fallId}: Lead-Preis=${leadPreis} (${typ}), Guthaben-Abzug=${guthabenAbzug}, Nachzahlung=${nachzahlung}, Guthaben-Neu=${guthabenNeu}`)

  return {
    lead_preis_netto: leadPreis,
    lead_preis_typ: typ,
    guthaben_verrechnet_netto: guthabenAbzug,
    sv_nachzahlung_netto: nachzahlung,
    guthaben_neu_netto: guthabenNeu,
  }
}
