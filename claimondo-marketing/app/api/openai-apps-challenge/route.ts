// Domain-Verifikation fuer die Einreichung im OpenAI-Plugin-/Apps-Directory.
//
// Erreichbar unter https://claimondo.de/.well-known/openai-apps-challenge
// (Rewrite in next.config.ts — ein Ordner, der mit '.' beginnt, ist im App-Router
// kein verlaesslicher Routen-Name).
//
// WARUM: `docs/superpowers/specs/2026-06-18-mcp-active-in-chat-design.md` Baustein 6
// ("Formale Listings") ist der letzte offene Baustein des Designs — die Bausteine 1–5
// und 8–10 sind live (OpenAPI beschreibt alle 7 Endpunkte, MCP-Server antwortet mit
// 7 Tools, und ueber `source='mcp'` sind bereits drei echte Chat-Terminbuchungen
// eingegangen). Ohne Directory-Listung kann ChatGPT die Buchung aber nicht von sich
// aus anbieten. Die Einreichung verlangt genau diesen Endpunkt.
//
// VERTRAG (developers.openai.com/plugins/deploy/submission): Der Endpunkt liefert
// AUSSCHLIESSLICH den Verifikations-Token als nackten Text — "Do not return JSON, a
// list of tokens, or multiple tokens from the same URL". Deshalb hier bewusst
// text/plain ohne Trailing-Newline und ohne jede Zusatzausgabe.
//
// BETRIEB: Der Token kommt beim Start der Einreichung von OpenAI und wird als
// ENV-Variable gesetzt (VPS: /etc/claimondo-marketing/.env.local) — KEIN Code-Deploy
// noetig. Ist die Variable nicht gesetzt, antwortet die Route 404 statt einen leeren
// Body auszuliefern: ein leerer 200 wuerde die Verifikation fehlschlagen lassen und
// sieht in der Fehlersuche aus wie ein Server-Problem.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN?.trim()

  if (!token) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(token, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Kein Caching: OpenAI prueft den Token beim Review erneut, und ein rotierter
      // Token darf nicht aus einem CDN-Cache beantwortet werden.
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
