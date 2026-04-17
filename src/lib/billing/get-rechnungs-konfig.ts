import { createAdminClient } from '@/lib/supabase/admin'

/**
 * AAR-416: Liefert die zum Stichtag gültige Rechnungs-Konfiguration
 * (Absender + Zahlungsempfänger-Block). Bei GmbH-Gründung wird eine neue
 * Zeile mit `gueltig_ab` angelegt, die alte bekommt `gueltig_bis`.
 */
export type RechnungsKonfig = {
  id: string
  gueltig_ab: string
  gueltig_bis: string | null
  rechnungssteller: 'claimondo_gmbh_igr' | 'claimondo_gmbh' | 'gbr'
  firmenname: string
  strasse: string
  plz: string
  ort: string
  steuernummer: string | null
  ust_id: string | null
  hrb: string | null
  geschaeftsfuehrer: string | null
  zahlungsempfaenger_name: string
  zahlungsempfaenger_iban: string
  zahlungsempfaenger_bic: string
  zahlungsempfaenger_bank: string
  zahlungsempfaenger_hinweis: string | null
  version: number
}

export async function getAktuelleRechnungsKonfig(
  stichtag: Date = new Date(),
): Promise<RechnungsKonfig> {
  const db = createAdminClient()
  const datum = stichtag.toISOString().slice(0, 10)

  const { data, error } = await db
    .from('rechnungs_konfiguration')
    .select('*')
    .lte('gueltig_ab', datum)
    .or(`gueltig_bis.is.null,gueltig_bis.gt.${datum}`)
    .order('gueltig_ab', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error || !data) {
    throw new Error(
      `[AAR-416] Keine gültige rechnungs_konfiguration zum Stichtag ${datum} gefunden: ${error?.message ?? 'leer'}`,
    )
  }

  return data as RechnungsKonfig
}
