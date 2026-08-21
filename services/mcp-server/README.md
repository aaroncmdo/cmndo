# claimondo-mcp-server

Ein **MCP-Server** (Model Context Protocol), der Claimondos öffentliche `/api/v1`-API
als Tools für LLM-Clients (claude.ai / Claude Desktop, ChatGPT-Connectors, Cline,
Cursor, …) bereitstellt. Damit kann ein LLM **in-chat** den kompletten Einstieg
abbilden — Kfz-Sachverständige/Gutachter nach PLZ finden, buchbare Termine zeigen,
den Schadenersatzanspruch prüfen, Versichererbriefe erklären und — **nur nach
ausdrücklicher Einwilligung** — einen Schaden melden bzw. einen Rückruf anfordern.

Teil der GEO-MCP/Agentic-Funnel-Strecke. Die **Such-/Beratungs-Tools sind anonym +
read-only**; die **Schreib-Tools** (`claimondo_melde_schaden`, `claimondo_rueckruf`)
legen einen Lead an und schicken dem Kunden seinen persönlichen FlowLink **per
WhatsApp** (kein Link/keine PII zurück in den Chat) — mit Consent-Pflicht (Stage-1-
Einwilligung) und serverseitiger Write-Abuse-Härtung (s. Auth-Abschnitt). Hintergrund +
Roadmap: `docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md`.

## Tools

| Tool | Typ | Zweck |
|---|---|---|
| `claimondo_finde_sachverstaendige` | read | Anonymisierte Partner-Kfz-Sachverständige im Umkreis einer 5-stelligen PLZ (`plz`, `radius`=1–200). Nach Entfernung sortiert + Karten-Bild-URL + interaktive Karte. Wrappt `GET /api/v1/sv-in-naehe`. |
| `claimondo_finde_gutachter_termine` | read | **Buchbare** Gutachter MIT freien Slots nahe einer PLZ (`plz`, optional `wunschtermin`). Liefert `gutachter[].id` + `termine[]` als Buchungs-Handle — Vorstufe zu `melde_schaden`. Wrappt `GET /api/v1/gutachter-termine`. |
| `claimondo_pruefe_anspruch` | read | Prüft die Kostenübernahme-/Schadenersatz-Lage aus der `schuldfrage` (§ 249 BGB) + Gutachter-Funnel. Wrappt `GET /api/v1/pruefe-anspruch`. |
| `claimondo_decode_brief` | read | Erklärt einen Versicherer-/Gegner-Brief (`text`) in Klartext. Wrappt `POST /api/v1/decode-brief`. |
| `claimondo_melde_schaden` | **write** | Legt die Schadenmeldung an (Lead) und sendet dem Kunden seinen persönlichen FlowLink **per WhatsApp**. Pflicht: `schadenart, hergang, plz, name, telefon, einwilligung_erteilt`. Optional `sv_id`+`slot_start`/`slot_end` (gewählter Gutachter/Termin → weicher Hold / Reservierung). Wrappt `POST /api/v1/melde-schaden`. |
| `claimondo_rueckruf` | **write** | Fordert einen telefonischen Rückruf an (Lead + Dispatch-Task, **kein** Link im Chat). Pflicht: `name, telefon, einwilligung_erteilt`. Wrappt `POST /api/v1/rueckruf`. |

Die **Schreib-Tools** setzen `einwilligung_erteilt: true` (ausdrückliche Nutzer-Zustimmung)
voraus und geben **keinen** Link/keine PII in den Chat zurück — der Kontakt läuft über
WhatsApp/SMS. Alle Tools sind `openWorldHint: true`; die Read-Tools zusätzlich `readOnlyHint: true`.

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

**Update eines bereits laufenden Servers** (der Normalfall — bis 21.08.2026 stand hier nur der Erststart):

```bash
cd services/mcp-server && git pull && npm ci && npm run build
pm2 restart claimondo-mcp
```

> ⚠ **Dieser Dienst hängt an KEINER Pipeline.** Es gibt keinen `deploy-vps-mcp.yml` (anders als
> App, Marketing, autounfall und die fünf Cluster), und `tsconfig.json` der App führt `services`
> in `exclude` — die CI **baut und typecheckt ihn nicht**. Ein grüner CI-Lauf ist für diesen
> Server **kein Beleg**; ein Merge bringt ihn **nicht** live. Vor dem Restart deshalb lokal
> `npx tsc --noEmit && npm run build` fahren (beides muss exit 0 liefern).

**Verifikation nach dem Restart** — der Dienst antwortet auch dann noch mit dem alten Verhalten,
wenn `pm2 restart` still fehlschlägt; ein `pm2 status` allein beweist nichts:

```bash
node scripts/verify-deeplink-kette.mjs      # aus dem Repo-Root
```

Schicht 5 muss von `! MCP zeigt noch die Sammelkarte` auf `✓ MCP nennt Gutachter MIT Direktlink`
springen. Zum Gegenlesen ohne Skript:

```bash
curl -s -X POST https://mcp.claimondo.de/mcp \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"claimondo_finde_gutachter_termine","arguments":{"plz":"50670"}}}'
```

Erwartet: pro Gutachter eine Zeile `→ Termin bei <Name> buchen: …?plz=…&sv=…` und am Ende
`Alle Gutachter auf der Karte:` statt `Interaktive Karte / Buchung:`.

> **Auth & Abuse-Schutz:** der Endpoint ist **ohne Auth** (anonyme Public-API). Zusätzlich zum bestehenden Per-IP-Limit sind die **Schreib**-Pfade (`melde-schaden`/`rueckruf`) durch die serverseitige **Write-Abuse-Härtung** gedeckelt: globaler Circuit-Breaker (`MCP_WRITE_CAP_PER_HOUR`, Default 120) + Per-Telefon-Velocity (`MCP_WRITE_CAP_PER_PHONE_24H`, Default 3), beide fail-open — s. `src/lib/api-v1/write-abuse-guard.ts`. Nötig, weil externe KI-Calls von den Egress-IPs der Plattform kommen (Per-IP allein greift dort nicht). Per-Plattform-API-Keys (`mcp_api_keys`) bleiben Roadmap für authentifizierten/priorisierten Traffic.

## Testen

```bash
# End-to-end Smoke (lokaler Mock + echter MCP-Client, beide Transports stdio+http):
npm run build && npm run smoke

# Interaktiv mit dem offiziellen Inspector:
npx @modelcontextprotocol/inspector node dist/index.js

# Oder die zugrundeliegende API direkt (Server umgeht nichts davon):
curl -4 -s "https://claimondo.de/api/v1/sv-in-naehe?plz=50670&radius=30" | jq .anzahl_treffer
```

## Discovery & Registry-Listing

Der Server ist als **anonymer Remote-Endpoint** live: `https://mcp.claimondo.de/mcp` (Streamable HTTP) —
Such-/Beratungs-Tools read-only, Schreib-Tools consent-gated (s. o.). So binden ihn Clients/Verzeichnisse ein:

> **⚠️ Vor dem öffentlichen Listen (Rechts-Gate):** Eine öffentliche Registry-Listung (offizielle
> MCP-Registry, Smithery, mcp.so, OpenAI-App-Verzeichnis) macht den **buchungsfähigen** Connector breit
> auffindbar. Das berührt den RDG-/DSGVO-Vorbehalt (Rechtsdienstleistung, Drittland-LLM-Transfer) aus der
> Roadmap — vor dem Publish **produktseitig/rechtlich freigeben**. Die technische Basis (Consent-Pflicht +
> Write-Abuse-Guard + WhatsApp-Gate) ist da; die Freigabe ist eine Produkt-/Legal-Entscheidung. Der
> Connector ist auch **ohne** Listung voll nutzbar (URL direkt einbinden — s. claude.ai/ChatGPT unten).

### Claude.ai (Custom Connector) — direkt nutzbar
claude.ai → **Settings → Connectors → „Add custom connector"** → URL `https://mcp.claimondo.de/mcp`
(keine Auth). Danach im Chat aktivieren → Claude ruft `claimondo_finde_sachverstaendige`.
Verfügbar auf Pro/Max/Team/Enterprise; Claude **Desktop** kann denselben Remote-Connector.

### Offizielle MCP-Registry (`registry.modelcontextprotocol.io`)
Manifest: **`server.json`** (in diesem Verzeichnis, Schema `2025-12-11`, `remotes: streamable-http`).
Veröffentlichen via `mcp-publisher`-CLI — exakte Schritte: <https://modelcontextprotocol.io/registry/remote-servers>.
Kurz: Namespace `de.claimondo` per **DNS-TXT verifizieren** (analog zur ChatGPT-GPT-Domain-Verifikation,
TXT-Record bei IONOS), dann `server.json` publishen. Bei Versions-Updates `version` bumpen + erneut publishen.
Downstream-Verzeichnisse (Smithery, mcp.so, GitHub MCP Registry) indizieren zunehmend aus dieser Quelle.

### Smithery / mcp.so — als Remote-URL listen (Web-Submit)
**Kein `smithery.yaml`** in diesem Repo: Smithery's `smithery.yaml` ist für Server gedacht, die Smithery
selbst aus dem Source **baut/hostet** — das geht hier nicht (privates Monorepo-Unterverzeichnis, kein
npm-Package, eigener VPS-Host). Korrekt ist daher das Listen des **bereits laufenden Remote**:
- **Smithery** (smithery.ai) → „Add Server" / Connect → Remote-URL `https://mcp.claimondo.de/mcp`.
- **mcp.so** → Submit-Formular: Name „Claimondo — Kfz-Sachverständigen-Finder", URL
  `https://mcp.claimondo.de/mcp`, Beschreibung wie in `server.json`.

> Wenn Smithery den Server später wirklich **hosten** soll (statt nur zu listen), braucht der HTTP-Transport
> zusätzlich **CORS** auf `/mcp` und Smithery muss das Source-Package erreichen — beides ist hier bewusst
> nicht gemacht (der Remote läuft schon auf dem eigenen VPS).

## Roadmap

Reihenfolge + Begründung im Readiness-Doc (`docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md`):

- **Remote-Transport** (Streamable HTTP, `mcp.claimondo.de`) — ✅ **live**.
- **Schreib-Tools** (`claimondo_melde_schaden`, `claimondo_rueckruf`) — ✅ **live** (AAR-956), mit Stage-1-Consent + WhatsApp-Gate + Write-Abuse-Härtung. Der ursprüngliche RDG-/DSGVO-Vorbehalt (Drittland-Transfer, Rechtsdienstleistung) bleibt für die **öffentliche Registry-Listung** relevant — s. „Vor dem öffentlichen Listen" unten.
- **Per-Plattform-API-Keys** (`mcp_api_keys`) — offen, für authentifizierten/priorisierten Traffic.
- **Weitere Read-Tools** — `staedte/{slug}` (braucht `vw_stadt_aggregat`), `case-status/{token}`.

Der Server konsumiert ausschließlich das live `/api/v1/*`-Surface — **kein** `/api/public/*`-Fork.
