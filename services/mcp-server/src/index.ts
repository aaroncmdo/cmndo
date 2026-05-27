#!/usr/bin/env node
/**
 * claimondo-mcp-server — exposes Claimondo's public read API as MCP tools/resources.
 *
 * Thin, read-only foundation for the GEO MCP/Agentic-Funnel (Phase-3 Vorgriff):
 *  - Tool `claimondo_finde_sachverstaendige` — wraps the live, anonymous
 *    /api/v1/sv-in-naehe endpoint (find Kfz-Sachverstaendige near a German PLZ).
 *  - Resource `claimondo://wissensbasis` — the live /llms-full.txt knowledge surface.
 *
 * No auth, no DB, no write operations. Two transports (env TRANSPORT):
 *  - 'stdio' (default) — local clients (Claude Desktop, Cline, Cursor).
 *  - 'http'  — Streamable HTTP (stateless JSON) for remote hosting (mcp.claimondo.de).
 *
 * Config: CLAIMONDO_API_BASE (default https://claimondo.de), TRANSPORT (stdio|http),
 * PORT (http only, default 4002). See README.
 */
import { setDefaultResultOrder } from 'node:dns'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import express from 'express'
import { z } from 'zod'
import { ClaimondoApiError, DEFAULT_API_BASE, fetchSvInNaehe, fetchWissensbasis, formatMarkdown } from './api.js'

// IPv4 bevorzugen: auf Netzen mit kaputtem/langsamem IPv6-Routing haengt ein fetch
// zu claimondo.de sonst am IPv6-Happy-Eyeballs, bevor IPv4 drankommt (im Live-Test
// reproduziert). 'ipv4first' faellt auf IPv6 zurueck, falls kein A-Record.
setDefaultResultOrder('ipv4first')

const API_BASE = process.env.CLAIMONDO_API_BASE ?? DEFAULT_API_BASE

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

/**
 * Baut einen frisch konfigurierten Server (Tool + Resource). Fuer stdio einmal,
 * fuer stateless HTTP pro Request — so gibt es keinen Cross-Request-State.
 */
function buildServer(): McpServer {
  const server = new McpServer({ name: 'claimondo-mcp-server', version: '1.0.0' })

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

  return server
}

/** Lokaler stdio-Transport (Claude Desktop / Cline / Cursor). */
async function runStdio(): Promise<void> {
  const server = buildServer()
  await server.connect(new StdioServerTransport())
  // stdout ist beim stdio-Transport fuer das JSON-RPC-Protokoll reserviert — nur stderr loggen.
  console.error(`claimondo-mcp-server läuft (stdio) · API-Base: ${API_BASE}`)
}

/** Remote Streamable-HTTP-Transport (stateless JSON) fuer mcp.claimondo.de. */
async function runHttp(): Promise<void> {
  const port = Number(process.env.PORT ?? 4002)
  const app = express()
  app.use(express.json({ limit: '1mb' }))

  // CORS: Browser-basierte MCP-Clients (Smithery-Verifier, MCP-Inspector, claude.ai-Connector)
  // rufen /mcp cross-origin auf und brauchen Access-Control-Header — sonst blockt der Browser
  // den Request (Smithery „Unable to verify server ID"). Der Server liefert ausschliesslich
  // anonyme Public-Read-Daten (wie /api/v1) -> Origin '*' ohne Credentials ist unbedenklich.
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version, Authorization')
    res.setHeader('Access-Control-Expose-Headers', 'Mcp-Session-Id, MCP-Protocol-Version')
    if (req.method === 'OPTIONS') {
      res.sendStatus(204)
      return
    }
    next()
  })

  app.get('/health', (_req, res) => {
    res.json({ ok: true, server: 'claimondo-mcp-server', transport: 'http', apiBase: API_BASE })
  })

  // Stateless: pro Request ein frischer Server + Transport (kein Session-State,
  // keine Request-ID-Kollisionen, einfach zu skalieren).
  app.post('/mcp', async (req, res) => {
    // Accept-Header normalisieren: der StreamableHTTP-Transport (via Hono getRequestListener)
    // verlangt strikt `application/json` UND `text/event-stream` (sonst 406 "Not Acceptable").
    // Hono baut die Web-Request aus req.rawHeaders (Array!), NICHT aus dem geparsten
    // req.headers — daher muss rawHeaders gepatcht werden. Viele Clients (Smithery-Scanner,
    // simple JSON-Clients) senden nur application/json -> Verify/Tool-Call schlaegt sonst fehl.
    // Wir nutzen enableJsonResponse (JSON-Antwort, kein SSE) -> beide zu akzeptieren ist
    // unkritisch und macht den Server interoperabel.
    const normalizedHeaders: string[] = []
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      if (req.rawHeaders[i].toLowerCase() !== 'accept') {
        normalizedHeaders.push(req.rawHeaders[i], req.rawHeaders[i + 1])
      }
    }
    normalizedHeaders.push('Accept', 'application/json, text/event-stream')
    req.rawHeaders = normalizedHeaders
    req.headers.accept = 'application/json, text/event-stream'
    const server = buildServer()
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    res.on('close', () => {
      void transport.close()
      void server.close()
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    } catch (err) {
      console.error('[mcp http] handler error:', err)
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null })
      }
    }
  })

  // Stateless JSON braucht nur POST — GET/DELETE sauber mit 405 ablehnen.
  const methodNotAllowed = (_req: express.Request, res: express.Response): void => {
    res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed — stateless: POST /mcp nutzen.' }, id: null })
  }
  app.get('/mcp', methodNotAllowed)
  app.delete('/mcp', methodNotAllowed)

  app.listen(port, () => {
    console.error(`claimondo-mcp-server läuft (http) · Port ${port} · POST /mcp · GET /health · API-Base: ${API_BASE}`)
  })
}

const transportMode = process.env.TRANSPORT ?? 'stdio'
;(transportMode === 'http' ? runHttp() : runStdio()).catch((err) => {
  console.error('Fataler Fehler beim Start:', err)
  process.exit(1)
})
