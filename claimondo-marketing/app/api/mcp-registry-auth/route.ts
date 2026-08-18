// Domain-Verifikation fuer die offizielle MCP-Registry (registry.modelcontextprotocol.io).
//
// Erreichbar unter https://claimondo.de/.well-known/mcp-registry-auth
// (Rewrite in next.config.ts — ein Ordner, der mit '.' beginnt, ist im App-Router
// kein verlaesslicher Routen-Name).
//
// WARUM: Der Registry-Eintrag `de.claimondo/sv-finder` stammt vom 27.05.2026 und
// beschreibt den Server als "anonym, read-only" — die Terminbuchung fehlt darin
// komplett, obwohl der Server seit Juni sieben Tools hat. Wer in der Registry nach
// "Termin buchen" sucht, findet Claimondo nicht.
//
// Der Namespace `de.claimondo` ist die Reverse-DNS-Form unserer Domain; die Registry
// verlangt dafuer eine domain-basierte Authentifizierung. Zwei Wege stehen offen:
// ein DNS-TXT-Record oder GENAU DIESE DATEI. Der HTTP-Weg ist hier der bequemere —
// er braucht keinen DNS-Zugriff und ist sofort widerrufbar (ENV leeren).
//
// VERTRAG (modelcontextprotocol.io/registry/authentication): der Body ist exakt
//   v=MCPv1; k=ed25519; p=<BASE64-PUBLIC-KEY>
// als nackter Text. Deshalb text/plain ohne Zusatzausgabe.
//
// BETRIEB: Der Wert entsteht lokal beim Erzeugen des Schluesselpaars (siehe
// docs/2026-08-18-mcp-registry-update.md) und wird als ENV gesetzt — der PRIVATE
// Schluessel bleibt lokal und gehoert NICHT hierher. Ohne ENV antwortet die Route
// 404 statt mit leerem Body: ein leerer 200 laesst die Verifikation fehlschlagen
// und sieht in der Fehlersuche aus wie ein Serverfehler.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const proof = process.env.MCP_REGISTRY_AUTH_PROOF?.trim()

  if (!proof) {
    return new Response('Not Found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(proof, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      // Kein Caching: der Schluessel ist rotierbar, und die Registry prueft bei
      // jedem Publish erneut.
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}
