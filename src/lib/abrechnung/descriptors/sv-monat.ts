import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbrechnungDescriptor } from '@/lib/abrechnung/create-abrechnung'
import { centToEur } from '@/lib/billing/calculate-ust'

/**
 * AbrechnungDescriptor fuer SV-Monatsabrechnung (KFZ-149/KFZ-152).
 *
 * Zwei Sub-Pfade teilen diesen Descriptor:
 *   - Individual-SV:         kontext.empfaenger_id = sv.id,   kontext.empfaenger_typ_label = 'sv'
 *   - Org-Sammelrechnung:    kontext.empfaenger_id = org.id,  kontext.empfaenger_typ_label = 'org'
 *
 * Serie: CMNDO-{MM}  (monatlich zurueckgesetzt, 4-stellig = pad4)
 * Format: CMNDO-{jahr}-{MM}-{pad4}
 * Dedup: pruefeBestehend gibt bestehende id zurueck; Orphan-Relink liegt im Caller (Route).
 * Markierung: markiere setzt claims.abrechnung_id fuer die uebergebenen claim_ids.
 */
export const SV_MONAT_DESCRIPTOR: AbrechnungDescriptor = {
  zielTabelle: 'abrechnungen',
  positionenTabelle: 'abrechnung_positionen',
  positionsFkSpalte: 'abrechnung_id',
  ustSatz: 19,

  nummer: (kontext) => {
    const jahr = kontext.jahr as number
    const monatPad = kontext.monatPad as string
    return {
      serie: `CMNDO-${monatPad}`,
      jahr,
      format: (j: number, lfdNr: number) =>
        `CMNDO-${j}-${monatPad}-${String(lfdNr).padStart(4, '0')}`,
    }
  },

  pruefeBestehend: async (
    db: SupabaseClient<any>,
    kontext: Record<string, unknown>,
  ): Promise<string | null> => {
    const empfaengerId = kontext.empfaenger_id as string
    const jahr = kontext.jahr as number
    const monatPad = kontext.monatPad as string
    const { data } = await db
      .from('abrechnungen')
      .select('id')
      .eq('empfaenger_typ', 'sv')
      .eq('empfaenger_id', empfaengerId)
      .like('abrechnungs_nr', `CMNDO-${jahr}-${monatPad}-%`)
      .neq('status', 'storniert')
      .limit(1)
      .maybeSingle()
    // NOTE: Orphan-Relink (claims.abrechnung_id) ist NICHT hier —
    // createAbrechnung liefert { erstellt:false, bestehendeId } und der Caller
    // (cron route) macht das update. KEIN Relink-Side-Effect im Descriptor.
    return data ? data.id : null
  },

  buildHeaderRow: (b, positionen, kontext) => ({
    empfaenger_typ: 'sv',
    empfaenger_id: kontext.empfaenger_id as string,
    empfaenger_email: kontext.empfaenger_email as string,
    empfaenger_name: kontext.empfaenger_name as string,
    abrechnungs_nr: b.nummer,
    abrechnungs_zeitraum_start: kontext.abrechnungs_zeitraum_start as string,
    abrechnungs_zeitraum_ende: kontext.abrechnungs_zeitraum_ende as string,
    // JSONB: eingebettete Positionen (existierendes Verhalten beibehalten)
    positionen: positionen.map((p, i) => ({
      position_nr: (p.position_nr as number | undefined) ?? i + 1,
      fall_id: p.fall_id as string,
      fall_datum: p.fall_datum as string,
      kennzeichen: (p.kennzeichen as string | null) ?? null,
      schadenhoehe_netto: p.schadenhoehe_netto as number,
      lead_preis_netto: p.lead_preis_netto as number,
      lead_preis_typ: p.lead_preis_typ as string,
      guthaben_verrechnet_netto: p.guthaben_verrechnet_netto as number,
      sv_nachzahlung_netto: p.sv_nachzahlung_netto as number,
      // Sammelrechnungs-spezifisch (undefined fuer Individual)
      ...(p.sub_sv_id !== undefined && { sub_sv_id: p.sub_sv_id as string }),
      ...(p.sub_sv_name !== undefined && { sub_sv_name: p.sub_sv_name as string | null }),
    })),
    summe_netto: centToEur(b.nettoCent),
    ust_satz: 19.0,
    ust_betrag: centToEur(b.ustCent),
    summe_brutto: centToEur(b.bruttoCent),
    faellig_am: kontext.faellig_am as string,
    status: 'versendet',
    versand_datum: kontext.versand_datum as string,
    notiz: kontext.notiz as string,
  }),

  buildPositionRow: (position, headerId, _kontext) => ({
    abrechnung_id: headerId,
    fall_id: position.fall_id as string,
    fall_datum: position.fall_datum as string,
    kennzeichen: (position.kennzeichen as string | null) ?? null,
    schadenhoehe_netto: position.schadenhoehe_netto as number,
    lead_preis_netto: position.lead_preis_netto as number,
    lead_preis_typ: position.lead_preis_typ as string,
    guthaben_verrechnet_netto: position.guthaben_verrechnet_netto as number,
    sv_nachzahlung_netto: position.sv_nachzahlung_netto as number,
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
      .update({ abrechnung_id: headerId })
      .in('id', claimIds)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  },
}
