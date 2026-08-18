import type { Reparaturbedarf } from './types'
import { deriveGewerkeAusGutachten } from './gutachten-gewerke'
import type { GutachtenZeiten } from './gutachten-gewerke'
import { klassifiziereSchadenbild } from './schadenbild-gewerke'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

export const MANUELL_CONFIDENCE = 40

/** Rein/testbar: waehlt die staerkste Evidenz (Eskalation: gutachten > schadenbild > manuell > unbekannt). */
export async function waehleBedarf(inputs: {
  gutachtenZeiten: { zeit_kar_std: unknown; zeit_lack_std: unknown; zeit_ak_std: unknown } | null
  fotoUrls: string[]
  manuell: string[] | null
}): Promise<Reparaturbedarf> {
  // 1. Gutachten (confidence 100, hoechste Evidenz)
  if (inputs.gutachtenZeiten) {
    const kategorien = deriveGewerkeAusGutachten(inputs.gutachtenZeiten as GutachtenZeiten)
    if (kategorien.length) return { kategorien, quelle: 'gutachten', confidence: 100 }
  }

  // 2. Schadenbild-KI (model confidence)
  if (inputs.fotoUrls.length) {
    const { kategorien, confidence } = await klassifiziereSchadenbild(inputs.fotoUrls)
    if (kategorien.length) return { kategorien, quelle: 'schadenbild', confidence }
  }

  // 3. Manuell (confidence 40)
  const manuell = (inputs.manuell ?? []).filter(Boolean)
  if (manuell.length) return { kategorien: manuell as never, quelle: 'manuell', confidence: MANUELL_CONFIDENCE }

  // 4. Unbekannt
  return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
}

/**
 * DB-Huelle: laedt Evidenz fuer einen Claim oder Lead, ruft waehleBedarf auf,
 * persistiert das Ergebnis (non-kritisch, nie throw) und gibt Reparaturbedarf zurueck.
 *
 * Evidenz-Quellen (in Prioritaet, gespiegelt aus vermittlung-server + gutachten-ocr):
 *   1. Gutachten-Zeiten: auftraege.gutachten_final_freigegeben=true (Gate) +
 *      v_gutachten_werte.gutachten_zeit_* (View, gekeyt per claim_id — NICHT auf claims).
 *   2. Fotos: leads.schadensfoto_urls (direkt bei leadId; bei claimId via claims.lead_id).
 *   3. Manuell: claims.schadenskategorie / leads.schadenskategorie.
 *
 * Persist: bedarf_kategorien / bedarf_quelle / bedarf_confidence / bedarf_ermittelt_am
 *   auf claims UND/ODER leads, je nach ctx.
 */
export async function ermittleReparaturbedarf(
  sb: Sb,
  ctx: { claimId?: string; leadId?: string },
): Promise<Reparaturbedarf> {
  const { claimId, leadId } = ctx

  // --- 1. Evidenz laden ---

  let gutachtenZeiten: { zeit_kar_std: unknown; zeit_lack_std: unknown; zeit_ak_std: unknown } | null = null
  let fotoUrls: string[] = []
  let schadenskategorie: string | null = null
  let resolvedLeadId: string | null = leadId ?? null

  if (claimId) {
    // 1a. Claim-Basis: lead_id (Foto-Resolver) + schadenskategorie (Manuell-Fallback).
    //     KEINE gutachten_zeit_*/schadensfoto_urls — die existieren nicht auf claims.
    try {
      const { data: claimRow } = await sb
        .from('claims')
        .select('lead_id, schadenskategorie')
        .eq('id', claimId)
        .maybeSingle()
      if (claimRow) {
        schadenskategorie = (claimRow.schadenskategorie as string | null) ?? null
        resolvedLeadId = (claimRow.lead_id as string | null) ?? null
      }
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Claim-Basis-Laden fehlgeschlagen (non-fatal):', err)
    }

    // 1b. Gutachten-Gate: nur wenn eine freigegebene auftraege-Zeile existiert, gilt
    //     die Gutachten-Quelle. Zeiten dann aus der View v_gutachten_werte (per claim_id).
    try {
      const { data: auftragRow } = await sb
        .from('auftraege')
        .select('gutachten_final_freigegeben, claim_id')
        .eq('claim_id', claimId)
        .eq('gutachten_final_freigegeben', true)
        .maybeSingle()
      if (auftragRow?.gutachten_final_freigegeben) {
        const { data: gw } = await sb
          .from('v_gutachten_werte')
          .select('gutachten_zeit_kar_std, gutachten_zeit_lack_std, gutachten_zeit_ak_std')
          .eq('claim_id', claimId)
          .maybeSingle()
        if (gw) {
          gutachtenZeiten = {
            zeit_kar_std: gw.gutachten_zeit_kar_std,
            zeit_lack_std: gw.gutachten_zeit_lack_std,
            zeit_ak_std: gw.gutachten_zeit_ak_std,
          }
        }
      }
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Gutachten-Laden fehlgeschlagen (non-fatal):', err)
    }

    // 1c. Fotos: leads.schadensfoto_urls via die resolvte claims.lead_id.
    if (resolvedLeadId) {
      try {
        const { data: leadRow } = await sb
          .from('leads')
          .select('schadensfoto_urls, schadenskategorie')
          .eq('id', resolvedLeadId)
          .maybeSingle()
        if (leadRow) {
          if (Array.isArray(leadRow.schadensfoto_urls)) {
            fotoUrls = (leadRow.schadensfoto_urls as string[]).filter(Boolean)
          }
          // Lead-schadenskategorie als Fallback, falls Claim keine hat
          if (!schadenskategorie && leadRow.schadenskategorie) {
            schadenskategorie = leadRow.schadenskategorie as string
          }
        }
      } catch (err) {
        console.warn('[ermittleReparaturbedarf] Lead-Foto-Laden fehlgeschlagen (non-fatal):', err)
      }
    }
  } else if (leadId) {
    // Lead-only Kontext: direkt aus leads lesen
    try {
      const { data: leadRow } = await sb
        .from('leads')
        .select('schadensfoto_urls, schadenskategorie')
        .eq('id', leadId)
        .maybeSingle()
      if (leadRow) {
        if (Array.isArray(leadRow.schadensfoto_urls)) {
          fotoUrls = (leadRow.schadensfoto_urls as string[]).filter(Boolean)
        }
        schadenskategorie = (leadRow.schadenskategorie as string | null) ?? null
      }
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Lead-Evidenz-Laden fehlgeschlagen (non-fatal):', err)
    }
  }

  // --- 2. Bedarf ermitteln ---
  const manuell: string[] = schadenskategorie ? [schadenskategorie] : []
  const bedarf = await waehleBedarf({ gutachtenZeiten, fotoUrls, manuell })

  // --- 3. Persistieren (non-kritisch) ---
  const now = new Date().toISOString()
  const patch = {
    bedarf_kategorien: bedarf.kategorien,
    bedarf_quelle: bedarf.quelle,
    bedarf_confidence: bedarf.confidence,
    bedarf_ermittelt_am: now,
  }

  if (claimId) {
    try {
      // Das try faengt hier nichts — supabase-js wirft nicht.
      const { error } = await sb.from('claims').update(patch).eq('id', claimId)
      if (error) console.error(`[ermittleReparaturbedarf] Claim-Persist (claim ${claimId}):`, error.message)
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Claim-Persist fehlgeschlagen (non-fatal):', err)
    }
  }
  if (resolvedLeadId ?? leadId) {
    const lid = resolvedLeadId ?? leadId
    try {
      const { error } = await sb.from('leads').update(patch).eq('id', lid)
      if (error) console.error(`[ermittleReparaturbedarf] Lead-Persist (lead ${lid}):`, error.message)
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Lead-Persist fehlgeschlagen (non-fatal):', err)
    }
  }

  return bedarf
}
