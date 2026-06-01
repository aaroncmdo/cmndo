'use server'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * KFZ-149 Block C: Lead-Preis aus DB-Tabelle berechnen.
 * Nächsthöhere oder exakte Stufe, Cap bei Maximum.
 */
export async function getLeadPriceFromTable(
  schadenhoehe_netto: number,
  ist_im_kontingent: boolean,
): Promise<{ betrag_netto: number; typ: 'paket' | 'einzel'; matched_grenze: number }> {
  const db = createAdminClient()
  const { data: tabelle } = await db.from('leadpreise_tabelle')
    .select('schadenhoehe_bis_netto, paketpreis_netto, einzelpreis_netto')
    .eq('aktiv', true)
    .order('schadenhoehe_bis_netto', { ascending: true })

  if (!tabelle?.length) {
    return { betrag_netto: 200, typ: ist_im_kontingent ? 'paket' : 'einzel', matched_grenze: 0 }
  }

  // Finde nächsthöheren oder exakten Eintrag
  const match = tabelle.find(t => Number(t.schadenhoehe_bis_netto) >= schadenhoehe_netto)
  const entry = match ?? tabelle[tabelle.length - 1] // Cap bei Maximum

  const betrag = ist_im_kontingent
    ? Number(entry.paketpreis_netto)
    : Number(entry.einzelpreis_netto)

  return {
    betrag_netto: betrag,
    typ: ist_im_kontingent ? 'paket' : 'einzel',
    matched_grenze: Number(entry.schadenhoehe_bis_netto),
  }
}

/**
 * KFZ-149 / W1.1-AAR-945 Task 2: Prüft ob ein Fall noch im Kontingent des SVs liegt.
 *
 * Stichtag = Bepreisungszeitpunkt (i.d.R. now()), NICHT das Fall-Erstelldatum.
 * Das Kontingent (Paket- vs. Einzelpreis) wird am FAKTURIERUNGS-Monat gezählt
 * (claims.lead_preis_berechnet_am) — konsistent zur Billing-Window-Logik
 * (cron/abrechnung-erstellen fakturiert über abrechnung_id statt created_at).
 */
export async function isCaseInKontingent(
  gutachterId: string,
  stichtag: Date,
): Promise<boolean> {
  const db = createAdminClient()

  const { data: sv } = await db.from('sachverstaendige')
    .select('paket_faelle_gesamt')
    .eq('id', gutachterId)
    .single()

  const kontingent = sv?.paket_faelle_gesamt ?? 10

  // Zähle die in DIESEM Monat bereits bepreisten Fälle des SVs (vor dem Stichtag).
  // claims.sv_id + claims.lead_preis_berechnet_am sind SSoT (CMM-60 / CMM-44 Phase 3).
  const monthStart = new Date(stichtag.getFullYear(), stichtag.getMonth(), 1)
  const { count } = await db.from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('sv_id', gutachterId)
    .gte('lead_preis_berechnet_am', monthStart.toISOString())
    .lt('lead_preis_berechnet_am', stichtag.toISOString())

  return (count ?? 0) < kontingent
}
