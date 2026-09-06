// KI-Generierung von Cold-Mail-Vorlagen (Betreff + HTML-Body) je Lead-Rolle.
// Muster analog src/lib/linkedin/compose.ts: inline Anthropic-Client + DI-fähige generate-Fn
// (Testbarkeit ohne SDK-Mock). Fail-soft als Result-Object — der Admin ist im Loop,
// also Fehler zurückgeben statt still einen Fallback zu produzieren.
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export type ColdMailRolle = 'makler' | 'werkstatt' | 'sachverstaendiger'
export type ComposeInput = { rolle: ColdMailRolle; ziel: string; tonalitaet?: string }
export type ComposeResult =
  | { ok: true; betreff: string; body_html: string }
  | { ok: false; error: string }
export type GenerateFn = (system: string, user: string) => Promise<string>

const ROLLEN_KONTEXT: Record<ColdMailRolle, string> = {
  makler:
    'Empfänger ist ein Versicherungsmakler. Claimondo nimmt ihm die komplette Kfz-Schadenabwicklung seiner Mandanten ab (Gutachter-Vermittlung, Werkstatt, Anwaltsanbindung) — er behält den Kunden, spart Zeit, wirkt kompetenter.',
  werkstatt:
    'Empfänger ist eine Kfz-Werkstatt. Claimondo bringt ihr regulierte Reparaturaufträge (unverschuldete Unfälle, § 249 BGB, keine Kürzung) und übernimmt Gutachten + Abrechnung.',
  sachverstaendiger:
    'Empfänger ist ein Kfz-Sachverständiger/Gutachter. Claimondo bringt ihm qualifizierte Gutachtenaufträge in seiner Region und digitalisiert die Auftragsannahme.',
}

function buildSystem(rolle: ColdMailRolle): string {
  return [
    'Sie schreiben eine professionelle deutsche Erstkontakt-Email (Cold Outreach) für das Claimondo Partnernetzwerk.',
    'Claimondo ist Deutschlands Plattform für Kfz-Schadensregulierung.',
    ROLLEN_KONTEXT[rolle],
    'Ton: sachlich-kompetent, seriös, B2B — KEIN reißerischer Werbeslang. Kurz (Body max ~1200 Zeichen).',
    'Nutze wo sinnvoll die Merge-Platzhalter GENAU so: {{Ansprechpartner}}, {{Firma}}, {{Ort}}, {{Vorname}}. Erfinde keine Namen.',
    'Der Body ist schlichtes HTML (<p>, <br>, <strong>, <ul><li>) — KEIN <html>/<head>/<body>, kein CSS, keine Bilder. Den Abmeldelink NICHT einbauen (wird separat angehängt).',
    'Antworte AUSSCHLIESSLICH mit einem JSON-Objekt: {"betreff": "...", "body_html": "..."} — kein Markdown, kein Text davor oder danach.',
  ].join('\n')
}

function extractJson(raw: string): { betreff: string; body_html: string } | null {
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1))
    if (typeof parsed?.betreff === 'string' && typeof parsed?.body_html === 'string') {
      return { betreff: parsed.betreff, body_html: parsed.body_html }
    }
    return null
  } catch {
    return null
  }
}

async function generateWithClaude(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY ist nicht konfiguriert.')
  const client = new Anthropic({ apiKey })
  const res = await client.messages.create({
    model: AI_MODELS.cold_mail_compose,
    max_tokens: 1200,
    system,
    messages: [{ role: 'user', content: user }],
  })
  const block = res.content.find((b) => b.type === 'text')
  return block && block.type === 'text' ? block.text : ''
}

export async function generiereColdMailVorlage(
  input: ComposeInput,
  deps: { generate?: GenerateFn } = {},
): Promise<ComposeResult> {
  const generate = deps.generate ?? generateWithClaude
  const system = buildSystem(input.rolle)
  const user = [
    `Ziel der Email: ${input.ziel}`,
    input.tonalitaet ? `Tonalität: ${input.tonalitaet}` : '',
  ].filter(Boolean).join('\n')
  let raw: string
  try {
    raw = await generate(system, user)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'KI-Generierung fehlgeschlagen.' }
  }
  const parsed = extractJson(raw)
  if (!parsed) return { ok: false, error: 'KI-Antwort konnte nicht als Vorlage gelesen werden. Bitte erneut versuchen.' }
  return { ok: true, betreff: parsed.betreff, body_html: parsed.body_html }
}
