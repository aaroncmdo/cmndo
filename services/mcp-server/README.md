# claimondo-mcp-server

Ein **read-only MCP-Server** (Model Context Protocol), der Claimondos öffentliche
Read-API als Tool für LLM-Clients (Claude Desktop, Cline, Cursor, …) bereitstellt.
Damit kann ein LLM **in-chat** Kfz-Sachverständige in der Nähe einer deutschen PLZ
finden — ohne dass der Nutzer die Plattform öffnet.

Foundation-Stufe der GEO-MCP/Agentic-Funnel-Strecke (Plan #5, Phase-3-Vorgriff).
Bewusst minimal: **anonym, keine DB, keine Schreib-Operationen.** Hintergrund +
Roadmap: `docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md`.

## Tool

| Tool | Zweck |
|---|---|
| `claimondo_finde_sachverstaendige` | Partner-Kfz-Sachverständige im Umkreis einer 5-stelligen PLZ (`plz`, `radius`=1–200, `response_format`=markdown\|json). Wrappt das live `GET /api/v1/sv-in-naehe`. |

Antwort: nach Entfernung sortierte, **anonymisierte** Trefferliste + Karten-Bild-URL
+ interaktive Karte + Rückruf-Telefon. `readOnlyHint: true`, `openWorldHint: true`.

## Resource

| Resource (URI) | Zweck |
|---|---|
| `claimondo://wissensbasis` | Vollständige Wissens-Surface (`/llms-full.txt`, live) als Markdown: Ratgeber, Haftpflicht-Spokes, Versicherer-Brief-Decoder, BGH-Anker (§ 249 BGB, Wertminderung, SV-Kosten), Fakten, Stadt-Übersichten. 1-h-In-Memory-Cache. |

Damit kann der Client faktenbasierte Domänenfragen zur Kfz-Schadensregulierung
beantworten (analog zum „Knowledge"-Upload des ChatGPT-Custom-GPT) — nicht nur den
SV-Finder nutzen.

## Build

```bash
cd services/mcp-server
npm install
npm run build      # -> dist/index.js
```

Eigenständiges Sub-Package (eigene `node_modules`, eigene Deps). Vom Haupt-`tsconfig.json`
via `exclude: ["services"]` ausgenommen — bricht den Next-Build nicht.

## Lokal nutzen (stdio)

### Claude Desktop — `claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claimondo": {
      "command": "node",
      "args": ["/ABSOLUTER/PFAD/zu/services/mcp-server/dist/index.js"]
    }
  }
}
```

### Cline / Cursor — `mcp.json` (analog)

```json
{
  "mcpServers": {
    "claimondo": { "command": "node", "args": ["/ABS/PFAD/dist/index.js"] }
  }
}
```

### Env

| Variable | Default | Zweck |
|---|---|---|
| `CLAIMONDO_API_BASE` | `https://claimondo.de` | Auf einen Staging-Host zeigen lassen zum Testen. |

## Testen

```bash
# End-to-end Smoke (lokaler Mock + echter MCP-Client treibt den Server):
npm run build && npm run smoke

# Interaktiv mit dem offiziellen Inspector:
npx @modelcontextprotocol/inspector node dist/index.js

# Oder die zugrundeliegende API direkt (Server umgeht nichts davon):
curl -4 -s "https://claimondo.de/api/v1/sv-in-naehe?plz=50670&radius=30" | jq .anzahl_treffer
```

## Roadmap (Q3, NICHT in dieser Foundation)

Reihenfolge + Begründung im Readiness-Doc (`docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md`):

- **Remote-Transport** (Streamable HTTP) für `mcp.claimondo.de` — Transport-Swap (`StreamableHTTPServerTransport` + Express), Tool-Logik bleibt. Erst wenn Hosting steht.
- **Weitere Read-Tools** — `staedte/{slug}` (braucht das aktuell data-blockte `vw_stadt_aggregat`), `case-status/{token}` (braucht Phase-2-Write-Tokens).
- **Write-Tools** — `schaden_melden` / `termin_anfragen` via Magic-Link-Bestätigung. Erst nach Rechts-/DSGVO-Review (RDG, Drittland-Transfer).

Aktuell konsumiert der Server ausschließlich das bereits live `/api/v1/*`-Surface
(Doc 34 Phase 0b) — **kein** `/api/public/*`-Fork, **keine** `mcp_api_keys`-Tabelle.
