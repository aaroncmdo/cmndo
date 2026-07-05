import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbrechnungDescriptor } from '@/lib/abrechnung/create-abrechnung'
import { centToEur } from '@/lib/billing/calculate-ust'
import { FINANCE } from '@/lib/finance/constants'

/**
 * AbrechnungDescriptor fuer Kanzlei-Monatsabrechnung (KFZ-188).
 *
 * Ziel-Tabelle: kanzlei_abrechnungen (NICHT abrechnungen).
 * Positionen:   kanzlei_abrechnung_positionen (FK kanzlei_abrechnung_id).
 * Serie:        CMNDO-K-{MM}  (monatlich zurueckgesetzt, 3-stellig = pad3)
 * Format:       CMNDO-K-{jahr}-{MM}-{pad3}
 *
 * Zwei-Phasen-Status:
 *   buildHeaderRow setzt status:'offen'  (Phase 1 = Insert durch createAbrechnung).
 *   Der Caller (erstelle-abrechnung.ts) sendet PDF + Magic-Link, dann setzt er
 *   status→'versendet' direkt auf kanzlei_abrechnungen — KEIN zweiter Round-Trip
 *   durch den Descriptor noetig.
 *
 * Dedup: pruefeBestehend prueft kanzlei_id + abrechnungsmonat + abrechnungsjahr.
 * Markierung: claims.kanzlei_abrechnung_id + claims.kanzlei_provision_status='abgerechnet'.
 */
export const KANZLEI_DESCRIPTOR: AbrechnungDescriptor = {
  zielTabelle: 'kanzlei_abrechnungen',
  positionenTabelle: 'kanzlei_abrechnung_positionen',
  ustSatz: 19,

  nummer: (kontext) => {
    const jahr = kontext.jahr as number
    const monatPad = kontext.monatPad as string
    return {
      serie: `CMNDO-K-${monatPad}`,
      jahr,
      format: (j: number, lfdNr: number) =>
        `CMNDO-K-${j}-${monatPad}-${String(lfdNr).padStart(3, '0')}`,
    }
  },

  pruefeBestehend: async (
    db: SupabaseClient<any>,
    kontext: Record<string, unknown>,
  ): Promise<string | null> => {
    const kanzleiId = kontext.kanzlei_id as string
    const monat = kontext.monat as number
    const jahr = kontext.jahr as number
    const { data } = await db
      .from('kanzlei_abrechnungen')
      .select('id')
      .eq('kanzlei_id', kanzleiId)
      .eq('abrechnungsmonat', monat)
      .eq('abrechnungsjahr', jahr)
      .limit(1)
      .maybeSingle()
    return data ? (data.id as string) : null
  },

  buildHeaderRow: (b, _positionen, kontext) => ({
    kanzlei_id: kontext.kanzlei_id as string,
    abrechnungsmonat: kontext.monat as number,
    abrechnungsjahr: kontext.jahr as number,
    rechnungsnummer: b.nummer,
    anzahl_vollmachten: (kontext.anzahl_vollmachten as number | undefined) ?? _positionen.length,
    betrag_pro_vollmacht_netto: FINANCE.KANZLEI_PROVISION_NETTO,
    endbetrag_netto: centToEur(b.nettoCent),
    mwst_betrag: centToEur(b.ustCent),
    endbetrag_brutto: centToEur(b.bruttoCent),
    magic_link_token: kontext.magic_link_token as string,
    magic_link_expires_at: kontext.magic_link_expires_at as string,
    faelligkeitsdatum: kontext.faelligkeitsdatum as string,
    status: 'offen', // Zwei-Phasen: Caller flippt auf 'versendet' nach PDF+Mail
  }),

  buildPositionRow: (position, headerId, _kontext) => ({
    kanzlei_abrechnung_id: headerId,
    fall_id: position.fall_id as string,
    fall_nr: (position.fall_nr as string | null) ?? null,
    kunde_name: position.kunde_name as string,
    vollmacht_unterschrieben_am: position.vollmacht_unterschrieben_am as string,
    betrag_netto: centToEur(position.betrag_netto_cent as number),
    position_nr: position.position_nr as number,
  }),

  markiere: async (
    db: SupabaseClient<any>,
    headerId: string,
    _positionen,
    kontext: Record<string, unknown>,
  ) => {
    const claimIds = kontext.claim_ids as string[]
    if (!claimIds?.length) return { ok: true }
    const { error } = await db
      .from('claims')
      .update({ kanzlei_abrechnung_id: headerId, kanzlei_provision_status: 'abgerechnet' })
      .in('id', claimIds)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },
}
