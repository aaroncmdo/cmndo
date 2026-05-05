// CMM-32: Erstellt einen Erstgutachten-Auftrag beim Lead → Fall-Upgrade.
// Wird in flow/[token]/actions.ts aufgerufen, sobald die Termine fall_id
// bekommen haben. Idempotent — falls schon einer existiert, return ohne
// Insert.
//
// CMM Phase 1.5d: Side-Quest-Helper (Nachbesichtigung, Stellungnahme)
// für den Auftrag-Lifecycle nach QC-Freigabe. Hart durch DB-Trigger
// auftraege_validate_typ_requires_kanzleifall geschützt — Side-Quests
// dürfen nur entstehen wenn ein Kanzleifall existiert.

import type { SupabaseClient } from '@supabase/supabase-js'

export type SideQuestTyp = 'nachbesichtigung' | 'stellungnahme'

export async function createErstgutachtenAuftragWennNoetig(
  admin: SupabaseClient,
  fallId: string,
  svId: string,
  terminIds: string[],
): Promise<{ auftragId: string | null; error?: string }> {
  // Existiert schon?
  const { data: existing } = await admin
    .from('auftraege')
    .select('id')
    .eq('fall_id', fallId)
    .eq('typ', 'erstgutachten')
    .maybeSingle()

  if (existing) {
    // Termine die noch keine auftrag_id haben dranhängen
    if (terminIds.length) {
      await admin
        .from('gutachter_termine')
        .update({ auftrag_id: existing.id })
        .in('id', terminIds)
        .is('auftrag_id', null)
    }
    return { auftragId: existing.id as string }
  }

  const { data: inserted, error } = await admin
    .from('auftraege')
    .insert({
      fall_id: fallId,
      sv_id: svId,
      typ: 'erstgutachten',
      status: 'termin',
      reihenfolge: 1,
    })
    .select('id')
    .single()

  if (error || !inserted) {
    console.error('[CMM-32] createErstgutachtenAuftrag:', error?.message)
    return { auftragId: null, error: error?.message }
  }

  if (terminIds.length) {
    await admin
      .from('gutachter_termine')
      .update({ auftrag_id: inserted.id })
      .in('id', terminIds)
  }

  return { auftragId: inserted.id as string }
}

// ─── Side-Quest-Helper ──────────────────────────────────────────────────
//
// Nachbesichtigung und Stellungnahme entstehen NACH der QC-Freigabe des
// Erstgutachtens — also wenn ein Kanzleifall existiert. Caller liefern
// nur die claim_id, der Helper resolvt fall_id, sv_id (= SV des
// Erstgutachtens als sinnvoller Default), reihenfolge und legt den
// Auftrag mit status='termin' an.
//
// DB-Trigger trg_auftraege_validate_typ_requires_kanzleifall (Phase 1.5c)
// blockt Inserts ohne kanzlei_faelle mit ERRCODE=check_violation — der
// Helper fängt das ab und liefert eine freundliche Fehlermeldung.

export async function createSideQuestAuftrag(
  admin: SupabaseClient,
  claimId: string,
  typ: SideQuestTyp,
  options?: { svId?: string },
): Promise<{ ok: boolean; auftragId?: string; error?: string }> {
  // Existiert bereits ein offener Side-Quest gleichen Typs für diesen Claim?
  // Wir wollen nicht versehentlich zwei parallele Nachbesichtigungen anlegen.
  const { data: offen } = await admin
    .from('auftraege')
    .select('id')
    .eq('claim_id', claimId)
    .eq('typ', typ)
    .neq('status', 'abgeschlossen')
    .maybeSingle()
  if (offen) {
    return { ok: false, error: `Es läuft bereits ein offener ${typ === 'nachbesichtigung' ? 'Nachbesichtigungs' : 'Stellungnahme'}-Auftrag.` }
  }

  // fall_id + Default-SV (vom letzten abgeschlossenen Auftrag) ermitteln,
  // plus reihenfolge = max + 1.
  const { data: vorgaenger } = await admin
    .from('auftraege')
    .select('id, fall_id, sv_id, reihenfolge')
    .eq('claim_id', claimId)
    .order('reihenfolge', { ascending: false })
    .limit(1)
  const v = vorgaenger?.[0]
  if (!v) {
    return { ok: false, error: 'Kein Vorgänger-Auftrag — Side-Quest braucht ein Erstgutachten als Basis.' }
  }
  const fallId = v.fall_id as string
  const svId = options?.svId ?? (v.sv_id as string)
  const reihenfolge = (v.reihenfolge as number) + 1

  const { data: inserted, error } = await admin
    .from('auftraege')
    .insert({
      fall_id: fallId,
      claim_id: claimId,
      sv_id: svId,
      typ,
      status: 'termin',
      reihenfolge,
      vorheriger_auftrag_id: v.id as string,
    })
    .select('id')
    .single()

  if (error) {
    // Phase-1.5c-Trigger meldet check_violation wenn kein Kanzleifall.
    if (error.code === '23514') {
      return { ok: false, error: 'Side-Quest nur möglich wenn der Kanzleifall existiert (QC-Freigabe Voraussetzung).' }
    }
    console.error('[createSideQuestAuftrag]', error.message)
    return { ok: false, error: error.message }
  }
  return { ok: true, auftragId: inserted.id as string }
}
