// Pure Helpers fuer URL-synchronisierte Drawer (CRM-Cockpit, Partner-Leads).
// Getrennt vom Hook (use-url-drawer-param.ts), damit die Logik ohne DOM testbar ist
// (Repo hat kein jsdom/RTL — nur pure vitest-Tests).

/**
 * Setzt/entfernt einen Query-Param in einem search-String und liefert den neuen
 * search-String ('?a=b&c=d' oder '' wenn leer). Andere Params bleiben erhalten.
 *
 * @param search  aktueller search-String (mit oder ohne fuehrendes '?')
 * @param key     zu setzender Param
 * @param value   neuer Wert; null entfernt den Param
 * @param alsoRemove weitere Params, die im SELBEN Schritt entfernt werden
 *                   (ein History-Eintrag statt zwei — z. B. kontakt→aktion-Wechsel)
 */
export function setSearchParam(
  search: string,
  key: string,
  value: string | null,
  alsoRemove: string[] = [],
): string {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
  for (const k of alsoRemove) params.delete(k)
  if (value === null) params.delete(key)
  else params.set(key, value)
  const s = params.toString()
  return s ? `?${s}` : ''
}

/**
 * Parst den `?kontakt=<kind>:<id>`-Param des Vertrieb-Cockpits.
 * Split am ERSTEN ':' (UUIDs enthalten keinen Doppelpunkt, kind schon gar nicht).
 * Ungueltige Werte (kein ':', leere Teile) → null — Caller verwirft den Param dann.
 */
export function parseKontaktParam(value: string | null): { kind: string; id: string } | null {
  if (!value) return null
  const idx = value.indexOf(':')
  if (idx <= 0 || idx === value.length - 1) return null
  return { kind: value.slice(0, idx), id: value.slice(idx + 1) }
}

/** Baut den `?kontakt=`-Wert aus kind+id (Gegenstueck zu parseKontaktParam). */
export function buildKontaktParam(kind: string, id: string): string {
  return `${kind}:${id}`
}
