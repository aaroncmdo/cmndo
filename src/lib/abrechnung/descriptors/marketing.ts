import type { SupabaseClient } from '@supabase/supabase-js'
import type { AbrechnungDescriptor } from '@/lib/abrechnung/create-abrechnung'
import { centToEur } from '@/lib/billing/calculate-ust'

/**
 * AbrechnungDescriptor fuer Marketing/Maik-Monatsabrechnung (AAR-948).
 *
 * Ziel-Tabelle: abrechnungen (empfaenger_typ 'marketing').
 * Positionen:   KEIN separater positionenTable — JSONB in abrechnungen.positionen.
 * Serie:        CL-MARKETING-{MM}  (monatlich zurueckgesetzt, 3-stellig = pad3)
 * Format:       CL-{YYYY-MM}-MARKETING-{pad3}
 * Dedup:        pruefeBestehend prueft empfaenger_typ + zeitraum + neq storniert.
 * Markierung:   keine (status bleibt 'entwurf'; Caller-Route triggert PDF+Email).
 */
export const MARKETING_DESCRIPTOR: AbrechnungDescriptor = {
  zielTabelle: 'abrechnungen',
  positionenTabelle: null,
  ustSatz: 19,

  nummer: (kontext) => {
    const monat = kontext.monat as string // YYYY-MM
    const [jahrStr, monatStr] = monat.split('-')
    const jahr = parseInt(jahrStr, 10)
    return {
      serie: `CL-MARKETING-${monatStr}`,
      jahr,
      format: (_j: number, lfdNr: number) =>
        `CL-${monat}-MARKETING-${String(lfdNr).padStart(3, '0')}`,
    }
  },

  pruefeBestehend: async (
    db: SupabaseClient<any>,
    kontext: Record<string, unknown>,
  ): Promise<string | null> => {
    const start = kontext.abrechnungs_zeitraum_start as string
    const ende = kontext.abrechnungs_zeitraum_ende as string
    const { data } = await db
      .from('abrechnungen')
      .select('id')
      .eq('empfaenger_typ', 'marketing')
      .eq('abrechnungs_zeitraum_start', start)
      .eq('abrechnungs_zeitraum_ende', ende)
      .neq('status', 'storniert')
      .limit(1)
      .maybeSingle()
    return data ? (data.id as string) : null
  },

  buildHeaderRow: (b, positionen, kontext) => ({
    empfaenger_typ: 'marketing',
    empfaenger_email: kontext.empfaenger_email as string,
    empfaenger_name: kontext.empfaenger_name as string,
    abrechnungs_nr: b.nummer,
    abrechnungs_zeitraum_start: kontext.abrechnungs_zeitraum_start as string,
    abrechnungs_zeitraum_ende: kontext.abrechnungs_zeitraum_ende as string,
    // JSONB: die Position-Objekte, die der Caller aufgebaut hat (Display-Detail)
    positionen: kontext.positionen_jsonb as unknown[],
    summe_netto: centToEur(b.nettoCent),
    ust_satz: 19,
    ust_betrag: centToEur(b.ustCent),
    summe_brutto: centToEur(b.bruttoCent),
    status: 'entwurf',
  }),
}

/**
 * AbrechnungDescriptor fuer Kanzlei-System-A Monatsabrechnung (AAR-948).
 *
 * Ziel-Tabelle: abrechnungen (empfaenger_typ 'kanzlei').
 * Positionen:   KEIN separater positionenTable — JSONB in abrechnungen.positionen.
 * Serie:        CL-KANZLEI-{MM}  (monatlich zurueckgesetzt, 3-stellig = pad3)
 * Format:       CL-{YYYY-MM}-KANZLEI-{pad3}
 * Dedup:        pruefeBestehend prueft empfaenger_typ + empfaenger_email + zeitraum + neq storniert.
 * Markierung:   keine (status bleibt 'entwurf'; Caller-Route triggert PDF+Email).
 */
export const KANZLEI_A_DESCRIPTOR: AbrechnungDescriptor = {
  zielTabelle: 'abrechnungen',
  positionenTabelle: null,
  ustSatz: 19,

  nummer: (kontext) => {
    const monat = kontext.monat as string // YYYY-MM
    const [jahrStr, monatStr] = monat.split('-')
    const jahr = parseInt(jahrStr, 10)
    return {
      serie: `CL-KANZLEI-${monatStr}`,
      jahr,
      format: (_j: number, lfdNr: number) =>
        `CL-${monat}-KANZLEI-${String(lfdNr).padStart(3, '0')}`,
    }
  },

  pruefeBestehend: async (
    db: SupabaseClient<any>,
    kontext: Record<string, unknown>,
  ): Promise<string | null> => {
    const kanzleiEmail = kontext.empfaenger_email as string
    const start = kontext.abrechnungs_zeitraum_start as string
    const ende = kontext.abrechnungs_zeitraum_ende as string
    const { data } = await db
      .from('abrechnungen')
      .select('id')
      .eq('empfaenger_typ', 'kanzlei')
      .eq('empfaenger_email', kanzleiEmail)
      .eq('abrechnungs_zeitraum_start', start)
      .eq('abrechnungs_zeitraum_ende', ende)
      .neq('status', 'storniert')
      .limit(1)
      .maybeSingle()
    return data ? (data.id as string) : null
  },

  buildHeaderRow: (b, positionen, kontext) => ({
    empfaenger_typ: 'kanzlei',
    empfaenger_email: kontext.empfaenger_email as string,
    empfaenger_name: kontext.empfaenger_name as string,
    abrechnungs_nr: b.nummer,
    abrechnungs_zeitraum_start: kontext.abrechnungs_zeitraum_start as string,
    abrechnungs_zeitraum_ende: kontext.abrechnungs_zeitraum_ende as string,
    // JSONB: die Position-Objekte, die der Caller aufgebaut hat (Display-Detail)
    positionen: kontext.positionen_jsonb as unknown[],
    summe_netto: centToEur(b.nettoCent),
    ust_satz: 19,
    ust_betrag: centToEur(b.ustCent),
    summe_brutto: centToEur(b.bruttoCent),
    status: 'entwurf',
  }),
}
