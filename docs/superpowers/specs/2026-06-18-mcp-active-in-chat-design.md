# MCP/API als aktives Tool im plain LLM-Chat — Design

**Datum:** 2026-06-18 · **Status:** approved (Aaron), in Umsetzung

## Ziel
Die Claimondo-Public-API (`/api/v1`) + der MCP-Server werden ein aktiv genutztes Werkzeug im *normalen* LLM-Chat (v.a. ChatGPT) — für den ganzen Funnel: Kfz-Gutachter + Termine finden → reservieren → FlowLink per WhatsApp. Anonym, ohne dass der Nutzer einen Connector einrichtet.

## Verifizierter Kontext (Server-Logs 2026-06-18)
- Alle großen KI-Crawler greifen massiv auf den GEO-Content zu: GPTBot 1.511 · ChatGPT-User 1.360 · ClaudeBot ~1.900 · OAI-SearchBot 944 · PerplexityBot 739 · anthropic-ai · Google-Extended.
- **ChatGPT-User ruft `/api/v1` live an (anonym, 7×)** — plain ChatGPT discovert + nutzt die public API OHNE Connector.
- **Lücke:** die public `openapi.json` beschreibt NUR `/api/v1/sv-in-naehe`. `gutachter-termine` (Slots) + `melde-schaden` (reservieren) fehlen → für LLMs unsichtbar → ChatGPT konnte SVs nur *finden*, nicht *buchen*.

## Ziel-Funnel (plain Chat)
1. Nutzer schildert Unfall / kaputtes Auto / Gutachter-Suche.
2. **Der LLM fragt ZUERST: WO steht das Fahrzeug? (PLZ des Besichtigungsorts)** — der Anker für alles Weitere (ohne PLZ keine SV-Suche, kein Besichtigungsort).
3. LLM → `GET /api/v1/gutachter-termine?plz=` → SVs + freie Slots.
4. Nutzer wählt SV + Slot; LLM erfragt Name + Telefon (WhatsApp) + Schadenart + Hergang + Einwilligung.
5. LLM → `POST /api/v1/melde-schaden` (sv_id + slot_start/slot_end + name + telefon + schadenart + hergang + consent).
6. → Lead + **Reservierung** + FlowLink per WhatsApp; Kunde schließt im `/flow` ab (Vollmacht / Stage-2).

## Bausteine
1. **Reservierung (PR A, Code):** `melde-schaden` ruft nach `issueCanonicalFlowLinkForAnfrage` → `bucheTerminFlow(issued.token, sv_id, slot_start, slot_end)` (token-basiert, idempotent, race-safe über Engine-EXCLUSION-Constraint) → setzt `gfa.termin_id`. Bei `'belegt'`/Fehler → **non-fatal**, der Soft-Hold (`wunschtermin` + `zugeordneter_sv_id`) bleibt als Async-Fallback. Tool + Endpoint bekommen `slot_start`/`slot_end`. Response um `reserviert: boolean` ergänzt.
2. **Public-OpenAPI-Erweiterung (PR B, Code):** `gutachter-termine` + `melde-schaden` in die `openapi.json` → für LLMs discoverbar. **Der Discovery-Kern.**
3. **MCP-Server-`instructions` + Trigger-Beschreibungen (PR B, Code, mcp-server):** Server-Prompt „Nutze diese Tools bei Unfall / kaputtem Auto / Gutachter-Suche / Schaden in DE; **frage zuerst die PLZ, wo das Auto steht**". Tool-Beschreibungen mit Trigger- + Location-Hinweis.
4. **llms.txt-Anreicherung (PR B):** Crawler-Hinweis „SVs + Termine finden UND buchen via /api/v1".
5. **Abuse-Härtung public Write:** Consent-Gate (`einwilligung.zugestimmt: literal true`) + Rate-Limit (10/min/IP) + `source='mcp'`-Tagging + RDG-Hinweis in der Beschreibung. Stage-2-Vollmacht bleibt zwingend im `/flow`. Risikoklasse = Embed-Webhook (bewusst, Aaron trägt's).
6. **Formale Listings (Aaron/Account):** OpenAI-Apps-Directory + Anthropic-Connector-Directory submitten; MCP-Registries (`de.claimondo/sv-finder`, Smithery) aktuell halten.
7. **GEO frisch halten:** läuft stark (Logs).

## Sicherheit / Recht
- Public anonymer Write: gemildert durch Consent-Gate + Rate-Limit + `source='mcp'`-Tagging; konsistent mit dem bestehenden Embed-Webhook-Risiko.
- Consent: in-chat Stage-1 (das LLM holt + bestätigt → `consent_ts` → `dsgvo_zustimmung_am` + `consent_records`-Audit); Stage-2 (Vollmacht/Schuldfrage/Signatur) zwingend im `/flow`.
- RDG: Vermittlung, keine Rechtsberatung — Hinweis in OpenAPI/Tool-Beschreibung.
- Kein Token/keine PII zurück ins LLM; der FlowLink geht per WhatsApp.

## Bau-Reihenfolge
- **PR A** = Baustein 1 (Reservierung) — `kitta/mcp-reservierung`.
- **PR B** = Bausteine 2 + 3 + 4 (+ 5-Härtung).
- Deploy: staging→main (Merge-Session) + mcp-server-git-sync.
- Dann 6 (Aaron) + 7 (laufend).

## Out of Scope
- Kein „automatisch in JEDEM ChatGPT-Fenster ohne Discovery" — das erfordert OpenAI-Apps-Directory-Approval (Baustein 6).

## Referenzen
- Inc-1 (read `claimondo_finde_gutachter_termine`) = #2986 (live). Inc-2 (write `claimondo_melde_schaden`) = #2991 (live, E2E-verifiziert).
- Funnel-Reuse-Marker: `COORDINATION-mcp-write-api-funnel-reuse.md`. GEO-Bundle: `marketing-strategy/research/mcp` + `docs/geo`.
- `bucheTerminFlow`: `src/app/flow/[token]/self-service-actions.ts:173`.
