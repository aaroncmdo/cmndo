// QR-/Offline-Kampagnen-Attribution fuer den Mini-Wizard (/schaden-melden).
//
// Strassen-Aktionen verteilen QR-Codes, die auf /schaden-melden?src=<slug> zeigen.
// Aus <slug> wird der leads.source_channel abgeleitet, damit Kampagnen-Leads in der
// EIGENEN DB attribuierbar sind (GROUP BY source_channel) — bewusst ohne Google/UTM.
//
// Design:
// - Namespacing 'kampagne-<slug>' => greppbar (source_channel LIKE 'kampagne-%') UND
//   kollisionssicher: ein ?src=admin-direkt kann KEINEN internen Kanal impersonieren.
// - Sanitisierung (lowercase, nicht-alnum -> '-', getrimmt, Cap 40) => sicherer,
//   stabiler Wert aus dem user-kontrollierten URL-Param (Defense-in-Depth).
// - Fail-safe: ohne / leerer / komplett-unzulaessiger src -> DEFAULT_SOURCE_CHANNEL.
//   Organischer Traffic (kein ?src) bleibt damit byte-identisch zu vorher.
//
// Bewusst KEINE 'use server'-Direktive / kein DB-Zugriff: reine Funktion, dep-frei
// testbar (AAR-664: Konstanten nie aus 'use server'-Files exportieren).

export const DEFAULT_SOURCE_CHANNEL = 'mini_wizard'

/** Max. Slug-Laenge nach Sanitisierung (ohne den 'kampagne-'-Prefix). */
const MAX_SLUG_LEN = 40

/**
 * Leitet den `leads.source_channel` aus dem QR-Kampagnen-Param `?src=` ab.
 *
 * @param rawSrc    Roh-Wert aus der URL (user-kontrolliert) oder null/undefined.
 * @param fallback  source_channel ohne / bei unzulaessigem src. Default
 *                  'mini_wizard' (Self-Service); der Rueckruf-Pfad uebergibt
 *                  z.B. 'schaden-melden-rueckruf'. Kampagnen-Leads (gueltiger src)
 *                  bekommen IMMER 'kampagne-<slug>', egal welcher Pfad.
 * @returns         `kampagne-<slug>` bei gueltigem src, sonst `fallback`.
 *
 * Beispiele:
 *   campaignSourceChannel('strasse-koeln-juni26') === 'kampagne-strasse-koeln-juni26'
 *   campaignSourceChannel('Strasse Koeln')        === 'kampagne-strasse-koeln'
 *   campaignSourceChannel('admin-direkt')         === 'kampagne-admin-direkt'  // namespaced
 *   campaignSourceChannel(undefined)              === 'mini_wizard'
 *   campaignSourceChannel('!!!')                  === 'mini_wizard'
 */
export function campaignSourceChannel(
  rawSrc?: string | null,
  fallback: string = DEFAULT_SOURCE_CHANNEL,
): string {
  if (!rawSrc) return fallback
  const slug = rawSrc
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // alles Nicht-Slug -> Bindestrich
    .replace(/^-+|-+$/g, '') // fuehrende/abschliessende Bindestriche weg
    .slice(0, MAX_SLUG_LEN)
    .replace(/-+$/g, '') // evtl. durch slice entstandenen Trailing-Dash weg
  return slug ? `kampagne-${slug}` : fallback
}
