/**
 * Findet Cron-Auth-Pruefungen, die NICHT fail-closed sind.
 *
 * ANLASS (23.08.2026): `if (authHeader !== `Bearer ${process.env.CRON_SECRET}`)` sieht wie
 * ein Gate aus, ist aber keins — fehlt die Variable, ergibt der Ausdruck "Bearer undefined",
 * und genau dieser Header kommt durch. Der Helper `assertCronAuth` (fail-closed) existierte
 * bereits und wurde von 77 Routen genutzt; 8 blieben zurueck. Ein Fix, der 90 % erreicht,
 * ist genau die Sorte, die ohne Bremse wieder zerfaellt.
 *
 * ⚠ Der schlimmere Fall war `process.env.CRON_SECRET ?? ''`: ohne Secret ist der
 * Vergleichswert der LEERE String — `token === ''` ist wahr, sobald jemand den Header ohne
 * Wert schickt. Der Ausdruck oeffnet also ausgerechnet dann, wenn nichts konfiguriert ist.
 */

/** Entfernt Kommentare und String-Literale, damit Erklaertexte nichts flaggen. */
export function entrausche(inhalt) {
  return inhalt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * Ein Vorkommen gilt als abgesichert, wenn im selben Ausdruck die EXISTENZ des Secrets
 * geprueft wird. Beide real vorkommenden Formen:
 *   `!process.env.CRON_SECRET || authHeader !== …`
 *   `!!process.env.CRON_SECRET && authHeader === …`
 */
const GUARD = /(^|[^!])!process\.env\.CRON_SECRET|!!process\.env\.CRON_SECRET|const\s+secret\s*=\s*process\.env\.CRON_SECRET[\s\S]{0,120}?if\s*\(\s*!\s*secret\s*\)/

/**
 * @param {string} inhalt  Dateiinhalt
 * @returns {Array<{ zeile: number, grund: 'direktvergleich' | 'leerer-fallback', text: string }>}
 */
export function scanneCronAuth(inhalt) {
  const sauber = entrausche(inhalt)
  if (!sauber.includes('process.env.CRON_SECRET')) return []

  const funde = []
  const zeilen = sauber.split('\n')

  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i]
    if (!zeile.includes('process.env.CRON_SECRET')) continue

    // Kontext = diese Zeile + die zwei davor: der Guard steht real entweder im selben
    // Ausdruck oder unmittelbar darueber (`const secret = …` / `if (!secret) return`).
    const kontext = zeilen.slice(Math.max(0, i - 2), i + 1).join('\n')

    // `?? ''` bzw. `?? ""` ist IMMER unsicher — der Fallback ist ein gueltiger Vergleichswert.
    if (/process\.env\.CRON_SECRET\s*\?\?\s*(''|"")/.test(zeile)) {
      funde.push({ zeile: i + 1, grund: 'leerer-fallback', text: zeile.trim().slice(0, 120) })
      continue
    }

    // Interpolation in einen Bearer-Vergleich ohne Existenz-Guard.
    const istVergleich = /`Bearer \$\{process\.env\.CRON_SECRET\}`/.test(zeile)
    if (istVergleich && !GUARD.test(kontext)) {
      funde.push({ zeile: i + 1, grund: 'direktvergleich', text: zeile.trim().slice(0, 120) })
    }
  }
  return funde
}
