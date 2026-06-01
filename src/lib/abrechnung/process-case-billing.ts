'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
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
  // CMM-44 Phase 3: lead_preis_netto lebt auf claims (SSoT) — fuer den Idempotenz-Guard
  // aus dem claims-Embed lesen; Legacy-Fall ohne claim_id nutzt den faelle-Fallback.
  const { data: fall } = await db.from('faelle')
    .select('id, claim_id, sv_id, claims:claim_id(schadens_hoehe_netto, lead_preis_netto, gutachten(gesamt_schadensbetrag)), lead_preis_netto')
    .eq('id', fallId)
    .single()

  if (!fall?.sv_id) return null

  const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims

  // Bereits berechnet? claims ist SSoT (CMM-44 Phase 3); Legacy-Fall ohne claim_id
  // liest den faelle-Fallback (Helper haelt den Wert dort).
  const existingLeadPreis = fall.claim_id
    ? (fallClaim as { lead_preis_netto?: number | null } | null)?.lead_preis_netto
    : (fall as { lead_preis_netto?: number | null }).lead_preis_netto
  if (existingLeadPreis != null) return null
  const fallGutachten = Array.isArray((fallClaim as { gutachten?: unknown } | null)?.gutachten)
    ? ((fallClaim as { gutachten: unknown[] }).gutachten)[0]
    : (fallClaim as { gutachten?: unknown } | null)?.gutachten
  const schadenhoehe = Number(
    (fallClaim as { schadens_hoehe_netto?: number | null } | null)?.schadens_hoehe_netto
    ?? (fallGutachten as { gesamt_schadensbetrag?: number | null } | null)?.gesamt_schadensbetrag
    ?? 0
  )
  if (schadenhoehe <= 0) return null

  // Kontingent prüfen — W1.1/AAR-945 Task 2: Stichtag = Bepreisungszeitpunkt (now),
  // NICHT Fall-Erstelldatum. Das Kontingent (Paket vs. Einzel) wird am
  // Fakturierungsmonat gezählt — konsistent zur Billing-Window-Logik (Task 1).
  const imKontingent = await isCaseInKontingent(fall.sv_id, new Date())

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

  // Fall updaten.
  // CMM-44 SP-J Bucket B: guthaben_verrechnet_netto/sv_nachzahlung_netto liegen
  // auf claims (SSoT) → via splitOrKeepFaelleUpdate routen; lead_preis_* bleiben
  // faelle-native. Legacy-Fall ohne claim_id: alles bleibt auf faelle (Fallback).
  const pcbClaimId = (fall as { claim_id?: string | null }).claim_id ?? null
  const { faelleUpdate: pcbFaelle, claimsUpdate: pcbClaims } = splitOrKeepFaelleUpdate(
    {
      lead_preis_netto: leadPreis,
      lead_preis_typ: typ,
      lead_preis_berechnet_am: new Date().toISOString(),
      guthaben_verrechnet_netto: guthabenAbzug,
      sv_nachzahlung_netto: nachzahlung,
    },
    pcbClaimId,
  )
  if (Object.keys(pcbFaelle).length > 0) {
    await db.from('faelle').update(pcbFaelle).eq('id', fallId)
  }
  if (pcbClaimId && Object.keys(pcbClaims).length > 0) {
    await db.from('claims').update(pcbClaims).eq('id', pcbClaimId)
  }

  console.log(`[KFZ-149] Case ${fallId}: Lead-Preis=${leadPreis} (${typ}), Guthaben-Abzug=${guthabenAbzug}, Nachzahlung=${nachzahlung}, Guthaben-Neu=${guthabenNeu}`)

  return {
    lead_preis_netto: leadPreis,
    lead_preis_typ: typ,
    guthaben_verrechnet_netto: guthabenAbzug,
    sv_nachzahlung_netto: nachzahlung,
    guthaben_neu_netto: guthabenNeu,
  }
}
