# Partner-CSV Smart-Mapping (④) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`).

**Goal:** Beim CSV-Import schlägt ein LLM die Spalten-Zuordnung vor (auch bei ungewöhnlich/falsch benannten Headern), und der Nutzer kann sie in einem Mapping-Panel überschreiben — deckt „KI ODER manuell" in einem.

**Architecture:** Neue Server-Action `schlageCsvMappingVor(header, sampleRows)` (Anthropic, JSON-Mapping-Output, Heuristik-Fallback). `mapCsvZuLeads` wird um einen expliziten Mapping-Modus erweitert (`mapCsvMitMapping`). Die `ImportCsvModal` bekommt ein Mapping-Panel (Dropdowns je Header, KI-vorbelegt, live-Vorschau).

**Tech Stack:** Next.js Server-Actions, `@anthropic-ai/sdk`, `@/lib/ai/models` (`AI_MODELS`), `@/lib/ai/usage-log` (`logAiUsage`), vitest. Muster-Referenz für den LLM-Call: `src/app/api/makler/copilot/route.ts` (Anthropic-Init + AI_MODELS + logAiUsage).

**Branch:** `kitta/partner-csv-mapping`, stacked auf `kitta/partner-lead-geocoding` (⑤). Rebase auf staging, sobald ⑤ (#3946) gemergt.

## Global Constraints
- Server-Actions `{ ok, error? }`, kein throw; `revalidatePath` bei Writes.
- Auth-Guard `requireVertriebStaff()` (existiert in partner-leads/actions.ts) für die neue Action.
- LLM-Fehler/kein API-Key → **deterministischer Heuristik-Fallback** (bestehende `HEADER_ALIASE`), nie hart scheitern.
- `firma` bleibt Pflicht-Zielfeld; Import erst nach Bestätigung; Adressen laufen weiter durch ⑤-Geocode (unverändert).
- Umlaute in UI-Strings. Ratchets 0-neu. `csv-import.ts` bleibt pure (kein 'server-only').

**Ziel-Felder (Mapping-Targets):** `firma` (Pflicht), `email`, `telefon`, `ansprechpartner_vorname`, `ansprechpartner_nachname`, `plz`, `ort`, `ignorieren`. (rollen_details.datNr/ihk bleiben Heuristik-only — kein LLM-Target im MVP.)

---

### Task 1: `mapCsvMitMapping` — expliziter Mapping-Modus (Refactor, pure)

**Files:** Modify `src/lib/partner/csv-import.ts` · Test `src/lib/partner/__tests__/csv-import.test.ts`

**Interfaces (produce):**
```ts
export type CsvZielFeld = 'firma' | 'email' | 'telefon' | 'ansprechpartner_vorname' | 'ansprechpartner_nachname' | 'plz' | 'ort' | 'ignorieren'
export const CSV_ZIEL_FELDER: readonly CsvZielFeld[]
// mapping: Spaltenindex → Zielfeld (oder 'ignorieren'); wendet ein EXPLIZITES Mapping an (statt Auto-Heuristik).
export function mapCsvMitMapping(rows: string[][], mapping: CsvZielFeld[]): MapCsvResult
// Heuristik-Vorschlag als Fallback (Spaltenindex → Zielfeld), reuse HEADER_ALIASE:
export function heuristischesMapping(header: string[]): CsvZielFeld[]
```

- [ ] **Step 1: Failing tests** — `mapCsvMitMapping` (explizites Mapping → PartnerCsvLead, firma-Pflicht) + `heuristischesMapping` (Header „Firma"/„E-Mail" → firma/email, unbekannt → 'ignorieren').
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implementierung** — `CSV_ZIEL_FELDER`-Const; `heuristischesMapping(header)` = `header.map(h => aliasZuZielFeld(HEADER_ALIASE[normHeader(h)]) ?? 'ignorieren')` (mappt die bestehenden Ziel-Aliase auf `CsvZielFeld`, `rollen_details.*` → 'ignorieren'); `mapCsvMitMapping(rows, mapping)` = die bestehende Switch-Logik aus `mapCsvZuLeads`, aber getrieben vom übergebenen `mapping` statt der Auto-Heuristik. `mapCsvZuLeads` bleibt (ruft intern `mapCsvMitMapping(rows, heuristischesMapping(header))` → DRY, Verhalten unverändert).
- [ ] **Step 4: Run → PASS** (`npx vitest run src/lib/partner/__tests__/csv-import.test.ts`).
- [ ] **Step 5: Commit** `feat(partner-crm): csv-import expliziter Mapping-Modus (mapCsvMitMapping + heuristischesMapping)`

---

### Task 2: `schlageCsvMappingVor` — LLM-Mapping-Vorschlag (Server-Action)

**Files:** Modify `src/app/admin/partner-leads/actions.ts` · Test `src/lib/partner/__tests__/csv-mapping-llm.test.ts` (falls die Parse-Logik ausgelagert wird — s.u.)

**Interfaces (produce):**
```ts
export async function schlageCsvMappingVor(
  header: string[], sampleRows: string[][],
): Promise<{ ok: true; mapping: CsvZielFeld[]; quelle: 'ki' | 'heuristik' } | { ok: false; error: string }>
```

- [ ] **Step 1:** Reine Parse-Helper in `csv-import.ts` auslagern (testbar ohne LLM): `export function parseLlmMapping(json: string, header: string[]): CsvZielFeld[] | null` — validiert das LLM-JSON (`{ "<header>": "<zielfeld>" }`) gegen `CSV_ZIEL_FELDER` + Header-Länge, unbekannt → 'ignorieren'. Failing test dafür (valides JSON, kaputtes JSON → null, unbekanntes Feld → 'ignorieren').
- [ ] **Step 2: Run → FAIL → implement `parseLlmMapping` → PASS.**
- [ ] **Step 3:** `schlageCsvMappingVor` in `actions.ts`:
  - `requireVertriebStaff`-Guard.
  - Kein `ANTHROPIC_API_KEY` → `{ ok: true, mapping: heuristischesMapping(header), quelle: 'heuristik' }`.
  - Sonst: `new Anthropic({ apiKey })`; `anthropic.messages.create({ model: AI_MODELS.<schnelles Modell — prüf src/lib/ai/models.ts, z.B. haiku/sonnet>, max_tokens: 1024, system: <Mapping-Instruktion: ordne jeden CSV-Header genau einem Zielfeld aus CSV_ZIEL_FELDER zu; unklar → ignorieren; NUR JSON zurück>, messages: [{ role:'user', content: 'Header: '+JSON.stringify(header)+'\nBeispielzeilen: '+JSON.stringify(sampleRows.slice(0,5)) }] })`.
  - `parseLlmMapping(<text aus resp.content>, header)` → bei null Fallback `heuristischesMapping`. `logAiUsage(...)` (Muster aus makler/copilot). try/catch → Heuristik-Fallback.
  - Return `{ ok:true, mapping, quelle:'ki' }`.
- [ ] **Step 4:** tsc clean · `npm run build` grün.
- [ ] **Step 5: Commit** `feat(partner-crm): schlageCsvMappingVor — LLM-Mapping-Vorschlag + Heuristik-Fallback`

---

### Task 3: ImportCsvModal — Mapping-Panel

**Files:** Modify `src/app/admin/partner-leads/PartnerLeadsClient.tsx` (`ImportCsvModal`)

- [ ] **Step 1:** Nach `parseCsv` (in `handleDatei`) den State um `header`, `rows`, `mapping: CsvZielFeld[]` erweitern. `schlageCsvMappingVor(header, rows)` aufrufen (in `startTransition`), `mapping` + `quelle` setzen (Fallback `heuristischesMapping` falls Action `!ok`).
- [ ] **Step 2:** **Mapping-Panel** rendern: je CSV-Header eine Zeile mit dem Header-Text + `SelectField` (Optionen = `CSV_ZIEL_FELDER`, deutsche Labels; „ignorieren" default für unklare). `onChange` aktualisiert `mapping[i]`. Badge „KI-Vorschlag" wenn `quelle==='ki'`. Hinweis wenn kein `firma`-Feld gemappt ist (Import-Button disabled).
- [ ] **Step 3:** Live-Vorschau: `mapCsvMitMapping(rows, mapping)` → erste 5 valide Zeilen in der bestehenden Vorschau-Tabelle (statt `mapCsvZuLeads`). Import-Button ruft `importCsvLeads(rolle, vorschau.valide)` (unverändert — Geocode läuft dort schon via ⑤).
- [ ] **Step 4:** `npm run build` grün; 4 Ratchets `--ratchet` 0-neu (Mapping-Panel nutzt `SelectField`/`Table`/Tokens — kein neues handrolled Markup).
- [ ] **Step 5: Commit** `feat(partner-crm): CSV-Mapping-Panel (KI-vorbelegt + manuell überschreibbar) in ImportCsvModal`

---

### Task 4: Verify + PR
- [ ] `npx vitest run src/lib/partner` grün · `npm run build` grün · 4 Ratchets 0-neu.
- [ ] Final Whole-Branch-Review (opus).
- [ ] PR base=staging (bzw. stacked auf ⑤ bis #3946 merged): „feat(partner-crm): CSV Smart-Mapping (④) — KI-Vorschlag + manuelles Mapping-Panel".

## Self-Review
- **Spec-Coverage:** ④ = KI-Vorschlag (Task 2) + manuelles Override (Task 3 Panel) + expliziter Mapping-Apply (Task 1). Fallback deterministisch. ✓
- **Zur Implementierzeit prüfen:** exakter `AI_MODELS`-Key (schnelles Modell) in `src/lib/ai/models.ts`; `logAiUsage`-Signatur aus makler/copilot.
- **DRY:** `mapCsvZuLeads` delegiert an `mapCsvMitMapping(heuristischesMapping(...))` — keine Duplikation.

## Follow-on
- ③ Onboarding-Termine (eigener Plan, nach ④).
