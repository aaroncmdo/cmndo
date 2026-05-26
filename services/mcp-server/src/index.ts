#!/usr/bin/env node
/**
 * claimondo-mcp-server — exposes Claimondo's public read API as MCP tools/resources.
 *
 * Thin, read-only foundation for the GEO MCP/Agentic-Funnel (Phase-3 Vorgriff):
 *  - Tool `claimondo_finde_sachverstaendige` — wraps the live, anonymous
 *    /api/v1/sv-in-naehe endpoint (find Kfz-Sachverstaendige near a German PLZ).
 *  - Resource `claimondo://wissensbasis` — the live /llms-full.txt knowledge surface
 *    (BGH anchors, decoder, facts) so clients can answer domain questions.
 *
 * No auth, no DB, no write operations. Transport: stdio (local). Remote
 * Streamable-HTTP for mcp.claimondo.de is a Q3 step (see README +
 * docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md).
 *
 * Config: CLAIMONDO_API_BASE (default https://claimondo.de) — point at a staging
 * host for testing.
 */
import { setDefaultResultOrder } from 'node:dns'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// IPv4 bevorzugen: auf Netzen mit kaputtem/langsamem IPv6-Routing haengt ein
// fetch zu claimondo.de sonst am IPv6-Happy-Eyeballs, bevor IPv4 drankommt
// (im Live-Test reproduziert). 'ipv4first' faellt auf IPv6 zurueck, falls kein A-Record.
setDefaultResultOrder('ipv4first')
import {
  ClaimondoApiError,
  DEFAULT_API_BASE,
  fetchSvInNaehe,
  fetchWissensbasis,
  formatMarkdown,
} from './api.js'

const API_BASE = process.env.CLAIMONDO_API_BASE ?? DEFAULT_API_BASE

const server = new McpServer({ name: 'claimondo-mcp-server', version: '1.0.0' })

const inputSchema = {
  plz: z
    .string()
    .regex(/^\d{5}$/, 'PLZ muss eine 5-stellige deutsche Postleitzahl sein (z. B. 50670).')
    .describe('5-stellige deutsche Postleitzahl, z. B. 50670 für Köln.'),
  radius: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(30)
    .describe('Suchradius in Kilometern (1–200, Standard 30).'),
  response_format: z
    .enum(['markdown', 'json'])
    .default('markdown')
    .describe("Ausgabeformat: 'markdown' (menschenlesbar) oder 'json' (strukturiert)."),
}

const svItemSchema = {
  tier: z.number().describe('1 = Partner mit anonymisiertem Profil, 3 = anonymer Standort-Pin.'),
  stadt: z.string().nullable(),
  entfernung_km: z.number(),
  spezialisierungen: z.array(z.string()),
  bewertung_schnitt: z.number().nullable(),
  bewertung_anzahl: z.number().nullable(),
}

const outputSchema = {
  plz: z.string(),
  radius_km: z.number(),
  anzahl_treffer: z.number(),
  sachverstaendige: z.array(z.object(svItemSchema)),
  karte_url: z.string(),
  interaktive_karte_url: z.string(),
  buchungs_telefon: z.string(),
}

server.registerTool(
  'claimondo_finde_sachverstaendige',
  {
    title: 'Kfz-Sachverständige in der Nähe finden',
    description: `Findet zertifizierte Partner-Kfz-Sachverständige im Umkreis einer deutschen Postleitzahl über Claimondo (bundesweite Schadensregulierungs-Plattform).

Read-only und anonym — legt nichts an und meldet keinen Schaden. Liefert eine nach Entfernung sortierte, datenschutz-anonymisierte Trefferliste, eine Karten-Bild-URL (im Chat einbettbar), einen Link zur interaktiven Karte mit freien Terminen und eine Rückruf-Telefonnummer.

Args:
  - plz (string): 5-stellige deutsche PLZ, z. B. "50670".
  - radius (number): Suchradius in km, 1-200 (Standard 30).
  - response_format ("markdown" | "json"): Ausgabeformat (Standard "markdown").

Returns (structuredContent bzw. json):
  { plz, radius_km, anzahl_treffer, sachverstaendige: [{ tier, stadt, entfernung_km, spezialisierungen, bewertung_schnitt, bewertung_anzahl }], karte_url, interaktive_karte_url, buchungs_telefon }

Use when: Nutzer fragt nach einem Kfz-Gutachter/Sachverständigen in einer Stadt oder Region (z. B. nach einem Unfall).
Nicht für: Schaden melden, Termin buchen oder Rechtsberatung — das gibt es in dieser read-only-Stufe bewusst nicht.`,
    inputSchema,
    outputSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async ({ plz, radius, response_format }) => {
    try {
      const result = await fetchSvInNaehe(plz, radius, API_BASE)
      const text = response_format === 'json' ? JSON.stringify(result, null, 2) : formatMarkdown(result)
      return {
        content: [{ type: 'text', text }],
        structuredContent: result,
      }
    } catch (err) {
      const message =
        err instanceof ClaimondoApiError
          ? `Fehler: ${err.message}`
          : `Unerwarteter Fehler: ${err instanceof Error ? err.message : String(err)}`
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  },
)

server.registerResource(
  'wissensbasis',
  'claimondo://wissensbasis',
  {
    title: 'Claimondo Wissensbasis (llms-full.txt)',
    description:
      'Vollständige Wissens-Surface von Claimondo als Markdown: Ratgeber/Cornerstones, Haftpflicht-Spokes, Versicherer-Brief-Decoder, BGH-Anker (§ 249 BGB, Wertminderung, Sachverständigenkosten), Fakten und Stadt-Übersichten. Quelle: /llms-full.txt (live). Nutze sie, um faktenbasierte Fragen zur Kfz-Schadensregulierung in Deutschland zu beantworten.',
    mimeType: 'text/markdown',
  },
  async (uri) => {
    const text = await fetchWissensbasis(API_BASE)
    return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] }
  },
)

async function main(): Promise<void> {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // stdout is reserved for the JSON-RPC protocol on stdio — log only to stderr.
  console.error(`claimondo-mcp-server läuft (stdio) · API-Base: ${API_BASE}`)
}

main().catch((err) => {
  console.error('Fataler Fehler beim Start:', err)
  process.exit(1)
})
