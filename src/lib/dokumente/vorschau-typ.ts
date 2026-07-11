// Reiner Typ-Erkenner fuer Dokument-Vorschau.
// Keine Seiteneffekte, kein IO — pure Funktion.

const BILD_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'gif', 'avif']

/**
 * Erkennt den Vorschau-Typ eines Dokuments anhand der URL und/oder des MIME-Typs.
 *
 * Logik (Prioritaet):
 *  1. `typ` enthaelt 'pdf' (case-insensitive) → 'pdf'
 *  2. URL-Pfad (ohne Query/Hash) endet auf .pdf → 'pdf'
 *  3. URL-Pfad endet auf Bild-Extension → 'bild'
 *  4. Fallback → 'andere'
 */
export function erkenneVorschauTyp(
  url: string | null,
  typ?: string | null,
): 'pdf' | 'bild' | 'andere' {
  // Typ-basierte Erkennung (MIME-Typ hat hoehere Prioritaet als Dateiendung)
  if (typ && typ.toLowerCase().includes('pdf')) {
    return 'pdf'
  }

  if (!url) return 'andere'

  // Query-String und Hash entfernen — nur Pfad fuer Extension-Check verwenden
  let path = url
  try {
    const parsed = new URL(url)
    path = parsed.pathname
  } catch {
    // Relative oder ungueltige URL — einfachen String-Split verwenden
    const hashIdx = url.indexOf('#')
    const withoutHash = hashIdx >= 0 ? url.slice(0, hashIdx) : url
    const qIdx = withoutHash.indexOf('?')
    path = qIdx >= 0 ? withoutHash.slice(0, qIdx) : withoutHash
  }

  const dotIdx = path.lastIndexOf('.')
  if (dotIdx < 0) return 'andere'

  const ext = path.slice(dotIdx + 1).toLowerCase()

  if (ext === 'pdf') return 'pdf'
  if (BILD_EXTENSIONS.includes(ext)) return 'bild'

  return 'andere'
}
