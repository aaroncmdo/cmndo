import { toPlainText } from '@react-email/render'

/**
 * Plain-Text-Alternative (multipart/alternative) aus bereits gerendertem
 * Email-HTML.
 *
 * Nutzt react-emails eigene, fuer unsere Templates erprobte Konfiguration
 * (`toPlainText`): Bilder + Preheader-Padding (`[data-skip-in-text=true]`)
 * werden geskippt, Links als Text mit `hideLinkHrefIfSameAsText`, kein
 * wordwrap. Das ist exakt dieselbe Pipeline wie `render(el, { plainText: true })`,
 * nur auf das bereits gerenderte HTML angewandt — so deckt EINE zentrale Stelle
 * (`sendEmail`) alle Caller ab, statt den Plain-Text an ~35 Render-Sites
 * einzeln zu erzeugen.
 *
 * Defensiv: leeres/fehlendes HTML -> leerer String, und ein etwaiger
 * Konvertierungsfehler wird verschluckt. Der Email-Versand darf nie an der
 * Text-Ableitung scheitern — schlimmstenfalls geht die Mail (wie bisher) ohne
 * Plain-Text-Part raus.
 */
export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return ''
  try {
    return toPlainText(html)
  } catch (err) {
    console.error('[email] Plain-Text-Ableitung fehlgeschlagen:', err)
    return ''
  }
}
