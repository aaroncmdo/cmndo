// Security (Write-Path-Audit 2026-07-01, F3): bewusst KEIN 'use server'.
// Diese Funktion mutiert via admin-client (RLS-bypass) und darf NICHT als
// RPC-Endpoint exponiert werden — sonst kann jeder authenticated User sie direkt
// mit beliebiger fallId aufrufen (fremdes SV-Werbebudget zurueckbuchen, Abrechnung
// stornieren/re-issuen, storno_durch_user_id faelschen). Alle Caller sind
// server-seitig (crons, storno-actions, sv-lead-ablehn-actions, state-machine);
// die Rollen-/Ownership-Guards leben dort.
// Siehe docs/2026-07-01-claim-write-path-authorization-audit.md.
import { createAdminClient } from '@/lib/supabase/admin'
import { splitOrKeepFaelleUpdate } from '@/lib/faelle/claim-duplicate-columns'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'

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

  // CMM-49 Reader-Sweep: claims-direkt via resolveClaimId (faelle-Anker raus).
  // guthaben_verrechnet_netto/sv_nachzahlung_netto/abrechnung_id sind claims-SSoT (CMM-44 SP-J);
  // sv_id = claims.sv_id (CMM-60).
  const claimId = await resolveClaimId(db, fallId)
  if (!claimId) throw new Error('Fall nicht gefunden')
  const { data: claim } = await db.from('claims')
    .select('sv_id, guthaben_verrechnet_netto, sv_nachzahlung_netto, abrechnung_id')
    .eq('id', claimId)
    .single()

  if (!claim) throw new Error('Fall nicht gefunden')

  const guthabenVerrechnet = (claim as { guthaben_verrechnet_netto?: number | null }).guthaben_verrechnet_netto ?? null
  const svNachzahlung = (claim as { sv_nachzahlung_netto?: number | null }).sv_nachzahlung_netto ?? null
  const abrechnungId = (claim as { abrechnung_id?: string | null }).abrechnung_id ?? null

  const guthabenRueck = Number(guthabenVerrechnet ?? 0)

  // 1. Werbebudget zurückbuchen (atomar)
  if (guthabenRueck > 0 && claim.sv_id) {
    const { data: sv } = await db.from('sachverstaendige')
      .select('werbebudget_guthaben_netto')
      .eq('id', claim.sv_id)
      .single()
    const neuesGuthaben = Number(sv?.werbebudget_guthaben_netto ?? 0) + guthabenRueck
    await db.from('sachverstaendige')
      .update({ werbebudget_guthaben_netto: neuesGuthaben })
      .eq('id', claim.sv_id)
  }

  // 2. Case-Felder zurücksetzen. CMM-44 SP-J Bucket B + Phase 3: guthaben_verrechnet_netto/
  // sv_nachzahlung_netto/lead_preis_* sind alle CLAIM_OWNED -> claims.
  // CMM-49 (faelle-Drop): revFaelle war immer leer -> toter faelle-Spiegel-Write entfernt.
  const { claimsUpdate: revClaims } = splitOrKeepFaelleUpdate(
    { lead_preis_netto: 0, guthaben_verrechnet_netto: 0, sv_nachzahlung_netto: 0, lead_preis_typ: null },
    claimId,
  )
  if (claimId && Object.keys(revClaims).length > 0) {
    // Diese Funktion verspricht eine ATOMARE Rueckbuchung. Ein stiller Fehlschlag hier
    // liesse die Preisfelder stehen, waehrend Werbebudget/Abrechnung schon zurueckgebucht
    // sind — der Fall saehe abgerechnet aus, obwohl er storniert ist. supabase-js wirft
    // nicht, der Fehler steht im Rueckgabewert; werfen ist hier konsistent mit den
    // Vorbedingungs-Checks oben (Z. 37/43).
    const { error } = await db.from('claims').update(revClaims).eq('id', claimId)
    if (error) throw new Error(`Rueckbuchung der Preisfelder fehlgeschlagen: ${error.message}`)
  }

  // CMM-44 SP-H PR2: storniert_am/storno_grund/storno_durch_user_id leben jetzt
  // auf der auftraege-Sub-Tabelle. Auf den aktuellen Auftrag des Claims schreiben
  // (ORDER BY reihenfolge DESC LIMIT 1). Kein Auftrag/claim_id -> warn + skip.
  if (claimId) {
    const { data: aktAuftrag } = await db.from('auftraege')
      .select('id')
      .eq('claim_id', claimId)
      .order('reihenfolge', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (aktAuftrag) {
      await db.from('auftraege').update({
        storniert_am: new Date().toISOString(),
        storno_grund: stornoGrund,
        storno_durch_user_id: stornoDurchUserId,
      }).eq('id', aktAuftrag.id)
    } else {
      console.warn(`[CMM-44 SP-H] kein Auftrag fuer claim ${claimId} — storno-Felder skip`)
    }
  } else {
    console.warn(`[CMM-44 SP-H] fall ${fallId} ohne claim_id — storno-Felder skip`)
  }

  // 3. Abrechnungs-Side-Effect
  if (!abrechnungId) {
    // Szenario A: Kein Abrechnungs-Bezug
    return { werbebudget_rueckgebucht: guthabenRueck, abrechnung_side_effect: 'none' }
  }

  const { data: abr } = await db.from('abrechnungen')
    .select('id, status')
    .eq('id', abrechnungId)
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
    const nachzahlung = Number(svNachzahlung ?? 0)
    if (nachzahlung > 0) {
      const { FINANCE } = await import('@/lib/finance/constants')
      const mwst = Math.round(nachzahlung * (FINANCE.MWST_PROZENT / 100) * 100) / 100
      const { data: gs } = await db.from('gutschriften').insert({
        sv_id: claim.sv_id,
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
