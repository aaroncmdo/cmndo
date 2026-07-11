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
 *   1. Gutachten-Zeiten: auftraege.gutachten_final_freigegeben=true + claims.gutachten_zeit_*
 *   2. Fotos: leads.schadensfoto_urls (direkt bei leadId; bei claimId via claims.lead_id)
 *   3. Manuell: claims.schadenskategorie / leads.schadenskategorie
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
    // 1a. Gutachten: pruefen ob auftraege-Row mit gutachten_final_freigegeben=true existiert
    try {
      const { data: auftragRow } = await sb
        .from('auftraege')
        .select('gutachten_final_freigegeben, claim_id')
        .eq('claim_id', claimId)
        .eq('gutachten_final_freigegeben', true)
        .maybeSingle()
      if (auftragRow?.gutachten_final_freigegeben) {
        // Lade Gutachten-Zeiten aus dem Claim
        const { data: claimRow } = await sb
          .from('claims')
          .select('gutachten_zeit_kar_std, gutachten_zeit_lack_std, gutachten_zeit_ak_std, schadenskategorie, lead_id, schadensfoto_urls')
          .eq('id', claimId)
          .maybeSingle()
        if (claimRow) {
          gutachtenZeiten = {
            zeit_kar_std: claimRow.gutachten_zeit_kar_std,
            zeit_lack_std: claimRow.gutachten_zeit_lack_std,
            zeit_ak_std: claimRow.gutachten_zeit_ak_std,
          }
          schadenskategorie = (claimRow.schadenskategorie as string | null) ?? null
          resolvedLeadId = (claimRow.lead_id as string | null) ?? null
          // Falls Claim direkt schadensfoto_urls hat (zukuenftig): direkt nehmen
          if (Array.isArray(claimRow.schadensfoto_urls)) {
            fotoUrls = (claimRow.schadensfoto_urls as string[]).filter(Boolean)
          }
        }
      } else {
        // Kein Gutachten: nur schadenskategorie + lead_id fuer Fotos laden
        const { data: claimRow } = await sb
          .from('claims')
          .select('schadenskategorie, lead_id, schadensfoto_urls')
          .eq('id', claimId)
          .maybeSingle()
        if (claimRow) {
          schadenskategorie = (claimRow.schadenskategorie as string | null) ?? null
          resolvedLeadId = (claimRow.lead_id as string | null) ?? null
          if (Array.isArray(claimRow.schadensfoto_urls)) {
            fotoUrls = (claimRow.schadensfoto_urls as string[]).filter(Boolean)
          }
        }
      }
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Claim-Evidenz-Laden fehlgeschlagen (non-fatal):', err)
    }

    // 1b. Fotos: falls noch keine direkt am Claim, via leads.schadensfoto_urls
    if (fotoUrls.length === 0 && resolvedLeadId) {
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
      await sb.from('claims').update(patch).eq('id', claimId)
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Claim-Persist fehlgeschlagen (non-fatal):', err)
    }
  }
  if (resolvedLeadId ?? leadId) {
    const lid = resolvedLeadId ?? leadId
    try {
      await sb.from('leads').update(patch).eq('id', lid)
    } catch (err) {
      console.warn('[ermittleReparaturbedarf] Lead-Persist fehlgeschlagen (non-fatal):', err)
    }
  }

  return bedarf
}
