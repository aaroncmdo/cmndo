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
| `TRANSPORT` | `stdio` | `stdio` (lokal) oder `http` (Remote, siehe unten). |
| `PORT` | `4002` | Nur bei `TRANSPORT=http` — Port des HTTP-Servers. |

## Remote / HTTP (mcp.claimondo.de)

Für entfernte Clients (Claude.ai-Connectors, Cursor-remote) läuft derselbe Server als
**Streamable-HTTP-Service** (stateless JSON — ein frischer Server pro Request, keine
Session, einfach skalierbar):

```bash
TRANSPORT=http PORT=4002 node dist/index.js
# -> POST http://<host>:4002/mcp   ·   GET http://<host>:4002/health
```

**Deploy auf dem VPS (Handoff für Aaron / VPS-Claude — lokaler Claude fasst den VPS nicht an):**

1. Als eigener PM2-Service starten (wie `services/baileys`):
   ```bash
   cd services/mcp-server && npm ci && npm run build
   TRANSPORT=http PORT=4002 pm2 start dist/index.js --name claimondo-mcp && pm2 save
   ```
2. **DNS:** `mcp.claimondo.de` braucht einen **expliziten A-Record** auf die VPS-IP — `*.claimondo.de` ist KEIN Wildcard (nur `*.staging` ist es).
3. **nginx** `mcp.claimondo.de` → `proxy_pass http://127.0.0.1:4002;` (POST `/mcp` + `/health`), SSL via certbot.

> **Auth:** aktuell **offen** — der Server liefert nur öffentliche Read-Daten (wie das public `/api/v1`). API-Key-Auth + Rate-Limiting pro Plattform sind Plan-Phase-1 (`mcp_api_keys`) und kommen erst bei echtem LLM-Traffic; bis dahin schützt die bestehende `/api/v1`-IP-Rate-Limitierung den Upstream.

## Testen

```bash
# End-to-end Smoke (lokaler Mock + echter MCP-Client, beide Transports stdio+http):
npm run build && npm run smoke

# Interaktiv mit dem offiziellen Inspector:
npx @modelcontextprotocol/inspector node dist/index.js

# Oder die zugrundeliegende API direkt (Server umgeht nichts davon):
curl -4 -s "https://claimondo.de/api/v1/sv-in-naehe?plz=50670&radius=30" | jq .anzahl_treffer
```

## Roadmap (Q3, NICHT in dieser Foundation)

Reihenfolge + Begründung im Readiness-Doc (`docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md`):

- **Remote-Transport** (Streamable HTTP) für `mcp.claimondo.de` — ✅ **gebaut** (`TRANSPORT=http`, siehe Abschnitt oben); fehlt nur noch VPS-Hosting + DNS.
- **Weitere Read-Tools** — `staedte/{slug}` (braucht das aktuell data-blockte `vw_stadt_aggregat`), `case-status/{token}` (braucht Phase-2-Write-Tokens).
- **Write-Tools** — `schaden_melden` / `termin_anfragen` via Magic-Link-Bestätigung. Erst nach Rechts-/DSGVO-Review (RDG, Drittland-Transfer).

Aktuell konsumiert der Server ausschließlich das bereits live `/api/v1/*`-Surface
(Doc 34 Phase 0b) — **kein** `/api/public/*`-Fork, **keine** `mcp_api_keys`-Tabelle.
