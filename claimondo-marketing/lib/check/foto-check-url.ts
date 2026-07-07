// Baut die Ziel-URL fuer den Foto-Anspruch-Check aus dem /check-Kontext.
// Reicht Attribution-Params verlustfrei an das Foto-Tool durch, damit die
// Attribution ueber den Domain-Wechsel (claimondo.de -> app.claimondo.de)
// erhalten bleibt. Allowlist identisch zu CheckFunnelClient (utm_* + m) plus
// die Ads-Click-IDs, die der Finder-Embed auswertet.
const ATTRIBUTION_KEYS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
  'gclid', 'gbraid', 'wbraid', 'gclsrc',
  'm',
] as const

export function buildFotoCheckUrl(
  embedOrigin: string,
  search: string,
  extra?: Record<string, string | undefined>,
): string {
  const inParams = new URLSearchParams(search)
  const out = new URLSearchParams()
  for (const key of ATTRIBUTION_KEYS) {
    const v = inParams.get(key)
    if (v) out.set(key, v)
  }
  // Zusaetzliche Kontext-Params (z.B. schuld aus dem /check-Funnel) durchreichen,
  // damit das Foto-Tool sie vorbefuellen kann -> kein Doppelt-Fragen (zusammenhaengender Flow).
  if (extra) for (const [k, v] of Object.entries(extra)) if (v) out.set(k, v)
  const qs = out.toString()
  return `${embedOrigin}/embed/anspruch-pruefen${qs ? `?${qs}` : ''}`
}
