// AAR-939 P4 · Kunden-Bestätigung nach Monika-Funnel (Callback-Flow). PURE: Bezeichnung
// + Text, vitest-testbar (kein server-only). Anrede Sie, Link claimondo.de (Aaron 2026-06-07).

/** Cluster-Key → Stadt-Anzeigename (echte Umlaute). */
export const CLUSTER_STADT: Record<string, string> = {
  wuppertal: 'Wuppertal',
  duesseldorf: 'Düsseldorf',
  bonn: 'Bonn',
}

const GENERISCH = 'Ihrem Sachverständigen'

export interface BezeichnungInput {
  source: 'kfz_gutachter_lp' | 'sv_embed'
  cluster: string | null
}

/**
 * {X} in der Bestätigung:
 *   Cluster-LP → „Sachverständiger {Stadt}" (Mapping; unbekannt → generisch)
 *   sv_embed   → embed_sites.name (fehlt → generisch)
 */
export function svBezeichnung(input: BezeichnungInput, siteName: string | null): string {
  if (input.source === 'kfz_gutachter_lp') {
    const stadt = input.cluster ? CLUSTER_STADT[input.cluster] : undefined
    return stadt ? `Sachverständiger ${stadt}` : GENERISCH
  }
  // sv_embed
  return siteName?.trim() ? siteName.trim() : GENERISCH
}

export function kundenBestaetigungText(bezeichnung: string): string {
  return `Vielen Dank für Ihre Anfrage bei ${bezeichnung}. Wir melden uns schnellstmöglich bei Ihnen. Mehr über uns: https://claimondo.de`
}
