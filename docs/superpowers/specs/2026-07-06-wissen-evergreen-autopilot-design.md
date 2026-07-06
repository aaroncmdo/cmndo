# Wissen-Evergreen-Autopilot (B2B) — Design

**Datum:** 2026-07-06
**Branch:** `kitta/wissen-evergreen-autopilot` (off `origin/staging`)
**Autor-Session:** (aar-956-Session, isolierter Worktree)

## Problem (Ground-Truth-Diagnose 06.07.)

Die B2B-Content-Pipeline (`/api/cron/wissen-pipeline-b2b`, `runB2BPipeline`) läuft **täglich um 04:00** und crawlt sauber — Prod-DB zeigt frische Crawl-Themen für 04./05./06.07. Aber seit dem 03.07. (1 auto-publizierter Crawl-Artikel) kommt **0 neuer Artikel/Tag**:

- Jedes gecrawlte Thema seit 03.07. wird **korrekt** als themenfremd `abgelehnt` (20× abgelehnt, 0 stecken fest, kein Bug).
- Die 6 Feeds liefern strukturell **nicht** täglich schadensrelevante Inhalte: kfz-betrieb = Branchen-/Handels-News (Neuwagen, Personalien), KÜS = Motorsport, Rechtslupe = *allgemeiner* Jura-Feed (heute: Arbeits-/Straf-/Prozessrecht), Versicherungsbote = Lebens-/Rentenversicherung. Kfz-Schaden/Verkehrsrecht ist dort die Ausnahme.

**Fazit:** Kein Code-Bug — ein **Content-Supply-Problem**. Der Crawl-only-Ansatz kann „täglich 2–3 Artikel" nicht aus diesen Feeds decken.

## Ziel

„Jeden Tag" garantiert Artikel — **KI-autonom** (Aaron muss nicht kuratieren), mit **optionalem** manuellem Vorschlags-Inlet (Aaron *kann* Themen einwerfen/vetoen, muss aber nie). Qualität + Rechtssicherheit über die **bereits live bewiesene** Auto-Publish-Gate.

## Zentrale Erkenntnis: das Schema kennt das schon

- `wissen_themen.quelle` erlaubt bereits **`ai_gap`** (KI-vorgeschlagen zum Lückenfüllen) + **`manuell`** (Aarons Vorschläge) + `crawl`.
- `wissen_themen.status` hat `vorgeschlagen`/`freigegeben`/`abgelehnt`/`entwurf_erstellt`.
- Der manuelle Inlet existiert schon: `admin/wissen-artikel/ThemaForm.tsx` → `quelle='manuell'` (der 02.07-Artikel nutzte ihn).
- **Einzige DB-Lücke:** `wissen_artikel.quelle` erlaubt nur `redaktion|crawl` → additiv um **`ai_gap`** erweitern.

Wir *aktivieren* den designten-aber-dormanten `ai_gap`-Pfad (war „Phase 2" der ursprünglichen AI-Redaktion), statt etwas Neues zu erfinden.

## Architektur

Alles fließt durch die bestehende Maschine: `generateArtikelDraft(_, 'b2b')` → `validateForAutoPublish` → Insert `wissen_artikel` → Dedup via `entwurf_erstellt`. **Crawl-Pfad bleibt byte-identisch.**

### 1. Themen-Planer — `src/lib/wissen/propose.ts` (NEU)

Der Motor der Autonomie.

- `buildProposePrompt(covered)` — System-Prompt: „Themen-Planer für den B2B-Fach-Feed (Kfz-Schadenregulierung). Domäne: Schadengutachten, Fahrzeugbewertung (WBW/Restwert/Wertminderung), Unfallregulierung, Verkehrs-/Schadenrecht (§§ BGB/StVG), Werkstatt-/Kasko-Praxis, SV-Berufspraxis. NICHT: Motorsport, Neuwagen/Händler-News, Personalien, Lebens-/Rentenversicherung, themenfremdes Recht." Bekommt die abgedeckten Titel/Keywords und muss ausweichen (long-tail).
- `parseProposedTopics(raw): {ok,data}|{ok:false,error}` — **pure**, tolerant (Fences/Einleitung), validiert Array-Shape `{titel, kurzbrief, primary_keyword, cluster, artikel_typ?, tags?}`. Spiegelt die Robustheit von `parseDraft`.
- `dedupeTopics(proposed, coveredKeywords): Topic[]` — **pure**, droppt Vorschläge, deren normalisiertes `primary_keyword` (oder Slug des Titels) bereits abgedeckt/gequeued ist.
- `proposeGapTopics(count, {avoidTitles, avoidKeywords}): Promise<{ok,data}|{ok:false,error}>` — Anthropic-Call (Modell = `WISSEN_MODEL`), gibt deduplizierte Topics zurück. Bei API-Fehler `{ok:false}` (kein throw).

### 2. Pipeline — `src/lib/wissen/pipeline.ts` (UMBAU Phase 2/3, getiert + Boden)

Neue Konstanten: `DAILY_MIN=2` (Boden), `DAILY_MAX=3` (= altes `GENERATE_LIMIT`), `EVERGREEN_BUFFER=6` (Vorrats-Queue voraus), `PROPOSE_BATCH=8`. `CRAWL_CAP=12`/`PER_SOURCE_CAP=3`/`ATTEMPT_CAP=12` unverändert.

Reine Entscheidungs-Logik extrahiert für TDD:
- `planGeneration({crawlPool, manualPool, evergreenPool}, alreadyPublished, {DAILY_MIN, DAILY_MAX}): {order: Thema[], proposeCount: number}` — **pure**. Reihenfolge: Crawl → Manuell → Evergreen; `proposeCount>0` wenn Evergreen-Pool zu klein für den Boden.
- `articleQuelleForThema(themaQuelle): 'crawl'|'redaktion'|'ai_gap'` — **pure** Provenienz-Map (`crawl→crawl`, `manuell→redaktion`, `ai_gap→ai_gap`).

Ablauf `runB2BPipeline`:
1. **Phase 1 Crawl** — unverändert (fresh `quelle='crawl'`, `status='freigegeben'`).
2. **Phase 2 Generierung (getiert, Boden):**
   - Kandidaten-Pools laden (`status='freigegeben'`, `audience='b2b'`, ohne Artikel): `crawl` newest-first, `manuell` FIFO, `ai_gap` FIFO. Bounded.
   - **Tier 1 Crawl** bis `DAILY_MAX`/`ATTEMPT_CAP`.
   - **Tier 2 Manuell** (Aarons Vorschläge zuerst honoriert) bis `DAILY_MAX`.
   - **Tier 3 Evergreen-Boden:** nur wenn `published < DAILY_MIN`. Reicht die Queue nicht → `proposeGapTopics` → als `ai_gap`/`freigegeben` einfügen → auffüllen bis `DAILY_MIN` (nie über `DAILY_MAX`).
   - Jedes Thema: `generateArtikelDraft(_, 'b2b')` → `validateForAutoPublish` → Insert (`quelle` per `articleQuelleForThema`, `veroeffentlicht`/`in_review`) → Thema `entwurf_erstellt`. `nicht_relevant` → Thema `abgelehnt` (bestehend).
3. **Phase 3 Puffer-Nachschub:** nach der Generierung, wenn die verbleibende `ai_gap`/`freigegeben`-Queue `< EVERGREEN_BUFFER` → `proposeGapTopics` für die Zukunft bunkern (sichtbares Veto-Fenster im Admin; wird erst an Folge-Tagen publiziert).

**Veto-Fenster:** Steady-State konsumiert Tier 3 *alte* (bereits gequeuete, im Admin sichtbare) Themen; Phase 3 hält die Queue voraus. Nur Cold-Start (leere Queue) publiziert frisch propose-then-consume (retract vorhanden).

### 3. DB-Migration (additiv, via `apply_migration`)

```sql
ALTER TABLE public.wissen_artikel DROP CONSTRAINT wissen_artikel_quelle_check;
ALTER TABLE public.wissen_artikel ADD CONSTRAINT wissen_artikel_quelle_check
  CHECK (quelle = ANY (ARRAY['redaktion','crawl','ai_gap']));
```
Nur Ausweitung der erlaubten Menge → safe, darf vor Code-Merge prod-appliziert werden (Regel-3-Verbot betrifft nur Drops). `wissen_themen` braucht nichts (`ai_gap` schon erlaubt).

### 4. Bessere Feeds — `src/lib/wissen/crawl/sources.ts` (Freshness-Teil des Hybrids)

Live-verifizierte Verkehrs-/Schadenrecht-Quellen ergänzen (nur die, die HTTP 200 + on-topic liefern). Kandidaten zum Prüfen: kostenlose-urteile.de (Verkehrsrecht-Kategorie-RSS), Captain-HUK, DAV/Anwaltauskunft-Verkehrsrecht, ra-kotz. Sekundär — der Evergreen-Boden garantiert „täglich" bereits allein. Relevanz-Filter/Backstop unverändert (fangen Rauschen).

### 5. Admin-Sichtbarkeit — `src/app/admin/wissen-artikel/`

- `ai_gap`-Themen in der Themen-Liste rendern (nutzt bestehende `ThemaActions` → ablehnen/veto).
- Badge „KI-Evergreen" für `ai_gap` (analog zum bestehenden „Auto-veröffentlicht (Crawl)"-Badge).
- Manueller Vorschlag: `ThemaForm` existiert bereits — nichts zu bauen.
- Optional (YAGNI-Grenze): „Jetzt Themen vorschlagen"-Button (manueller Planer-Trigger). **Nicht** im MVP — der Puffer-Nachschub füllt automatisch.

## Rechtliche Haltung

Identisch zum **bereits live** auto-publizierenden Crawl-B2B: dieselbe `validateForAutoPublish`-Gate (§§ + Disclaimer + Länge 800–15000 + kein erfundenes Az.), RDG-Verbot + „keine Rechtsberatung"-Disclaimer im B2B-Prompt. Evergreen hat **keine** Fremdquelle → eher geringeres Risiko als Crawl-Synthese. Kein neues rechtliches Terrain; Consumer-Redaktions-Pfad bleibt review-gegatet (unberührt).

## Testing (TDD)

Pure Funktionen zuerst (RED→GREEN):
- `propose.ts`: `parseProposedTopics` (gut/malformed/Fences), `dedupeTopics` (Kollision/Normalisierung), `buildProposePrompt` (enthält Domäne + avoid-Liste).
- `pipeline.ts`: `planGeneration` (Tier-Reihenfolge, Boden erreicht/nicht, proposeCount-Berechnung, DAILY_MAX-Deckel), `articleQuelleForThema` (3 Mappings).
- `validate.ts`/`generate.ts`: unverändert (48 Tests bleiben grün — Crawl-Pfad byte-identisch).

Der Anthropic-Call + Supabase-Execution werden per Prod-Smoke verifiziert (Muster der bestehenden Pipeline), nicht unit-gemockt.

## Rollout

1. Migration prod-applizieren (`apply_migration`, additiv) + `list_migrations`-Version → File committen.
2. PR gegen `staging`. Build/tsc/vitest/Ratchets grün.
3. **Cron unverändert** — die bestehende VPS-Crontab (`0 4 * * *`) triggert `runB2BPipeline`; die neue Tier-Logik läuft ab Deploy automatisch. Kein Crontab-Change.
4. Prod-Smoke: `runB2BPipeline` headless (service-role, braucht `ANTHROPIC_API_KEY`) — verifizieren, dass der Boden (2) mit sauberen, on-topic, gate-konformen Evergreen-Artikeln erreicht wird; Qualität sichten → gute behalten (ist das Feature), sonst retract.

## Out of Scope (YAGNI)

- Kein „vorgeschlagen"-Zweitgate (widerspräche „nicht kuratieren"). `ai_gap` geht direkt `freigegeben`.
- Kein manueller Planer-Button im MVP.
- Kein Consumer-Autopilot (nur B2B; Consumer bleibt review-gegatet).
- Keine Ahrefs/GSC-Keyword-Integration (der Planer nutzt Domänen-Wissen + Coverage-Avoidance; datengetriebene Keywords später optional).

## Koordination

Berührt: `src/lib/wissen/{pipeline,propose(NEU)}.ts`, `src/lib/wissen/crawl/sources.ts`, `src/app/admin/wissen-artikel/{page,ThemaActions/CrawlArtikelActions}.tsx`, 1 Migration. Keine der aktuell aktiven Sessions berührt `wissen/*`. Marker gesetzt.
