# GEO MCP/Agentic-Funnel Phase 1 — Readiness & Reconciliation

**Stand:** 26.05.2026 · **Autor:** Claude-Session `mcp-funnel-p1`
**Bezug:** `marketing-strategy/research/mcp/geo-mcp-agentic-funnel-2026-05-24.md` (Original-Plan)

---

## TL;DR — Verdikt

**MCP-Funnel Phase 1 jetzt NICHT „as written" bauen.** Drei Gründe:

1. **Die Foundation existiert bereits** — unter einem anderen Pfad als der Plan annimmt. „Doc 34 Phase 0b" hat eine funktionierende, anonyme **Public-Read-API unter `/api/v1/*`** geliefert (commits `0411005c`, `90beb526`). Der Plan beschreibt `/api/public/*` + eine zweite OpenAPI + eine `mcp_api_keys`-Tabelle — das würde **Pfad, Auth und Rate-Limit forken**.
2. **Net-new Stücke sind blockiert oder marginal** (siehe §2).
3. **Q3-Timing + null Konsumenten.** Der Plan selbst terminiert MCP auf Aug–Okt 2026. Heute zitiert kein LLM Claimondo (GEO-Sichtbarkeit ~0, siehe `geo-messung`), d.h. eine API-Key-Verwaltung + Admin-UI wäre spekulative Infra ohne Aufrufer.

Wenn Phase 1 dran ist (Q3): **`/api/v1/*` erweitern**, nicht `/api/public/*` forken.

> **Nachtrag 26.05.:** Aaron hat die *eine* Read-only-Foundation freigegeben — gebaut als **`services/mcp-server/`** (`claimondo-mcp-server`, stdio, ein Tool `claimondo_finde_sachverstaendige`), das das live `/api/v1/sv-in-naehe` als MCP-Tool wrappt. Damit ist Claimondo aus Claude/Cline/Cursor heraus nutzbar (nicht nur via ChatGPT-Actions). Bewusst auf Basis von `/api/v1` (kein `/api/public`-Fork), read-only, keine DB, keine Write-Operationen. Alles Übrige in diesem Doc bleibt aufgeschoben.

---

## 1 · Ist-Stand `/api/v1/*` (Doc 34 Phase 0b, live auf staging+main)

| Route | Was | Auth / Cache |
|---|---|---|
| `GET /api/v1/sv-in-naehe?plz=&radius=` | Anonymisierte SV-Liste (Tier 1 Profil / Tier 3 Pin) im Umkreis + `karte_url` + Handoff-Links + Brand-`_meta` | Anonym, CORS `*`, In-Process-IP-Rate-Limit 60/min; `max-age=300` |
| `GET /api/v1/karte/[plz]` (`.png`) | Statisches Karten-PNG zur PLZ (Chat-Einbettung) | wie oben |
| `GET /api/v1/openapi.json` | Statische OpenAPI 3.1-Spec, dokumentiert `sv-in-naehe`. ChatGPT-GPT-Builder „Import from URL" lädt sie direkt. | `force-static`, CORS `*`, `max-age=3600` |

Proxy: `/api/v1` + `.json` sind vom Auth-Proxy-Matcher ausgenommen → öffentlich erreichbar (siehe `src/proxy.ts`). Rate-Limit ist bewusst **In-Process** (PM2-Single-Process), kein DB-Cost auf dem heißen Public-Endpoint.

**Schon erfüllt vom Plan-Phase-1:** Read-only Public-API ✓, OpenAPI-Spec ✓, anonym/DSGVO-trivial ✓, ChatGPT-Custom-GPT-Konsum ✓ (Handoff-Doc `docs/24.05.2026/doc34-phase-0b2-custom-gpt.md`).

---

## 2 · Plan vs. Realität — Korrekturen für den Q3-Build

| Plan (Phase 1) | Realität / korrigierter Weg |
|---|---|
| `/api/public/*` als neue Pfad-Konvention | **`/api/v1/*` existiert bereits** als Public-Pfad. Neue Endpoints dort einhängen, sonst zwei parallele Public-API-Bäume. |
| `/openapi.yaml` + `/openapi.json` neu | `/api/v1/openapi.json` existiert. **Erweitern** (neue Pfade ergänzen), nicht zweite Spec anlegen. |
| `mcp_api_keys`-Tabelle + Admin-UI + DB-Rate-Limit | Bestehende Endpoints nutzen **In-Process-IP-Rate-Limit**, kein API-Key. API-Keys erst, wenn echte Attribution/Quota pro Plattform gebraucht wird (= wenn LLM-Traffic existiert). Bis dahin: Over-Engineering. |
| `/api/public/ersteinschaetzung` (wrappt „bestehende KI-Bewertung") | `/ersteinschaetzung` ist nur eine `page.tsx` — **keine wiederverwendbare Lib-Funktion**. Voraussetzung: Bewertungs-Logik erst als `src/lib/*`-Funktion extrahieren, dann als Endpoint wrappen. |
| `/api/public/staedte/{slug}` mit `partnerSVs`/`verfuegbarkeit` | Verfügbarkeits-/Aggregat-Felder brauchen `vw_stadt_aggregat` — **die View ist data-blocked** (siehe `geo-freshness-phase-2-readiness-2026-05-26.md`: 1/60 claims mit PLZ). Statische Felder (`name`, `bundesland`, Gericht, Honorarspanne, `stadtPageUrl`) ließen sich sofort aus `staedte.ts` liefern; der Verfügbarkeits-Teil wartet auf Daten. |
| `/.well-known/ai-plugin.json` | Deprecated ChatGPT-Plugin-Standard; `openapi.json` deckt den GPT-Import bereits. Niedriger Wert, optional. Falls gebaut: Proxy-Exemption nötig (wie bei `openapi.json`). |
| `/api/public/case-status/{token}` | Sinnvoll **erst mit Phase 2** (Write-API erzeugt die Tokens). Ohne Write-Flow gibt es keine Case-Tokens zum Abfragen. |

---

## 3 · Definition of Ready (Build-Gate Phase 1)

- [ ] Q3-Fenster erreicht (Plan: Aug 2026) **oder** messbarer LLM-Traffic/Sichtbarkeit (4-/8-Wochen-Re-Test zeigt Citations > 0).
- [ ] Entscheidung dokumentiert: neue Endpoints unter `/api/v1/*` (empfohlen) vs. bewusster Schnitt zu `/api/public/*`.
- [ ] Für `/staedte/{slug}`-Verfügbarkeit: `vw_stadt_aggregat` existiert + hat Daten (Freshness Phase 2, aktuell selbst data-blocked).
- [ ] Für `/ersteinschaetzung`: KI-Bewertungs-Logik als testbare Lib-Funktion extrahiert.
- [ ] API-Key-Bedarf real (mehrere Plattformen mit getrennter Quota/Attribution) — erst dann `mcp_api_keys` + Admin-UI.

---

## 4 · Der eine defensible Mini-Schritt (falls trotzdem jetzt gewünscht)

`/.well-known/ai-plugin.json` → zeigt auf das bestehende `/api/v1/openapi.json`. Cheap, additiv, kein DB, keine Daten-Abhängigkeit, kein Konventions-Fork. Braucht eine Proxy-Exemption (`src/proxy.ts`) analog zur `openapi.json`. **Wert ist gering** (deprecated Standard, GPT-Import läuft schon über `openapi.json`) — daher bewusst nicht ungefragt gebaut.

---

## Bezug

- **Phase 2 (#4) Readiness:** `docs/geo/geo-freshness-phase-2-readiness-2026-05-26.md` (`vw_stadt_aggregat`-Blocker — Voraussetzung für `/staedte/{slug}`-Verfügbarkeit)
- **Phase 0b (live):** Doc 34 — `0411005c` (sv-in-naehe), `90beb526` (openapi + Custom-GPT-Handoff)
- **Original-Plan:** `marketing-strategy/research/mcp/geo-mcp-agentic-funnel-2026-05-24.md` (Phase 2 Write-API + Phase 3 MCP-Server bleiben Q3, unverändert gültig)
