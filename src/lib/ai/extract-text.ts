// Text aus einer Anthropic-Antwort ziehen — ueber ALLE Bloecke, nicht nur `content[0]`.
//
// WARUM: Die Messages-API liefert `content` als ARRAY von Bloecken. Stellt das Modell einen
// `thinking`-Block voran, steht der Text erst in `content[1]`. Wer nur `content[0]` liest,
// bekommt dann einen leeren String — obwohl die Antwort vollstaendig vorliegt.
//
// PROD-BELEG (16.08., Unfallskizzen-Korrektur): `stop_reason: end_turn`, `output_tokens: 715`,
// extrahierte Laenge **0**. Die Bloecke waren:
//     [0] type=thinking
//     [1] type=text  ->  <svg viewBox="0 0 600 400" …>   (das fertige SVG)
// Der Aufrufer meldete "Claude hat kein valides SVG geliefert" und verwarf eine intakte Antwort.
//
// ⚠ Die Klasse ist besonders unangenehm, weil sie NICHT-DETERMINISTISCH ist: dasselbe Feature
// funktioniert meistens und faellt bei schwierigeren Prompts aus (dort denkt das Modell eher).
// Das sieht wie Flakiness aus und wird entsprechend nicht als Bug behandelt.

type TextBlock = { type: string; text?: string }

/**
 * Fuegt den Text ALLER `text`-Bloecke zusammen. `thinking`/`redacted_thinking`/Tool-Bloecke
 * werden uebersprungen. Gibt '' zurueck, wenn kein Text-Block existiert.
 */
export function extractAnthropicText(content: readonly TextBlock[] | undefined | null): string {
  if (!content?.length) return ''
  return content
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n')
    .trim()
}
