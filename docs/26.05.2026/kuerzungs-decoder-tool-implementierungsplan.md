# Kürzungs-Decoder Tool — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`. Steps nutzen Checkbox-Syntax (`- [ ]`).
> **Quelle/ADR:** `marketing-strategy/decoders/kuerzungs-decoder-v2/` (ARCHITEKTUR-ADR-standalone, STRATEGIE-ENGINE-konzept, DATEN-PIPELINE-lexdrive, HANDOFF). Dieser Plan adaptiert die ADR an die reale claimondo-v2-Codebase.
> **Stand:** 2026-05-26

**Goal:** Pre-Submit-Tool für Sachverständige — lädt ein Gutachten hoch, leitet die Unfall-Konstellation ab, prognostiziert welche Positionen der Versicherer wahrscheinlich kürzt (mit welcher Begründung + welchem Gegen-Hebel), und empfiehlt den ökonomisch besten Abrechnungsweg.

**Architecture:** Eigenes Postgres-Schema `decoder` (entkoppelt von der laufenden `public`-Migration). Korpus-Tabellen (read-only Produkt-IP, kein Personenbezug) + tenant-isolierte fallbezogene Tabellen (weiches `claim_id` ohne FK, eigenes `tenant_id`). Deterministische TS-Engine (Lookup + Regeln) erdet ein eingegrenztes Claude-Reasoning (Closed Citation Set). V1 ist regelbasiert; die ERP-Phase liefert später echte Euro-Beträge.

**Tech Stack:** Supabase (PG 17.6, Schema `decoder` via supabase-CLI-Migration), Next.js 16 App Router, zustandslose TS-Engine-Lib, Claude API (strukturierter JSON-Output, bestehendes Anthropic-Pattern), Supabase Storage, Tailwind + Komponenten-Set.

---

## Verbindliche Constraints (vor JEDEM Task lesen)

1. **Branding (Aaron 2026-05-26):** „Vitali" wird extern IMMER als **„Claimondo"** geführt — die Daten/IP laufen unter dem Claimondo-Brand, „Vitali" taucht in keinem nutzer-/extern-sichtbaren Text, Schema-Comment-Frontend-Feld o.ä. auf. Die Partnerkanzlei (Kevin Genter / LexDrive) heißt extern „**unsere Partnerkanzlei**", nie namentlich. (Siehe `feedback_vitali_claimondo_naming`, `feedback_kanzlei_nie_namentlich`.)
2. **DDL nur via supabase-CLI (AGENTS Regel 2):** Schema/Tabellen/ENUMs/RLS/Trigger ausschließlich über `npx supabase migration new <name>` + `npx supabase db push`. NIE Management-API. Das eigene Schema `decoder` hält das Tool aus der laufenden `public`-/CMM-Migration heraus (kein Kollisionsrisiko mit den parallelen CMM-Sessions) — trotzdem vor Phase 0 den Live-Stand verifizieren (existiert `decoder` schon? Migration-State?).
3. **DSGVO:** fallbezogene Tabellen tenant-isoliert (eigenes `tenant_id`, JWT-RLS); EXIF-GPS-Stripping bei Foto-Upload Pflicht; 90-Tage-Retention auf Uploads; Art-15-Auskunfts-Workflow; Pflicht-Disclaimer bei JEDEM Output („ersetzt nicht die sachverständige Verantwortung").
4. **Closed Citation Set:** Das Claude-Reasoning darf AUSSCHLIESSLICH aus dem übergebenen Hebel-Katalog zitieren (Verweis per `hebel_id`). Keine frei generierten BGH-Aktenzeichen. Unverifizierte AZ sind „DO NOT CITE" bis Freigabe durch die Partnerkanzlei. Zentral-Anker: **BGH VI ZR 280/22 (12.03.2024)**. Output-Validierung rejected jeden AZ/hebel_id außerhalb der Kandidaten-Menge.
5. **Kein Erfolgshonorar** (RVG/GebOK-Konflikt). **BVSK 2024** ist urheberrechtlich geschützt → nur abgeleitete/kategorische Werte im Frontend, interner Schwellwert ok. **DAT:** kein Re-Export der Hersteller-Mappings.
6. **Komponenten-Set/Branding-Rules:** UI mit `@/components/primitives/*` + `@/components/shared/*` (kein handgerolltes Tailwind für Komponenten); Brand-Tokens statt Hex; echte Umlaute in UI-Strings; Server-Actions liefern `{ ok, error? }` (kein throw).

---

## File- & Schema-Struktur

**Schema `decoder` (DDL via Migrationen):**

| Tabelle | Art | Inhalt |
|---|---|---|
| `decoder.trigger_pattern_katalog` | Korpus (public read) | 17 Kürzungs-Trigger; `aggressivitaet_je_versicherer` JSONB+GIN, `severity`, `kategorie` |
| `decoder.gutachter_hebel` | Korpus (public read, Tier-C view-gefiltert) | Wortlaut-Gegenargumente; `effectiveness_je_versicherer` JSONB, `quick_win`, `risiko_reduktion_pct`, `konfidenz` (ENUM), `foto_phase`, `defensive_formulierung`, `anti_pattern_grund`, FK `trigger_id` |
| `decoder.plausibilitaets_regeln` | Korpus (public read) | Praxis-Schwellwerte; `schwellwert`, `einheit`, `kontext` JSONB, `bereich`, `ausnahme`, FK `trigger_id_fk` |
| `decoder.versicherer_profile` | Korpus (public read) | `mechanism_type` (DIREKT/EXTERN/GEMISCHT), `embedded_rate`, `positions` JSONB (n_cases), `top_begruendung_per_position`, `pruefer_genutzt`, `konzern_pruefer_score`, `effektive_phrasen`, zeitversioniert (`gueltig_ab`/`gueltig_bis`) |
| `decoder.claim_konstellation` | Fallbezogen (tenant) | 9 ENUM-Dimensionen + `konstellations_hash` (md5), `claim_id` UUID (kein FK), `tenant_id` |
| `decoder.analyse` | Fallbezogen (tenant) | `gefundene_vulns` JSONB, `empfohlene_hebel` JSONB, `plausi_warnungen` JSONB, `strategie` JSONB, `claim_id`, `tenant_id`, `created_at` |
| `decoder.gutachten_upload` | Fallbezogen (tenant) | `format` (SilverDAT/Audatex/PDF), `storage_path`, `retention_bis` (90 Tage), `claim_id`, `tenant_id` |

ENUMs: `decoder.evidence_konfidenz` (`tier_a_bgh > tier_a_korpus > tier_a_partial > tier_b_korpus > tier_b_anwaltsblog > tier_b_intern_estimate`), `decoder.mechanism_type`, + 9 Konstellations-ENUMs.

**Code (Next.js / TS):**
- `src/lib/decoder/types.ts` — Gesamtbild, Konstellation, FeedItem-Pendants, Strategie-Output-Schema
- `src/lib/decoder/engine/` — `trigger-match.ts`, `profil-lookup.ts`, `plausi.ts`, `hebel-retrieval.ts`, `abrechnungsweg.ts`, `index.ts` (orchestriert die deterministische Erdung)
- `src/lib/decoder/extract/` — `silverdat.ts` (Pflicht), `pdf-fallback.ts` (OCR später), `adapter.ts` (Claimondo|Standalone)
- `src/lib/decoder/reasoning.ts` — Claude-Call (Closed Citation Set, JSON-Schema-validiert) — reuse bestehendes Anthropic-Pattern (siehe `project_ai_assistant`)
- `src/lib/decoder/queries.ts` — DB-Reads des `decoder`-Schemas (unstable_cache wo Korpus)
- `src/app/api/decoder/upload/route.ts`, `.../[id]/analyse/route.ts` — API
- `src/app/<portal>/pre-submit-check/` — `<PreSubmitView>` + Sub-Komponenten (UploadZone, VulnerabilityList, HebelList, PlausiList, StrategieReport, ActionBar)

---

## Phasen-Dekomposition (jede Phase = eigener PR, unabhängig shippable)

| Phase | Inhalt | Blocker | Detail-Stand |
|---|---|---|---|
| **0** | Schema-Fundament: `CREATE SCHEMA decoder` + ENUMs + RLS-Defaults | — | **detailliert (unten)** |
| **1** | Korpus: 4 Tabellen + Seed aus `master_audit_v2.json` (HUK korrekt) | — | **detailliert (unten)** |
| **2** | Fallbezug: `claim_konstellation`/`analyse`/`gutachten_upload` + tenant-RLS + Storage-Bucket | Tenant-Identity-Decision (Q1) | skizziert |
| **3** | Engine: deterministische TS-Lib (Trigger/Profil/Plausi/Hebel/Abrechnungsweg) + Claude-Reasoning | Hebel-Katalog-Kuration (Q2), Reasoning-Modell-Decision (Q3) | skizziert |
| **4** | UI: `<PreSubmitView>`-Route im SV-Portal | Portal-Platzierung (Q4) | skizziert |
| **5** | ERP-Phase: Soll/Ist-Import → reale €-Kürzung je Versicherer | Vitali-ERP-Zugang (Q5) | skizziert |
| **P** | (parallel) M005-Korrektur in `public`: HUK→DEKRA-Befangenheits-Score 30→0 als Vorwärts-Migration | — | skizziert |

**Empfohlene Reihenfolge:** Phase 0 → 1 (kein externer Blocker, rein additiv, eigenes Schema) zuerst — liefert das verkaufbare Korpus-Asset + die Datenbasis. Phase 2–4 danach (V1-Tool). Phase 5 sobald Vitali-ERP-Zugang geklärt. M005-Korrektur parallel jederzeit.

---

## Phase 0 — Schema-Fundament (detailliert)

**Files:**
- Create: `supabase/migrations/<ts>_decoder_000_schema_fundament.sql`
- Verify: Supabase-MCP `list_tables` / `execute_sql`

- [ ] **Step 0.1 — Live-Schema-Stand verifizieren (vor jeder DDL).**
  Via Supabase-MCP: `SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'decoder';` → erwartet: leer (Schema existiert noch nicht). Falls vorhanden: bestehenden Stand inspizieren (`SELECT table_name FROM information_schema.tables WHERE table_schema='decoder'`), Plan anpassen statt blind neu anlegen.

- [ ] **Step 0.2 — Migration anlegen.**
  `npx supabase migration new decoder_000_schema_fundament`

- [ ] **Step 0.3 — SQL schreiben:** Schema + ENUMs + RLS-Default-Helper.
```sql
CREATE SCHEMA IF NOT EXISTS decoder;
COMMENT ON SCHEMA decoder IS 'Kuerzungs-Decoder: entkoppeltes Modul (ADR-001). Korpus = Produkt-IP unter Claimondo-Brand; fallbezogen = tenant-isoliert via eigenem tenant_id.';

CREATE TYPE decoder.evidence_konfidenz AS ENUM (
  'tier_a_bgh', 'tier_a_korpus', 'tier_a_partial',
  'tier_b_korpus', 'tier_b_anwaltsblog', 'tier_b_intern_estimate'
);
CREATE TYPE decoder.mechanism_type AS ENUM ('DIREKT', 'EXTERN', 'GEMISCHT');

-- Konstellations-ENUMs (9 Dimensionen, Phase 2 nutzt sie; hier zentral definiert)
CREATE TYPE decoder.abrechnungs_art AS ENUM ('fiktiv', 'konkret', 'totalschaden', 'unknown');
CREATE TYPE decoder.schadenklasse  AS ENUM ('bagatell', 'mittel', 'gross', 'totalschaden');
-- ... (versicherungstyp, unfalltyp, fahrzeug_klasse, wbw_klasse, haftungsquote, vorschaden_status, spezial_kontext)
-- WICHTIG: Werte vor Phase 2 gegen die ENUM-Listen in STRATEGIE-ENGINE-konzept §3 Schritt 2 final abstimmen.

GRANT USAGE ON SCHEMA decoder TO anon, authenticated;
```

- [ ] **Step 0.4 — `db push`.**
  `npx supabase db push` (verifiziert vorher Migration-Diff; bei Connection-Timeout: laufende public-Migration abwarten, NICHT Management-API).

- [ ] **Step 0.5 — Verifizieren.**
  `SELECT typname FROM pg_type WHERE typnamespace = 'decoder'::regnamespace;` → erwartet: alle ENUMs gelistet. `\dn decoder` → Schema existiert.

- [ ] **Step 0.6 — Commit.**
  `git add supabase/migrations/ && git commit -m "feat(decoder): Phase 0 — Schema decoder + ENUM-Fundament (ADR-001 Welle 0)"`

---

## Phase 1 — Korpus + Seed (detailliert)

**Files:**
- Create: `supabase/migrations/<ts>_decoder_001_korpus_tabellen.sql`
- Create: `supabase/migrations/<ts>_decoder_002_korpus_seed.sql`
- Create: `scripts/decoder/generate-korpus-seed.mjs` (liest `marketing-strategy/decoders/kuerzungs-decoder-v2/analysis/master_audit_v2.json` → SQL)
- Test: `src/lib/decoder/__tests__/seed-integritaet.test.ts`

- [ ] **Step 1.1 — Korpus-Tabellen-Migration schreiben** (`decoder_001_korpus_tabellen`): die 4 Tabellen aus der Schema-Struktur oben, je mit Indizes (GIN auf die JSONB-Aggressivitäts-/Effectiveness-Felder), RLS `ENABLE` + `CREATE POLICY ... FOR SELECT USING (true)`. Tier-C-Hebel: `CREATE VIEW decoder.gutachter_hebel_public AS SELECT ... WHERE anti_pattern_grund IS NULL;` (Frontend liest die View, nie die Basistabelle).

- [ ] **Step 1.2 — `db push` + Tabellen verifizieren** (`SELECT table_name FROM information_schema.tables WHERE table_schema='decoder'` → 4 Tabellen + View).

- [ ] **Step 1.3 — Seed-Generator schreiben** (`scripts/decoder/generate-korpus-seed.mjs`): liest `master_audit_v2.json`, erzeugt `decoder_002_korpus_seed.sql` mit `INSERT`s für `versicherer_profile` (HUK: `mechanism_type='DIREKT'`, `konzern_pruefer_score=0` — die V1-Foundation-Korrektur von Anfang an korrekt; Allianz EXTERN/ControlExpert; etc. aus dem Audit). Trigger-Katalog + initiale Hebel aus dem bestehenden Decoder-Material (`src/content/claimondo/decoder/*` + BGH-Anker) als Start-Seed; Wortlaut-Verfeinerung = Q2.

- [ ] **Step 1.4 — Seed-Migration anlegen + `db push`.**

- [ ] **Step 1.5 — Seed-Integritäts-Test** (vitest): `versicherer_profile` enthält HUK mit `konzern_pruefer_score=0` (NICHT 30); Top-Positionen-Counts matchen `master_audit_v2.json` (Kostenpauschale 37, Reparaturkosten 23, RA-Gebühren 20, …); jeder `gutachter_hebel` referenziert einen existierenden `trigger_id`; jeder zitierte BGH-AZ ist als verifiziert oder „DO NOT CITE" markiert (kein unmarkiertes AZ).

- [ ] **Step 1.6 — Commit** (`feat(decoder): Phase 1 — Korpus-Tabellen + Seed aus V2-Audit (HUK korrekt, ADR Welle 1)`).

---

## Phasen 2–5 + M005 (Scope + Dependencies — vor dem jeweiligen Detail-Plan zu verfeinern)

**Phase 2 — Fallbezug:** 3 tenant-Tabellen (`claim_konstellation`, `analyse`, `gutachten_upload`) mit JWT-RLS (`USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid)`), Storage-Bucket `decoder-gutachten` (privat, 90-Tage-Lifecycle, EXIF-Stripping beim Upload). **Blocker Q1:** Was ist die „tenant"-Identity in Claimondos JWT? Heute rollenbasiert (kunde/sv/admin), kein `tenant_id`-Claim. Optionen: SV-`user_id`, Org-`id`, oder neuer Claim. Entscheidet die RLS-Policy.

**Phase 3 — Engine:** zustandslose TS-Lib in `src/lib/decoder/engine/` — Trigger-Match → Profil-Lookup → Plausi → Hebel-Retrieval (geschlossene Kandidaten-Menge) → Abrechnungsweg-Berechnung (100%/130%-Schwellen, BGH VI ZR 100/20, 387/14) → Claude-Reasoning (eingegrenzt, JSON-Output gegen erlaubte `hebel_id`/`az`-Menge validiert, Reject statt Anzeige bei Verstoß). Tests gegen die 4 extrahierten Vorher/Nachher-Paare. **Blocker Q2** (Hebel-Katalog-Kuration: Wortlaute + AZ-Verifikation durch Partnerkanzlei) + **Q3** (Reasoning: bestehendes Anthropic-Pattern via Next-API-Route, NICHT zwingend Supabase Edge — an `project_ai_assistant` ausrichten).

**Phase 4 — UI:** `<PreSubmitView>` aus primitives/shared — `UploadZone → AnalysisStatusBar → VulnerabilityList (5-Stern-Aggressivität, BGH-Tooltip) → HebelList (Top-5 + Konfidenz-Badge + Foto-Gate) → PlausiWarnungenList → StrategieReport (Abrechnungsweg) → ActionBar (Export PDF/Word/Clipboard, SaveDraft)`. Kein Auto-Apply — SV bleibt verantwortlich. Pflicht-Disclaimer sichtbar. **Blocker Q4:** Platzierung — eigener SV-Portal-Tab (`/gutachter/pre-submit-check`) vs. Tab in der Fallakte (AAR-563). Als abtrennbares Modul bauen (Standalone-Cut).

**Phase 5 — ERP-Phase:** einmaliger Soll/Ist-Export aus dem Vitali-/Rechnungs-System → pro Versicherer/Position `avg_kuerzung_eur` → `versicherer_profile.positions[*]` nachseeden → Abrechnungsweg-Engine rechnet reale €. Pseudonymisierung SHA256+SALT `claimondo-pseudo-2026-05-22`. **Blocker Q5:** Vitali-ERP-System + Zugriffsweg (Export/API/Browser) unbekannt.

**Phase P — M005-Korrektur (parallel, separater PR in `public`):** HUK→DEKRA-Befangenheits-Score 30→0 als **Vorwärts-Migration** (kein In-Place-Edit der alten Migration); HUK-Tableau-System als eigene Verflechtung dokumentieren. Vorher Live-Stand von M005 verifizieren.

---

## Offene Decisions (Aaron / Partnerkanzlei)

| # | Frage | Vorschlag |
|---|---|---|
| Q1 | `tenant_id`-Identity in Claimondos JWT für die fallbezogene RLS? | SV-`user_id` als tenant für V1-embedded; JWT-Claim ergänzen für Standalone |
| Q2 | Hebel-Katalog-Wortlaute + BGH-AZ-Verifikation — wer kuratiert, bis wann? | Start-Seed aus bestehendem Decoder/BGH-Material; Verfeinerung + AZ-Freigabe durch Partnerkanzlei vor Beta |
| Q3 | Claude-Reasoning: bestehendes Anthropic-Next-API-Pattern statt Supabase Edge? | ja, an `project_ai_assistant` ausrichten (kein neuer Stack) |
| Q4 | UI-Platzierung: eigener SV-Portal-Tab vs. Fallakte-Tab? | eigener Tab `/gutachter/pre-submit-check`, modular (Standalone-fähig) |
| Q5 | Vitali-ERP-System + Zugriffsweg (Export/API/Browser)? | offen — blockiert nur Phase 5, nicht 0–4 |
| Q6 | Reicht V1 ohne OCR/Layout-Parser (25 schwierige PDFs)? | ja, SilverDAT-Parser zuerst, OCR später |

---

## Self-Review

- **Spec-Coverage:** Schema (D1) → Phase 0/1. Lose Kopplung (D2) → Phase 2 (claim_id ohne FK, eigenes tenant_id). Engine außerhalb DB (D3) → Phase 3. Migrations-Wellen 0–4 → Phasen 0–4. M005-Korrektur → Phase P. ERP-Phase → Phase 5. Compliance (§8 ADR) → Constraints-Block. Abrechnungsweg (Engine-Konzept §4) → Phase 3. ✓ alle ADR-Punkte einem Task/einer Phase zugeordnet.
- **Placeholder-Scan:** Phase 0/1 enthalten konkretes SQL + Verifikations-Queries. Phasen 2–5 sind BEWUSST nur skizziert (Scope + Blocker) — sie werden erst nach Phase-1-Landing + Auflösung von Q1–Q5 zu bite-sized Tasks detailliert (Multi-Subsystem-Dekomposition pro writing-plans Scope-Check).
- **Konsistenz:** `tenant_id`/`claim_id`/`konzern_pruefer_score`/`mechanism_type` durchgängig gleich benannt wie in ADR-Datenmodell §3.
- **Realitäts-Adaption:** Vitali→Claimondo + Partnerkanzlei-Naming als harte Constraint; DDL via supabase-CLI (Regel 2); Reasoning an bestehendes AI-Pattern statt Supabase-Edge (Q3); tenant-Identity als offene Frage (Claimondo hat heute keinen tenant-Claim).
