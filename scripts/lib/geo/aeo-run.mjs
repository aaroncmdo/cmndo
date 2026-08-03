import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()
const WEB_SEARCH = { type: 'web_search_20260209', name: 'web_search', max_uses: 5 }

// Fuehrt EINE Query aus, web_search-grounded. Behandelt pause_turn (Assistant-Turn
// zurueckpushen + neu senden) und akkumuliert die Content-Bloecke ALLER Turns
// (Suchtreffer stehen in fruehen Turns, die finale Antwort im letzten).
export async function runQuery(text, { model = 'claude-opus-4-8', maxTokens = 4096, maxTurns = 8 } = {}) {
  const messages = [{ role: 'user', content: text }]
  const allContent = []
  for (let turn = 0; turn < maxTurns; turn++) {
    const stream = client.messages.stream({ model, max_tokens: maxTokens, tools: [WEB_SEARCH], messages })
    const msg = await stream.finalMessage()
    allContent.push(...msg.content)
    if (msg.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: msg.content })
      continue
    }
    break
  }
  return allContent
}
