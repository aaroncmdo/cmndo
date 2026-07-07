import type { EigeneGutschrift } from '@/components/shared/finance/PartnerGutschriftenListe'

export type EigeneGutschriftRoh = Omit<EigeneGutschrift, 'bezugNr'> & {
  bezug_gutschrift_id: string | null
}

/**
 * Loest den Storno-Bezug (Original-Nr) aus derselben Zeilenmenge auf + setzt bezugNr.
 * Pure — von der Server-Action getEigeneGutschriften genutzt (kein Client-Component-Import
 * aus dem 'use server'-File noetig). Reicht typ durch.
 */
export function mapEigeneGutschriften(rows: EigeneGutschriftRoh[]): EigeneGutschrift[] {
  const idToNr = new Map(rows.map((r) => [r.id, r.gutschrift_nr]))
  return rows.map(({ bezug_gutschrift_id, ...r }) => ({
    ...r,
    bezugNr: bezug_gutschrift_id ? idToNr.get(bezug_gutschrift_id) ?? null : null,
  }))
}
