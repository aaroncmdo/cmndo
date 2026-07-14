// Cold-Mailer S0: wandelt den Klartext aus dem manuellen Composer in den
// bodyHtml-Kontrakt (der Shell injiziert bodyHtml via dangerouslySetInnerHTML).
// OHNE das landet ein mehrzeiliger Text als eine einzige Zeile beim Empfaenger —
// HTML kollabiert Whitespace.
//
// Der S1-KI-Composer liefert bereits HTML und geht NICHT durch diese Fn.
// Hinweis: Merge-Werte werden erst danach serverseitig eingesetzt und sind damit
// nicht escaped (z.B. Firma "Meier & Co"). Bewusst offen — die serverseitige
// Sanitisierung des gesamten bodyHtml ist als S1-Follow-up gesetzt.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function textToHtml(text: string): string {
  return text
    .split('\n')
    .map((zeile) => (zeile.trim() === '' ? '' : escapeHtml(zeile)))
    .join('<br>')
}
