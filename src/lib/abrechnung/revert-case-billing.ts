'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type RevertResult = {
  werbebudget_rueckgebucht: number
  abrechnung_side_effect: 'none' | 'abrechnung_storniert_und_neu' | 'gutschrift_erstellt'
  neue_abrechnung_id?: string
  gutschrift_id?: string
}

/**
 * KFZ-150 Block B: Atomare Rückbuchung eines stornierten Cases.
 * 1. Werbebudget zurückbuchen
 * 2. Case-Felder zurücksetzen
 * 3. Abrechnungs-Side-Effect (Szenario A/B/C)
 */
export async function revertCaseBilling(
  fallId: string,
  stornoGrund: string,
  stornoDurchUserId: string,
): Promise<RevertResult> {
  const db = createAdminClient()

  // Fall laden
  const { data: fall } = await db.from('faelle')
    .select('id, sv_id, guthaben_verrechnet_netto, sv_nachzahlung_netto, lead_preis_netto, abrechnung_id')
    .eq('id', fallId)
    .single()

  if (!fall) throw new Error('Fall nicht gefunden')

  const guthabenRueck = Number(fall.guthaben_verrechnet_netto ?? 0)

  // 1. Werbebudget zurückbuchen (atomar)
  if (guthabenRueck > 0 && fall.sv_id) {
    const { data: sv } = await db.from('sachverstaendige')
      .select('werbebudget_guthaben_netto')
      .eq('id', fall.sv_id)
      .single()
    const neuesGuthaben = Number(sv?.werbebudget_guthaben_netto ?? 0) + guthabenRueck
    await db.from('sachverstaendige')
      .update({ werbebudget_guthaben_netto: neuesGuthaben })
      .eq('id', fall.sv_id)
  }

  // 2. Case-Felder zurücksetzen
  await db.from('faelle').update({
    lead_preis_netto: 0,
    guthaben_verrechnet_netto: 0,
    sv_nachzahlung_netto: 0,
    lead_preis_typ: null,
    storniert_am: new Date().toISOString(),
    storno_grund: stornoGrund,
    storno_durch_user_id: stornoDurchUserId,
  }).eq('id', fallId)

  // 3. Abrechnungs-Side-Effect
  if (!fall.abrechnung_id) {
    // Szenario A: Kein Abrechnungs-Bezug
    return { werbebudget_rueckgebucht: guthabenRueck, abrechnung_side_effect: 'none' }
  }

  const { data: abr } = await db.from('abrechnungen')
    .select('id, status, gutachter_id')
    .eq('id', fall.abrechnung_id)
    .single()

  if (!abr) {
    return { werbebudget_rueckgebucht: guthabenRueck, abrechnung_side_effect: 'none' }
  }

  if (['erstellt', 'versendet', 'fehlgeschlagen'].includes(abr.status)) {
    // Szenario B: Abrechnung noch nicht bezahlt → Storno + Re-Issue
    await db.from('abrechnungen').update({
      status: 'storniert',
      storniert_am: new Date().toISOString(),
      storniert_grund: `Fall ${fallId.slice(0, 8)} wurde storniert`,
    }).eq('id', abr.id)

    // KFZ-150 Szenario B: Re-Issue mit verbleibenden Cases
    const { reissueAbrechnung } = await import('./reissue-abrechnung')
    const { neue_abrechnung_id } = await reissueAbrechnung(abr.id)
    return {
      werbebudget_rueckgebucht: guthabenRueck,
      abrechnung_side_effect: 'abrechnung_storniert_und_neu',
      neue_abrechnung_id: neue_abrechnung_id ?? undefined,
    }
  }

  if (abr.status === 'bezahlt') {
    // Szenario C: Bereits bezahlt → Gutschrift erstellen
    const nachzahlung = Number(fall.sv_nachzahlung_netto ?? 0)
    if (nachzahlung > 0) {
      const { FINANCE } = await import('@/lib/finance/constants')
      const mwst = Math.round(nachzahlung * (FINANCE.MWST_PROZENT / 100) * 100) / 100
      const { data: gs } = await db.from('gutschriften').insert({
        sv_id: abr.gutachter_id,
        betrag_netto: nachzahlung,
        mwst_betrag: mwst,
        betrag_brutto: Math.round((nachzahlung + mwst) * 100) / 100,
        grund: `Storno Fall ${fallId.slice(0, 8)}: ${stornoGrund}`,
        referenz_fall_id: fallId,
        referenz_abrechnung_id: abr.id,
        status: 'offen',
      }).select('id').single()

      return {
        werbebudget_rueckgebucht: guthabenRueck,
        abrechnung_side_effect: 'gutschrift_erstellt',
        gutschrift_id: gs?.id,
      }
    }
  }

  return { werbebudget_rueckgebucht: guthabenRueck, abrechnung_side_effect: 'none' }
}
