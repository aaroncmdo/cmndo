import { DEFAULT_RANG_CONFIG, type RangConfig } from './config'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any

/** Liest die DB-SSoT partner_rang_config (key-value) und merged ueber die Defaults (DB gewinnt je Key). */
export async function ladeRangConfig(supabase: Sb): Promise<RangConfig> {
  const { data } = await supabase.from('partner_rang_config').select('schluessel, wert')
  const byKey = new Map<string, number>()
  for (const row of (data ?? []) as { schluessel: string; wert: number | string }[]) {
    byKey.set(row.schluessel, Number(row.wert))
  }
  const g = (k: string, d: number) => (byKey.has(k) ? (byKey.get(k) as number) : d)
  return {
    volumenFaktor: g('volumen_faktor', DEFAULT_RANG_CONFIG.volumenFaktor),
    credOeffentlichBestellt: g('cred_oeffentlich_bestellt', DEFAULT_RANG_CONFIG.credOeffentlichBestellt),
    credProZertifikat: g('cred_pro_zertifikat', DEFAULT_RANG_CONFIG.credProZertifikat),
    credZertifikatCap: g('cred_zertifikat_cap', DEFAULT_RANG_CONFIG.credZertifikatCap),
    credProJahr: g('cred_pro_jahr', DEFAULT_RANG_CONFIG.credProJahr),
    credTenureCap: g('cred_tenure_cap', DEFAULT_RANG_CONFIG.credTenureCap),
    ratingMinBewertungen: g('rating_min_bewertungen', DEFAULT_RANG_CONFIG.ratingMinBewertungen),
    ratingCap: g('rating_cap', DEFAULT_RANG_CONFIG.ratingCap),
    maxNoShowQuoteGold: g('max_no_show_quote_gold', DEFAULT_RANG_CONFIG.maxNoShowQuoteGold),
    maxNoShowQuoteSilber: g('max_no_show_quote_silber', DEFAULT_RANG_CONFIG.maxNoShowQuoteSilber),
    maxAblehnungen30d: g('max_ablehnungen_30d', DEFAULT_RANG_CONFIG.maxAblehnungen30d),
    schwelleSilber: g('schwelle_silber', DEFAULT_RANG_CONFIG.schwelleSilber),
    schwelleGold: g('schwelle_gold', DEFAULT_RANG_CONFIG.schwelleGold),
    volumenVielfach: g('volumen_vielfach', DEFAULT_RANG_CONFIG.volumenVielfach),
    volumenErfahren: g('volumen_erfahren', DEFAULT_RANG_CONFIG.volumenErfahren),
  }
}
