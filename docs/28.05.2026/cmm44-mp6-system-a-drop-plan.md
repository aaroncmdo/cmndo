# CMM-44 MP-6 — System-A-Drop (`claims.phase`) — Plan

> **For agentic workers:** REQUIRED SUB-SKILL beim Ausführen: `superpowers:subagent-driven-development` oder `executing-plans`. Steps mit `- [ ]`. **DDL ausschließlich über das Supabase-Plugin** (`apply_migration`) — neue Regel 2 (PR #1896): apply_migration → `list_migrations` für die recorded Version → Migration-File `<V>_<name>.sql` danach benennen (kein Twin-Drift).

**Goal:** Die tote System-A-Phasenspalte `claims.phase` (10-Code, von `calc_claims_phase` getrieben) + ihr Trigger-/Funktions-Geflecht entfernen; **alle** Phasen-Reads kommen aus `v_claim_phase` (MP-3: 4 Hauptphasen + 9 Substates).

**Architecture:** `claims.phase` ist erst droppbar, wenn (A) alle Code-Reader auf `v_claim_phase.main_phase/sub_phase` migriert + (B) die 5 Views entkoppelt/repointed sind. Danach (C) das Writer-Geflecht (3 Trigger + 5 Funktionen) + die Spalte droppen. Reihenfolge A→B→C ist hart; C ist irreversibel (Prod-DROP).

**Tech Stack:** Postgres (Supabase-Plugin-DDL), Next.js/TS-Reader. Branch off `staging`.

---

## 0 · Status / Resume

- **Plan only** (Aaron 2026-05-28: „MP-6 planen", kein blinder Drop). Keine DB-Änderung in diesem Plan-PR.
- Grounding 2026-05-28 live gegen die DB (Plugin) + Code-Grep gegen `staging`.
- **2 offene Entscheidungen für Aaron** (siehe §5) blockieren den Start von MP-6a/c.

---

## 1 · Dependency-Inventur (live verifiziert 2026-05-28)

### 1a · WRITER von `claims.phase` (Phase C: droppen)
| DB-Objekt | Tabelle | Funktion |
|---|---|---|
| Trigger `trg_claims_set_phase` (BEFORE INS/UPD OF status, kundenbetreuer_id) | `claims` | `trg_fn_set_claims_phase` → `calc_claims_phase(claim_id,status,kb_id)` |
| Trigger `trg_gutachten_refresh_phase` | `gutachten` | `trg_fn_refresh_claim_phase_from_gutachten` |
| Trigger `trg_repairs_refresh_phase` | `repairs` | `trg_fn_refresh_claim_phase_from_repairs` |
| (Funktion ohne aktiven Trigger — tot) | — | `trg_fn_refresh_claim_phase_from_payments` |
| (Funktion ohne aktiven Trigger — tot; `faelle.phase` existiert nicht) | — | `map_claim_phase_to_faelle_phase` (aar854) |
| Kern-Funktion | — | `calc_claims_phase` (10-Code: `9_storniert`/`6_kommunikation_versicherung`/…; aar830→aar838→aar839 CREATE-OR-REPLACE + search_path_lock) |

`calc_claims_phase` liest beim Berechnen aus `vs_korrespondenz`, `repairs`, `gutachten`-OCR, `claim_payments` — diese Reads verschwinden mit der Funktion (keine separaten Reader).

**Zusätzlicher Writer (Sonderfall):** `ManualPhaseOverride` (`src/app/faelle/[id]/_actions/manual-phase-override.ts`) schreibt `claims.phase` direkt (der 52-Subphasen-Override). Heute UI-seitig deaktiviert (MP-5b-Befund), aber referenziert die Spalte → **Entscheidung §5.1**.

### 1b · VIEWS die `claims.phase` lesen / `aktuelle_phase` exponieren (Phase B: repoint)
| View | exponiert `aktuelle_phase` | refs `claims.phase` |
|---|---|---|
| `faelle_kunde_view` | ✓ | ✓ |
| `faelle_sv_view` | ✓ | ✓ |
| `v_claim_full` | ✓ | ✓ |
| `v_faelle_mit_aktuellem_termin` | ✓ | ✓ |
| `v_claim_listing` | — | ✓ |

Alle exponieren `aktuelle_phase = c.phase` (DE-3-Alias). Repoint: `aktuelle_phase` entweder als Übergangs-Alias auf `v_claim_phase.sub_phase` zeigen lassen, **oder** entfernen + Reader auf `main_phase/sub_phase` umstellen (DE-3-Entscheidung §5.2). `v_claim_phase`/`v_claim_sv`/`v_claim_timeline` referenzieren `claims.phase` NICHT (sauber).

### 1c · CODE-READER (Phase A: auf `v_claim_phase` migrieren)
Echte `claims.phase`/`aktuelle_phase`-Konsumenten (der breite `\.phase`-Grep mit 53 Files ist überwiegend inzident — `PhaseStepData.phase`, `SUBPHASE_VISIBILITY.rule.phase` etc. sind NICHT betroffen):

| Datei | Was es tut | Migration |
|---|---|---|
| `src/app/admin/faelle/(hub)/page.tsx:282` | `aktuelle_phase: suppClaim?.phase` (claims-Embed) → FaelleKanban | aus `v_claim_phase` (main/sub) statt claims.phase |
| `src/app/admin/faelle/(hub)/FaelleKanban.tsx` | `aktuelle_phase?`-Typ; rendert über `buildClaimPhasePipeline` (4-Phasen) | nur Typ/Prop-Vertrag; Kanban-Spalten schon 4-Phasen (MP-4c) → claims.phase-Feed kappen |
| `src/app/kanzlei/kanban/page.tsx` + `mandate/page.tsx` | gruppiert nach erster Ziffer von `aktuelle_phase` (`"3_…"`) | **echte Logik-Änderung** → `main_phase` von `v_claim_phase` |
| `src/app/api/cron/pflichtdokumente-reminder/route.ts:33-46` | selektiert + filtert `aktuelle_phase`, nutzt es als `Phase` | **echte Logik-Änderung** → Substate aus `v_claim_phase` |
| `src/lib/claims/get-kunde-faelle.ts:583` | `aktuelle_phase: c.phase` (API-Vertrag) | aus `v_claim_phase` |
| `src/lib/fall/queries.ts:39` | SELECT enthält `aktuelle_phase` | View-/v_claim_phase-Quelle |
| `src/lib/makler/queries.ts` (263/336/505/576/613) + `copilot-prompt.ts:199` | liest `aktuelle_phase` aus View | View nach Repoint / v_claim_phase |
| `src/app/gutachter/fall/[id]/FallDetailClient.tsx:237` | Passthrough `fall.aktuelle_phase` → FallHeader | Quelle umstellen, Panel nutzt eh `lifecycle` |
| `src/components/admin/fallakte/FallActionBar.tsx:58` → `ManualPhaseOverrideModal` | `currentSubphase = fall.aktuelle_phase` | mit §5.1 (ManualPhaseOverride) |

`src/lib/faelle/claim-duplicate-columns.ts:246` (`aktuelle_phase: 'phase'`) ist die Dup-Map — nach dem Drop Eintrag entfernen. `src/app/dev/phases/page.tsx` = 10-Phasen-Mock (prod-gated), separat droppbar.

---

## 2 · Reihenfolge (hart)

```
MP-6a  Code-Reader migrieren  (claims.phase / aktuelle_phase → v_claim_phase main/sub)
MP-6b  5 Views repointen      (aktuelle_phase-Alias → v_claim_phase.sub_phase ODER entfernen)
MP-6c  Writer-Geflecht + Spalte droppen   (3 Trigger + 5 Funktionen + claims.phase + CHECK)
```
A und B MÜSSEN vor C live sein. C = irreversibler Prod-DROP. Jede Stufe eigener PR `--base staging`; nach jeder Stufe Smoke (alle Portale) bevor die nächste startet.

---

## 3 · Phase C — exakte DROP-DDL (via Supabase-Plugin, erst nach A+B)

```sql
-- Trigger zuerst (hängen an den Funktionen)
drop trigger if exists trg_claims_set_phase on public.claims;
drop trigger if exists trg_gutachten_refresh_phase on public.gutachten;
drop trigger if exists trg_repairs_refresh_phase on public.repairs;
-- Funktionen
drop function if exists public.trg_fn_set_claims_phase();
drop function if exists public.trg_fn_refresh_claim_phase_from_gutachten();
drop function if exists public.trg_fn_refresh_claim_phase_from_repairs();
drop function if exists public.trg_fn_refresh_claim_phase_from_payments();   -- orphan
drop function if exists public.map_claim_phase_to_faelle_phase();            -- orphan (aar854)
drop function if exists public.calc_claims_phase(uuid, text, uuid);
-- Spalte (+ CHECK fällt mit)
alter table public.claims drop column phase;
```
**Vor dem Apply:** `list_migrations` + `pg_get_functiondef`/`pg_get_triggerdef` final gegenchecken (Signaturen/Existenz), `pg_depend` auf `claims.phase` prüfen (keine übersehenen Objekte). Plugin-Recorded-Version ablesen → File `supabase/migrations/<V>_cmm44_mp6_drop_claims_phase.sql` danach benennen.

---

## 4 · Tasks

**MP-6a (eigener PR, subagent-driven):** je Reader-Datei aus §1c einen Task — Read-Swap auf `v_claim_phase` (Guards `toClaimMainPhase`/`toClaimSubPhase` aus `lib/claims/lifecycle.ts`); Kanzlei-Kanban + Cron sind Logik-Rewrites (kein Rename); voller `npm run build` + Smoke der jeweiligen Route. Re-Grep `aktuelle_phase|claims.*phase` → nur noch der bewusst belassene View-Alias übrig.
**MP-6b (eigener PR):** je View `pg_get_viewdef` → CREATE OR REPLACE ohne `c.phase`/mit `v_claim_phase`-Join; Precision-Casts erhalten (SP-G-Lesson). Smoke der View-Konsumenten.
**MP-6c (eigener PR, gated):** die DDL aus §3; Post-Drop-Smoke ALLER Portale (Public+Admin+Kunde+SV+Makler+Kanzlei) mit Screenshots (Post-Drop-Smoke-Pflicht).

---

## 5 · Offene Entscheidungen (blockieren A/C)

**5.1 · ManualPhaseOverride** — schreibt `claims.phase` direkt, ist UI-deaktiviert (MP-5b). Optionen: (a) mit MP-7 „ManualPhaseOverride-Redesign" zusammenlegen + dort entfernen/neu bauen (dann ist MP-6c auf MP-7 gated), oder (b) in MP-6a die Override-Action/Modal mitentfernen (es ist eh disabled). → **Aaron: (a) oder (b)?**

**5.2 · `aktuelle_phase`-Alias (DE-3)** — Übergangs-Alias auf `v_claim_phase.sub_phase` behalten (sanfter, Reader bleiben), oder Alias entfernen + alle Reader hart auf `main_phase/sub_phase` (ein PR mehr, sauberer)? Handoff/§6-DE-3 tendierte zu „Alias-Übergang, dann löschen". → **Aaron: Alias behalten (Übergang) oder jetzt hart umstellen?**

---

## 6 · Risiken / Gotchas
- **Prod-DROP auf geteilter DB** — A+B-Gate hart; C nur wenn Re-Grep + `pg_depend` sauber.
- **Kanzlei-Kanban + pflichtdokumente-Cron** sind echte Logik-Rewrites (System-A-Ziffern → v_claim_phase-Substates), kein Rename → eigene Tests.
- **calc_claims_phase** hat aar838/aar839-Replaces + search_path_lock → in Abhängigkeitsreihenfolge droppen (Trigger vor Funktion).
- **Twin-Drift:** Plugin-recorded Version ablesen + File danach benennen (Regel 2 / PR #1896).
- `v_claim_phase` ist die einzige Phasen-SSoT nach C — Parity-Gate (MP-9) sollte vor/mit C grün sein.
