# GEO MCP Write-API (Phase 2) — Review-Paket & Business-Logic-Spec

**Stand:** 2026-06-18 · **Bezug:** `geo-mcp-agentic-implementation-handoff-2026-05-27.md` (Read-Layer live), `geo-mcp-funnel-phase-1-readiness-2026-05-26.md` (Phase-1-Gating), Original-Plan #5 `marketing-strategy/research/mcp/geo-mcp-agentic-funnel-2026-05-24.md`.

> **Zweck:** Vollständige Funktionsweise + Datenfluss + Consent-/RDG-Einordnung der geplanten **MCP-Write-API** („Schaden melden + Gutachter/Termin buchen direkt aus dem LLM-Chat"). Grundlage für (a) die Implementierung und (b) die rechtliche Abnahme (DSGVO/RDG).
>
> **Risiko-Träger:** Aaron (explizit). Die rechtlich kritischen Punkte sind durchdacht; §9 dokumentiert sie für die Akte / RA Genter — dieses Doc ist **kein Build-Gate**.

## 0 · Kern-Prinzip

Die Write-API ist **„Monika für externe LLMs"**. Sie baut **keine** neue Funnel-Logik, sondern **wrappt den bestehenden Gutachter-Finder/Embed-Funnel** als MCP-Tools. **Ein Funnel, nicht zwei** — dieselben Matching-, Termin-, Anfrage→Lead- und WhatsApp-FlowLink-Funktionen wie der Embed (Monika). Damit erbt die Strecke automatisch alle Embed-Verbesserungen (Dead-Pin-Fallback, Termin-Abbruch/Neu-Match, Rückruf) und die Review-Fläche bleibt klein.

---

## 1 · Der Flow (end-to-end)

| # | Phase | Wo | Was passiert |
|---|---|---|---|
| ① | **Intake** | Chat (LLM) | Das LLM fragt das Wesentliche ab: Schadenart, Hergang, PLZ, Fahrzeug-Basics. (Diese Angaben tippt der Nutzer ohnehin in den Chat.) |
| ② | **Gutachter + Termine** | MCP-Tool → unsere Funktionen | Tool `claimondo_finde_gutachter_termine(plz, schadenart?)` → wrappt `planeTerminOeffentlich()` → 1–3 leak-geschützte SV-Profile + Slot-Vorschläge (2+1-Verteilung) + Wunschtermin-Option. LLM zeigt sie, Nutzer wählt. |
| ③ | **Consent + Kontakt** | Chat (LLM) | **Stage-1-Einwilligung** (Verarbeitung Intake + WhatsApp-Kontakt + Drittland-Hinweis) + Kontakt (Name, WhatsApp-Nr). Siehe §5. |
| ④ | **Anfrage + Lead + Reservierung** | MCP-Tool → unsere Funktionen | Tool `claimondo_melde_schaden({…})` → `insertAnfrage()` (gfa) → `createLead()` → `issueCanonicalFlowLinkForAnfrage()`; Termin-Slot wird beim SV reserviert; Stage-1-Consent protokolliert. |
| ⑤ | **Handoff (WhatsApp-FlowLink)** | unser System → WhatsApp | `sendFlowLinkMultiChannel(leadId, 'whatsapp')` schickt dem Kunden seinen **FlowLink** → ab hier im DSGVO-kontrollierten `/flow` (Stage 2). Das LLM ist raus. |

Ab ⑤ läuft alles wie bei einem Embed-/Web-Lead: Dispatch, SV-Zuweisung, `/flow`-Qualifikation, Termin-Bestätigung, Vollmacht.

---

## 2 · Architektur — was die Tools wrappen

```
AI-Client (ChatGPT-GPT / Claude-Connector / MCP-Client)
        │  MCP-Protokoll (Tool-Call)
        ▼
mcp.claimondo.de  (services/mcp-server, Streamable-HTTP, stateless)
        │  HTTPS → öffentlicher API-Pfad
        ▼
/api/v1/*  (neue Write-Endpoints, analog zum read-only sv-in-naehe)
        │  wrappt bestehende Lib-Funktionen (KEIN Fork)
        ▼
┌─ planeTerminOeffentlich()  src/lib/sv-matching-modul/plane-termin-oeffentlich.ts
├─ insertAnfrage()           src/lib/embed/anfrage.ts  → gutachter_finder_anfragen
├─ createLead()              src/lib/leads/create-lead.ts
├─ issueCanonicalFlowLinkForAnfrage()  src/lib/start-link/issue-canonical-flowlink.ts
├─ reserviere() / bucheTerminFlow()    src/lib/termine/engine/writes.ts (TTL 15 min)
└─ sendFlowLinkMultiChannel()          src/app/dispatch/leads/[id]/_actions/flowlink.ts
```

Referenz-Orchestrierung existiert bereits: `POST /api/anfrage-from-lp` macht heute gfa-Insert + Lead-Konversion + FlowLink + Versand für die Cluster-LPs. Die Write-Tools rufen dieselbe Orchestrierung (als `/api/v1`-Endpoint), nicht eine zweite.

---

## 3 · Die MCP-Tools (Specs)

### Tool A — `claimondo_finde_gutachter_termine` (read-ish, kein Write)
- **Zweck:** Buchbare Partner-SVs + freie Termin-Slots zu einer PLZ.
- **Input:** `{ plz: string(5), schadenart?: string, wunschtermin?: ISO-date }`
- **Verarbeitung:** PLZ → Geocode (lat/lng) → `planeTerminOeffentlich({ lat, lng, wunschterminIso })`.
- **Output:** `OeffentlichesSvProfil[]` (anonymisiert, leak-geschützt: keine Score/ETA/Nachname) + Slot-Vorschläge + Wunschtermin-Option.
- **Side-effects:** keine (reserviert NICHT).
- **DSGVO:** nicht-identifizierend (PLZ + Schadenart). Wie das bestehende `sv-in-naehe`.

### Tool B — `claimondo_melde_schaden` (Write)
- **Zweck:** Erzeugt Anfrage → Lead, reserviert den Termin, sendet den FlowLink per WhatsApp.
- **Input:** `{ schadenart, hergang, plz, sv_id, termin_wahl: {slot_iso | wunschtermin}, kontakt: { name, telefon }, einwilligung: { ts: ISO, policy_version: string } }`
- **Verarbeitung (Orchestrierung):**
  1. `insertAnfrage()` → `gutachter_finder_anfragen` (mit `dsgvo_zustimmung_am = einwilligung.ts`, Quelle = `mcp_<plattform>`).
  2. `createLead()` → `leads` (source_channel = `mcp`).
  3. Termin-Slot reservieren (`reserviere()` / Engine) beim gewählten SV.
  4. `issueCanonicalFlowLinkForAnfrage()` → FlowLink (1 pro Lead).
  5. `consent_records`-Insert (Stage-1-Audit, §5).
  6. `sendFlowLinkMultiChannel(leadId, 'whatsapp')` → WhatsApp-Versand.
- **Output:** `{ ok: true, status: 'lead_angelegt', flowlink_versandt: 'whatsapp' }` (kein Token/keine PII zurück ins LLM — der Link geht per WhatsApp, nicht in den Chat).
- **Pflichtfeld:** `einwilligung` — ohne gültigen Stage-1-Consent kein Write.

### Tool C — `claimondo_fall_status` (optional, später)
- Status-Abfrage über einen Lead-/Flow-Token. **Aufgeschoben** bis der Write-Flow Tokens erzeugt + der Bedarf real ist (vgl. Readiness-Doc §2 „case-status erst mit Phase 2").

---

## 4 · Datenfluss & Drittland-Transfer

| Datum | Weg | PII | Verarbeiter |
|---|---|---|---|
| Schadenart, Hergang, PLZ | Nutzer → LLM (US) → Tool → Matching | schwach | OpenAI/Anthropic (US, Nutzer-Wahl) + Claimondo (EU) |
| SV-Wahl, Termin-Wahl | Nutzer → LLM → Tool | nein | — |
| **Name, WhatsApp-Nr** | Nutzer → LLM (US) → Tool → Versand | **ja** | LLM-Anbieter (US) + Claimondo (EU) + WhatsApp/Meta (BSP) |
| Stage-1-Consent | in-chat → `consent_records` + `anfragen.dsgvo_zustimmung_am` | — | Claimondo (EU) |
| FlowLink | Claimondo → WhatsApp → Nutzer | — | WhatsApp/Meta |
| Dokumente, Fall-Details (ZB1, Polizeibericht, Vollmacht) | Nutzer → `/flow` (EU) — **nicht** durchs LLM | ja | Claimondo (EU) |

**Minimierung:** Durch das externe LLM laufen nur Intake + Kontakt. Alles Tiefe (Dokumente, Fall-Verarbeitung) bleibt im `/flow` (EU) — Stage 2. Das ist die Datenminimierung nach Art. 5 (1)(c).

---

## 5 · Staged-Consent-Modell

Kein einzelner Consent-Moment, sondern **mehrere über den Flow verteilt** — jede Verarbeitungsstufe hat ihre Einwilligung in der passenden Granularität.

| Stage | Wo | Deckt ab | Mechanik (echt) |
|---|---|---|---|
| **0 — implizit** | ChatGPT/Claude | Der Nutzer tippt den Unfall ins LLM | Nutzer-Wahl; OpenAI/Anthropic-Terms (nicht unsere) |
| **1 — in-chat** | MCP-Tool B, vor dem Write | Intake-Verarbeitung + WhatsApp-Kontakt + Drittland-Hinweis | `einwilligung{ts, policy_version}` → `anfragen.dsgvo_zustimmung_am` **+** `consent_records`-Insert (`categories: ['mcp_intake','whatsapp_kontakt','drittland_llm']`, `policy_version`, `user_agent='mcp/<plattform>'`) |
| **2 — `/flow`** | Customer-Portal (EU) | Fall-Verarbeitung, Doku, SV-/Kanzlei-Einbindung | **existiert bereits**: Teilnahme (`flow_link_geoeffnet`/`status='geoeffnet'`) · Schuldfrage-Gate (`speichereQualiFlow()`) · **explizite Vollmacht/Signatur** (`/flow/signatur/[token]`) |

**Wichtiger Ist-Befund:** Es gibt **keine** `dsgvo_zustimmung_am`-Spalte auf `leads` — der `/flow`-Consent ist dezentral (Teilnahme + Schuldfrage + Signatur). Stage 1 setzt den Zeitstempel daher auf der **Anfrage** (`gutachter_finder_anfragen.dsgvo_zustimmung_am`) + den Audit-Eintrag in `consent_records`. Das ist konsistent mit dem heutigen Embed-Pfad (der genauso `consent_ts` setzt).

**Argument:** Stage 1 deckt nur den schmalen Durchs-LLM-Schritt; die juristisch schwere Einwilligung (Vollmacht) liegt in Stage 2 auf unserem Boden. Rechtsgrund Stage 1 = Art. 6 (1)(b) (vorvertraglich — der Nutzer hat die Buchung aktiv angefragt) + Art. 6 (1)(a) (Einwilligung für WhatsApp + Drittland).

---

## 6 · RDG-Einordnung

- **Gutachter-Vermittlung + Termin = Vermittlung.** Ein Kfz-Sachverständiger ist keine Rechtsberatung; das Matchen + Buchen eines Gutachters ist eine Dienstleistungs-Vermittlung, nicht erlaubnispflichtig nach RDG.
- **Wissensbasis-Resource = nur allgemeine Information.** Das LLM darf via `claimondo://wissensbasis` (§ 249 BGB, Wertminderung, SV-Kosten) **allgemein** informieren — **keine** individuelle Rechtsberatung („du solltest X einklagen"). → Leitplanke in Tool-Description + GPT-Instruktion (s. §9).
- **Downstream-Kanzlei (LexDrive):** Die spätere Anwalts-Einbindung passiert im `/flow` (Stage 2), nicht im LLM — eigener, bestehender Pfad.

---

## 7 · Missbrauchsschutz (Write-Endpoint)

Der Read-Endpoint ist anonym + IP-Rate-Limit. Ein Write-Endpoint kann das nicht 1:1 sein (Spam-Leads). Schutzschichten:
- **Natürliches Gate:** ohne valide WhatsApp-Nummer kommt kein FlowLink an → ein Fake-Lead ist tot (kein `flow_link_geoeffnet`). Selbstlimitierend.
- **Rate-Limit** pro IP/Plattform (wie read).
- **Plattform-Attribution** (`source_channel = mcp_<plattform>`) für Monitoring; `mcp_api_keys` erst, wenn mehrere Plattformen getrennte Quota brauchen (Readiness-Doc §2).
- **Stage-1-Consent als Pflichtfeld** — kein Consent, kein Write.

---

## 8 · Geerbte Edge-Cases (kein Neubau)

Alles via Embed-Funnel-Reuse abgedeckt:
- **Kein buchbarer SV** → Dead-Pin-Fallback / Rückruf (bestehend).
- **Termin-Reservierung** mit TTL (`RESERVIERUNG_TTL_MIN = 15`, Cron `expire_geblockte_termine`). ⚠️ Offen (§10): der WhatsApp→Confirm-Abstand kann > 15 min sein → Hold-Dauer für den MCP-Pfad prüfen.
- **Abbrechen / neuen Gutachter finden** im FlowLink → wird gerade von Session `819dab90` gebaut; MCP erbt es.
- **Rückruf statt Termin** → Monika-Rückruf (Session `cfefdf75`); als Alternativ-Pfad in Tool B denkbar.

---

## 9 · Offene Rechtsfragen (dokumentiert — für RA Genter, nicht gating)

1. **Gültigkeit der in-chat-Einwilligung (Stage 1):** Reicht eine im LLM-Chat protokollierte Einwilligung (Text-Version + Timestamp in `consent_records`) als wirksame DSGVO-Einwilligung für den schmalen Intake-/WhatsApp-Schritt? (Aaron: durchdacht, Risiko getragen.)
2. **Drittland-Transfer (Art. 44 ff.):** Intake + Kontakt laufen über das LLM (US). Deckung: Nutzer-Wahl (LLM-Terms) + Stage-1-Consent + Minimierung. AVV mit dem WhatsApp-BSP/Meta vorhanden?
3. **RDG-Linie:** Bestätigung, dass Gutachter-Vermittlung + allgemeine Wissensbasis-Info außerhalb des RDG liegen.
4. **WhatsApp-Erstkontakt:** Unaufgeforderte Geschäfts-Nachricht — durch Stage-1-Consent (ausdrückliche Zustimmung zum WhatsApp-Kontakt) gedeckt.

---

## 10 · Offene Implementierungs-Details + Koordination

- **Termin-Hold-Dauer** für den MCP-/WhatsApp-Pfad (15 min evtl. zu kurz) — mit Termin-Engine + Session `819dab90` (flow-termin-ändern) klären.
- **Write-Endpoint-Auth/Abuse** final festzurren (§7).
- **Tool C (`fall_status`)** — erst bei Bedarf.
- **Koordination:** Die Write-Tools sind **Konsument** des Embed-Funnels — NICHT forken. Aktive Sessions am selben Funnel: `cfefdf75` (Monika-Rückruf), `819dab90` (Flow-Termin-Abbruch/Neu-Match). Vor dem Bau abstimmen.
- **Gating bleibt:** Q3-Timing + messbarer LLM-Traffic (Readiness-Doc §3) — die Foundation (Read-Layer) ist live, der Write-Layer wartet bewusst auf reale Aufrufer.

---

*Geschrieben 2026-06-18. Business-Logic mit Aaron durchgegangen (Pure-Chat-Consent A + Staged-Model). Nächster Schritt nach rechtlicher Freigabe: 2 `/api/v1`-Write-Endpoints + 2 MCP-Tools, die die in §2 gelisteten Funktionen wrappen.*
