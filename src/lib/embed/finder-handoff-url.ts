// Baut die Finder-Handoff-URL aus dem Tool-Kontext (AnspruchWizard.zumFinder).
// Reicht Attribution verlustfrei Tool -> Finder durch (Makler-`m` + Ads-Click-IDs + utm),
// damit der Finder-Lead makler-attribuiert wird (reserviereEmbedTermin loest `m` ->
// promotion_code_id) und die Finder-GTM/Ads-Conversion die Klick-ID sieht.
// schaetzung = Session-Token der Anspruch-Schaetzung (Lead-Verknuepfung).
// Allowlist identisch zu marketing buildFotoCheckUrl (utm_* + Ads-IDs + m).
const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'gclsrc',
  'm',
] as const

export function buildFinderHandoffUrl(search: string, sessionToken: string): string {
  const inParams = new URLSearchParams(search)
  const out = new URLSearchParams()
  for (const key of ATTRIBUTION_KEYS) {
    const v = inParams.get(key)
    if (v) out.set(key, v)
  }
  out.set('schaetzung', sessionToken)
  return `/embed/gutachter-finder?${out.toString()}`
}
