import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbrechnungDescriptor } from '@/lib/abrechnung/create-abrechnung'
import { centToEur } from '@/lib/billing/calculate-ust'

/**
 * AbrechnungDescriptor fuer Monika-Embed SV-Vermittlungsentgelt (AAR-939).
 * Serie: CMNDO-EMB-{MM}, format: CMNDO-EMB-{YYYY}-{MM}-{NNN}
 * Dedup: prueft existierende nicht-stornierte Rechnung fuer denselben SV + Monat.
 * Positionen-Tabelle: embed_abrechnung_positionen.
 * Markierung: gutachter_finder_anfragen (abrechnung_id, abgerechnet_am, abrechnung_sv_id).
 */
export const EMBED_DESCRIPTOR: AbrechnungDescriptor = {
  zielTabelle: 'abrechnungen',
  positionenTabelle: 'embed_abrechnung_positionen',
  ustSatz: 19,

  nummer: (kontext) => {
    const jahr = kontext.jahr as number
    const monatPad = kontext.monatPad as string
    return {
      serie: `CMNDO-EMB-${monatPad}`,
      jahr,
      format: (j: number, lfdNr: number) =>
        `CMNDO-EMB-${j}-${monatPad}-${String(lfdNr).padStart(3, '0')}`,
    }
  },

  pruefeBestehend: async (
    db: SupabaseClient<any>,
    kontext: Record<string, unknown>,
  ): Promise<string | null> => {
    const svId = kontext.sv_id as string
    const svDbId = kontext.sv_db_id as string
    const jahr = kontext.jahr as number
    const monatPad = kontext.monatPad as string
    const { data } = await db
      .from('abrechnungen')
      .select('id')
      .eq('empfaenger_typ', 'sv')
      .eq('empfaenger_id', svDbId)
      .like('abrechnungs_nr', `CMNDO-EMB-${jahr}-${monatPad}-%`)
      .neq('status', 'storniert')
      .limit(1)
      .maybeSingle()
    if (data) {
      // Nachverknuepfen der orphan-Anfragen an die bestehende Rechnung (crash-recovery).
      const anfrageIds = kontext.anfrage_ids as string[]
      await db
        .from('gutachter_finder_anfragen')
        .update({
          abrechnung_id: data.id,
          abgerechnet_am: new Date().toISOString(),
          abrechnung_sv_id: svId,
        })
        .in('id', anfrageIds)
      return data.id
    }
    return null
  },

  buildHeaderRow: (b, positionen, kontext) => ({
    empfaenger_typ: 'sv',
    empfaenger_id: kontext.sv_db_id as string,
    empfaenger_email: kontext.empfaenger_email as string,
    empfaenger_name: kontext.empfaenger_name as string,
    abrechnungs_nr: b.nummer,
    abrechnungs_zeitraum_start: kontext.abrechnungs_zeitraum_start as string,
    abrechnungs_zeitraum_ende: kontext.abrechnungs_zeitraum_ende as string,
    positionen: positionen.map((p) => ({
      position_nr: p.position_nr as number,
      anfrage_id: p.anfrage_id as string,
      termin_id: (p.termin_id as string | null) ?? null,
      embed_site_id: p.embed_site_id as string | null,
      site_name: (p.site_name as string | null) ?? null,
      datum: (p.datum as string | null) ?? null,
      kunde_name: p.kunde_name as string,
      schadentyp: (p.schadentyp as string | null) ?? null,
      einzelpreis_netto: centToEur(p.betrag_netto_cent as number),
    })),
    summe_netto: centToEur(b.nettoCent),
    ust_satz: 19.0,
    ust_betrag: centToEur(b.ustCent),
    summe_brutto: centToEur(b.bruttoCent),
    faellig_am: kontext.faellig_am as string,
    status: 'versendet',
    versand_datum: kontext.versand_datum as string,
    notiz: `Monika-Embed Vermittlungsentgelt: ${positionen.length} faellige Termine (Variante B, auto-faellig nach Terminzeit).`,
  }),

  buildPositionRow: (position, headerId, _kontext) => ({
    abrechnung_id: headerId,
    embed_site_id: position.embed_site_id as string | null,
    anfrage_id: position.anfrage_id as string,
    termin_id: (position.termin_id as string | null) ?? null,
    einzelpreis_eur: centToEur(position.betrag_netto_cent as number),
    leistung_text: `Monika-Vermittlung: ${position.kunde_name as string}${position.schadentyp ? ` (${position.schadentyp as string})` : ''}`,
  }),

  markiere: async (
    db: SupabaseClient<any>,
    headerId: string,
    positionen,
    kontext: Record<string, unknown>,
  ) => {
    const svId = kontext.sv_id as string
    const anfrageIds = positionen.map((p) => p.anfrage_id as string)
    const { error } = await db
      .from('gutachter_finder_anfragen')
      .update({
        abrechnung_id: headerId,
        abgerechnet_am: new Date().toISOString(),
        abrechnung_sv_id: svId,
      })
      .in('id', anfrageIds)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },
}
