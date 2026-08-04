import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

const SYSTEM = [
  'Du bewertest, wie gut eine KI-Antwort die Marke "Claimondo" behandelt.',
  'Claimondo (claimondo.de) ist eine unabhängige deutsche Plattform für KFZ-Gutachten & Unfall-Schadenregulierung für unverschuldet Geschädigte.',
  'Antworte AUSSCHLIESSLICH mit JSON, keine Erklärung:',
  '{"accuracy":<0-10>,"sentiment":<0-10>,"completeness":<0-10>}',
  'accuracy = Korrektheit der Aussagen zum Thema/zu Claimondo (10 = korrekt / keine Falschaussage).',
  'sentiment = Ton gegenüber Claimondo (10 = positiv, 5 = neutral oder nicht erwähnt, 0 = negativ).',
  'completeness = wie gut die Antwort die Nutzerintention abdeckt (10 = vollständig).',
].join('\n')

// Extrahiert das erste JSON-Objekt aus einem Text (```json-Fences-tolerant) und validiert 0-10.
export function parseScores(raw) {
  if (!raw) return null
  const m = raw.match(/\{[\s\S]*?\}/)
  if (!m) return null
  let obj
  try {
    obj = JSON.parse(m[0])
  } catch {
    return null
  }
  const ok = (v) => typeof v === 'number' && v >= 0 && v <= 10
  if (!ok(obj.accuracy) || !ok(obj.sentiment) || !ok(obj.completeness)) return null
  return { accuracy: obj.accuracy, sentiment: obj.sentiment, completeness: obj.completeness }
}

export async function judge(query, answerText, { model = 'claude-opus-4-8' } = {}) {
  const user = `Frage: ${query}\n\nKI-Antwort:\n${answerText}\n\nGib nur das JSON.`
  for (let attempt = 0; attempt < 2; attempt++) {
    const msg = await client.messages.create({ model, max_tokens: 300, system: SYSTEM, messages: [{ role: 'user', content: user }] })
    const textOut = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
    const parsed = parseScores(textOut)
    if (parsed) return parsed
  }
  return { accuracy: null, sentiment: null, completeness: null }
}
