# GEO — MCP / Agentic-Funnel: Implementierungs-Handoff (2026-05-27)

> **Status: Foundation steht. Claimondo ist jetzt AI-findbar UND read-aufrufbar.**
> Erster echter Agentic-Konsument live: der **veroeffentlichte ChatGPT Custom GPT** (2026-05-26).
>
> Dieses Dokument fasst die komplette MCP/Agentic-Strecke zusammen — was live ist, wie es
> zusammenhaengt, wie man es betreibt, und was offen bleibt. Querverweise auf Plaene,
> Readiness-Docs, PRs und Code unten.

---

## 1 · TL;DR — was jetzt LIVE ist

| Baustein | Status | Adresse / Pfad |
|---|---|---|
| **Public Read-API** | 🟢 prod | `GET https://claimondo.de/api/v1/sv-in-naehe?plz=NNNNN` |
| **Statische Karten-PNG-API** | 🟢 prod | `GET https://claimondo.de/api/v1/karte/[plz]` |
| **OpenAPI-3.1-Spec** | 🟢 prod | `GET https://claimondo.de/api/v1/openapi.json` |
| **MCP-Server (remote, HTTPS)** | 🟢 live | `https://mcp.claimondo.de/mcp` (+ `/health`) |
| **ChatGPT Custom GPT** | 🟢 **veroeffentlicht** | GPT Store, „By claimondo.de" (Domain verifiziert) |
| **llms.txt / llms-full.txt** | 🟢 prod (+ Agentic-Announce in PR #1824) | `https://claimondo.de/llms.txt`, `/llms-full.txt` |

**Kernidee:** Ein LLM (ChatGPT, Claude, beliebiger MCP-Client) kann Claimondo jetzt **direkt
aufrufen** — Partner-Sachverstaendige zu einer PLZ finden, eine Karte einbetten, auf
Telefon-Buchung verweisen — ohne dass der Nutzer die Website oeffnet. Das ist die „agentic
layer" ueber der reinen GEO-Sichtbarkeit.

---

## 2 · Wie es zusammenhaengt (Architektur)

```
                  ┌─────────────────────────────────────────────┐
                  │  AI-Clients                                  │
                  │  • ChatGPT Custom GPT (Action)   ← live      │
                  │  • Claude.ai Connector            ← TODO     │
                  │  • beliebiger MCP-Client          ← offen    │
                  └───────────────┬─────────────────────────────┘
                                  │
            ┌─────────────────────┼───────────────────────────┐
            │ (a) GPT Action      │ (b) MCP-Protokoll          │
            ▼                     ▼                            │
   https://claimondo.de    https://mcp.claimondo.de/mcp        │
   /api/v1/openapi.json     (StreamableHTTP, stateless)        │
            │                     │                            │
            │   beide rufen ►     │  Tool: claimondo_finde_    │
            └─────────┬───────────┘        sachverstaendige    │
                      ▼                  Resource: claimondo:// │
        https://claimondo.de/api/v1/sv-in-naehe   wissensbasis │
        (anonyme Read-API, Rate-Limit 60/min/IP)               │
                      │                  ◄── /llms-full.txt ────┘
                      ▼
              Supabase (claims = SSoT) + Mapbox-Geocode
              + Modul-Cache (5min SV-Liste / 24h Geocode)
```

- **GPT-Pfad (a):** Der Custom GPT importiert `openapi.json` als Action und ruft `sv-in-naehe`
  direkt auf. Wissen = `llms-full.txt` als Knowledge-File hochgeladen.
- **MCP-Pfad (b):** `mcp.claimondo.de` exponiert dasselbe als MCP-Tool + eine Wissensbasis-
  Resource. Beide Pfade enden auf derselben Read-API → eine Quelle der Wahrheit.

---

## 3 · Code-Inventar

### Public Read-API (Next.js, `src/app/api/v1/`)
- `sv-in-naehe/route.ts` — Kern-Endpoint. Tier-1 (anonymisiertes Partner-Profil) + Tier-3
  (anonymer Standort-Pin). **Modul-Cache** (5 min SV-Liste, 24 h Geocode) → warm ~0,15 s
  statt 8–66 s. (PR #1791)
- `karte/[plz]/route.ts` — statisches Mapbox-PNG pro PLZ (zum Einbetten im Chat).
- `openapi.json/route.ts` — OpenAPI-3.1-Spec, `force-static`. **AI-sichtbar → echte Umlaute**
  (PR #1826), `svInNaehe`-`description` ≤ 300 Zeichen (ChatGPT-Actions-Limit).

### MCP-Server (eigenes Sub-Package, `services/mcp-server/`)
- `src/index.ts` — `buildServer()`-Factory, **Dual-Transport** via `process.env.TRANSPORT`
  (`stdio` lokal | `http` remote, StreamableHTTP **stateless**: `sessionIdGenerator:
  undefined, enableJsonResponse: true`). Port 4002, Endpoints `/mcp` + `/health`.
  `dns.setDefaultResultOrder('ipv4first')` ganz oben (sonst IPv6-Hang zu claimondo.de).
- `src/api.ts` — `fetchSvInNaehe` / `fetchWissensbasis` (Timeout **30 s** + AbortController +
  1 h Resource-Cache), `formatMarkdown`, `ClaimondoApiError`. `type SvTreffer`/`SvInNaeheResult`
  **muss `type` sein, nicht `interface`** (sonst kein Index-Signature-Match fuer
  `structuredContent`).
- `README.md` + `smoke.mjs` (Dual-Transport-Smoke, 14/14 grün).
- Aus dem Next-Build via `tsconfig exclude: ["services"]` (wie der Baileys-Worker).

### Maschinen-Oberflaeche (`src/app/`)
- `llms.txt/route.ts` + `llms-full.txt/route.ts` — Abschnitt „Agentic-API & MCP-Server"
  kuendigt den Read-API + MCP-Endpoint fuer AI-Crawler an (PR #1824).

---

## 4 · Live-Infrastruktur (VPS) — Betrieb

**Server:** `212.132.119.110` · **PM2-Prozess:** `claimondo-mcp` (Port 4002) ·
**Code:** `/opt/claimondo-mcp/source` @ Branch **`main`** (HEAD `36ceca7`, trackt `origin/main`) ·
**nginx:** `/etc/nginx/sites-available/mcp.claimondo.de` · **SSL:** Let's Encrypt (certbot).

> Beruehrt **nicht** prod (`claimondo-v2:3000`) / staging (`:3001`) / Baileys / autounfall-io.

### Update-Workflow (wenn neue MCP-Server-Commits auf main sind)
```bash
cd /opt/claimondo-mcp/source
git fetch origin main && git checkout -B main FETCH_HEAD
cd services/mcp-server && npm ci && npm run build
pm2 reload claimondo-mcp          # zero-downtime
curl -s http://127.0.0.1:4002/health
```
SSH-Helper (lokaler Claude, mit Aaron-Override): `scripts/vps-ssh-exec.py` —
`VPS_SSH_PASSWORD=... PYTHONIOENCODING=utf-8 python scripts/vps-ssh-exec.py '<cmd>'`
(60 s/Command; lange Ops via `nohup` + poll).

### Health-Check (extern)
```bash
curl -4 -s https://mcp.claimondo.de/health
# {"ok":true,"server":"claimondo-mcp-server","transport":"http","apiBase":"https://claimondo.de"}
```

---

## 5 · ChatGPT Custom GPT — Setup-Notizen (Aaron-Account)

- **Action:** `openapi.json` im GPT-Builder **per Paste** importiert (Import-from-URL hat das
  Schema nicht befuellt — JSON direkt einfuegen).
- **300-Zeichen-Limit:** ChatGPT-Actions lehnt Operation-`description` > 300 ab. `svInNaehe`
  war 310 → auf 231 gekuerzt (PR #1826).
- **Knowledge:** `llms-full.txt` als Datei hochgeladen (Entitaet, Mission, FAQ, Asset-Liste).
- **Domain verifiziert:** DNS-TXT auf `claimondo.de` → GPT zeigt „By claimondo.de" im Store.
- **Datenschutz:** Datenschutz-URL hinterlegt (Store-Pflicht).
- **Status:** ✅ **veroeffentlicht** 2026-05-26.

---

## 6 · PRs (diese Strecke)

| PR | Inhalt | Status |
|---|---|---|
| #1774 | Freshness-Phase-2 Readiness-Doc (data-blocked) | merged |
| #1776 | MCP-Funnel-Phase-1 Readiness-Doc | merged |
| #1784 | MCP-Server-Foundation (Tool + Wissensbasis-Resource, stdio) | merged |
| #1786 | Smoke + Tool-Timeout 30 s + `ipv4first` | merged |
| #1791 | `sv-in-naehe`-Modul-Cache (~100× warm) | merged |
| #1798 | StreamableHTTP-Transport (remote) | **merged → auf main** |
| **#1824** | llms.txt/-full.txt Agentic-Announcement | **offen (staging)** |
| **#1826** | openapi `svInNaehe`-desc ≤ 300 + ganze Spec auf Umlaute | **offen (staging)** |

---

## 7 · Gotchas / Lessons (für die nächste Session)

1. **node-fetch IPv6-Hang** zu `claimondo.de` → `dns.setDefaultResultOrder('ipv4first')` im
   Server / `curl -4` beim Testen.
2. **ChatGPT-Actions 300-Zeichen-Limit** auf Operation-`description`. Beim Erweitern der Spec
   im Blick behalten.
3. **OpenAPI-Import per Paste**, nicht per URL (Builder-Bug).
4. **`structuredContent`** braucht `type` (Index-Signature), nicht `interface`.
5. **openapi.json + llms.txt sind AI-/user-sichtbar** → echte Umlaute (Brand-Regel,
   AGENTS.md §Sprache). Code-Kommentare bleiben ASCII = egal.
6. **Perf-Backstop:** Tool **und** GPT-Action hängen an `sv-in-naehe`. Der Modul-Cache
   (#1791) hält prod schnell; ohne Cache lief der Endpoint unter Last 8–66 s (→ Tool-Timeout).
   Wenn die API mal wieder lahmt: zuerst prod-DB-Last prüfen, nicht den Client.
7. **`/api/v1/*` ist der kanonische Public-API-Pfad** — NICHT `/api/public/*`, wie der
   #5-Plan ursprünglich annahm.

---

## 8 · Cross-Referenzen

**Plan-Bundle (5 Pläne, 24.05.2026):** `marketing-strategy/research/mcp/` (README + alle 5) ·
Sicherheitskopie 4/5 in `docs/geo/`.
- #5 = `marketing-strategy/research/mcp/geo-mcp-agentic-funnel-2026-05-24.md` ← der Plan, den
  diese Strecke umsetzt.

**Readiness-Docs (warum Teile aufgeschoben wurden — VOR Neubau lesen):**
- `docs/geo/geo-mcp-funnel-phase-1-readiness-2026-05-26.md` (PR #1776) — Konventions-Fork,
  Write-API = Q3, Konsumenten-Gate.
- `docs/geo/geo-freshness-phase-2-readiness-2026-05-26.md` (PR #1774) — data-blocked
  (claims-Spalten-Mapping, 1/60 mit `schadenort_plz`).

**Vorläufer:** Doc 34 (Phase 0b, Public-Read-API + GPT-Setup-Handoff) — `docs/24.05.2026/`.

**Memory:** `project_geo_bundle_status.md` (Bundle-Status, was done/in-flight/premature ist).

**Messung:** `docs/geo/geo-messung-2026-05-24.md` — die 15 Prompts für den Re-Test (~07.06.).

---

## 9 · Offen / Next (priorisiert)

### Du (Account-Schritte — schalten weitere Konsumenten scharf)
- [ ] **Claude.ai-Connector:** `https://mcp.claimondo.de/mcp` als Custom-Connector hinzufügen.
- [ ] **MCP-Registries:** in Smithery / mcp.so listen → MCP-Clients finden den Server.
- [ ] **~07.06. Re-Test:** die 15 Prompts aus `geo-messung` manuell durch ChatGPT/Claude/
      Perplexity — misst, ob Sichtbarkeit **+ Agentic-Layer** wirken. **Gated** Freshness P2.

### Ich (baubar, kollisionsarm)
- [ ] **Entity-Anchoring:** `sameAs`-Links (Wikidata, Crunchbase, LinkedIn) ins
      Organization-JSON-LD (`src/lib/seo/jsonld.ts`) — macht die Entität für AI eindeutig
      (gegen „Klimondo"-Verwechslung). Code-Teil = ich; externe Profile/Wikidata = du.

### Q3 (gated — bewusst aufgeschoben)
- [ ] **MCP Write-API:** LLM meldet den Schaden in-chat via Magic-Link → echter Lead.
      Braucht **Rechts-/DSGVO-Review vorher** (RDG, Drittland-Datenfluss).
- [ ] **Freshness Phase 2** (dynamische Stadt-Sections) — sobald echtes Fall-Volumen da ist.
- [ ] Weitere MCP-Tools (`staedte`, `case-status`) wenn Daten/Write stehen.

---

## 10 · Definition-of-Done der 5 Pläne (Stand 2026-05-27)

| Plan | Status |
|---|---|
| #1 geo-messung | Kontext-Doc, keine Deliverables. Re-Test ~07.06. |
| #2 sprint-vergleich-und-wissen | ~85 % auf Feature-Branch, **nicht auf main** (andere Session). |
| #3 feeds-spec | ✅ komplett auf main (PR #1762). |
| #4 freshness-und-stadt-pages | Phase 1 ✅ auf main (PR #1766); **Phase 2 data-blocked**. |
| #5 mcp-agentic-funnel | ✅ **Read-Layer komplett + live** (API + MCP-Server + GPT). Write-Layer = Q3. |

---

*Geschrieben 2026-05-27. Beide offenen PRs (#1824, #1826) fließen via Merge-Watcher → staging →
mit nächstem staging→main + Deploy auf prod (dann zeigt prod-`openapi.json` Umlaute + ≤300).*
