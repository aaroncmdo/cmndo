// Pure Scan-/Diff-Logik fuer die Redirect-Stub-Drift-Bremse.
// Keine I/O, kein git -> unit-testbar. CLI-Wrapper: ../check-redirect-stubs.mjs
//
// Faengt page.tsx, die auf ALLEN Pfaden redirect()/permanentRedirect() (aus
// next/navigation) machen und KEINEN Content-`return` haben = RSC-Redirect-Stub.
// Der rendert auf prod eine leere 200-Shell (React #310, s. AGENTS §Redirect-Stub +
// BROADCAST-redirect-stub-antipattern). Kanonischer Fix: HTTP-308 via next.config
// redirects() + page.tsx loeschen. (Belegt 06.-07.07.: vermittlungen/kunde/gutachter.)
//
// Abgrenzung (0 False-Positives): Content-Seiten, die im Normalfall JSX rendern und
// nur als GUARD redirecten (`if(!user)redirect('/login'); … return <JSX>`), haben einen
// Content-`return` -> werden NICHT geflaggt. Faustregel: irgendein Content-`return`
// vorhanden -> ok; redirectet auf allen Pfaden (kein return) -> Stub.

// Entfernt Kommentare + String-/Template-Literale, damit ein "return" oder "redirect("
// darin (z.B. in einer redirect-Ziel-URL oder einem Kommentar) die Heuristik nicht
// verfaelscht. Bewusst simpel (Regex, kein echter Parser) — reicht fuer page.tsx.
function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // Block-Kommentare
    .replace(/\/\/[^\n]*/g, ' ') // Zeilen-Kommentare
    .replace(/`(?:\\.|[^`\\])*`/g, '``') // Template-Literals
    .replace(/'(?:\\.|[^'\\])*'/g, "''") // Single-Quote-Strings
    .replace(/"(?:\\.|[^"\\])*"/g, '""') // Double-Quote-Strings
}

/**
 * @param {string} src Inhalt einer page.tsx
 * @returns {string|null} Verletzungs-Message oder null (kein Stub).
 */
export function scanContent(src) {
  // 1. Muss redirect/permanentRedirect aus 'next/navigation' importieren (auf dem ROH-src,
  //    weil das Stripping den Import-Pfad-String sonst entfernt).
  const importsNavRedirect =
    /import\s*(?:type\s*)?\{[^}]*\b(?:redirect|permanentRedirect)\b[^}]*\}\s*from\s*['"]next\/navigation['"]/.test(
      src,
    )
  if (!importsNavRedirect) return null

  const code = stripCommentsAndStrings(src)

  // 2. Muss redirect()/permanentRedirect() tatsaechlich aufrufen.
  if (!/\b(?:redirect|permanentRedirect)\s*\(/.test(code)) return null

  // 3. Reiner Stub = KEIN Content-`return`. `return redirect(...)` zaehlt NICHT als Content
  //    (es ist selbst nur die Weiterleitung) -> vor dem Check entfernen.
  const withoutRedirectReturns = code.replace(/\breturn\s+(?:redirect|permanentRedirect)\b/g, '')
  if (/\breturn\b/.test(withoutRedirectReturns)) return null

  return 'redirect()-only page.tsx (kein Content-return) -> next.config redirects() nutzen + page.tsx loeschen (sonst leere 200-Shell auf prod; AGENTS §Redirect-Stub)'
}

export function diffBaseline(currentFiles, baselineFiles) {
  const base = new Set(baselineFiles)
  const cur = new Set(currentFiles)
  return {
    added: currentFiles.filter((f) => !base.has(f)).sort(),
    removed: baselineFiles.filter((f) => !cur.has(f)).sort(),
  }
}
