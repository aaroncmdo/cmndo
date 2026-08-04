# GEO-P2 SP1 — Kürzungs-Capture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use checkbox (`- [ ]`).

**Goal:** Per-Position-Versicherer-Kürzungen ab heute strukturiert in `forderungspositionen` erfassen, gespeist aus dem `vs_kuerzt`-Funnel + manuellem KB-Subform.

**Architecture:** Additiver Write hinter Guard im heißen `process-event.ts` (Logik in isoliertem Helfer); leere Tabelle → risikofreie enum-Erweiterung; manuelle Subform = reale Capture-Quelle.

**Tech Stack:** Supabase (apply_migration/Regel 2), Next 15 / React (KB-Cockpit), vitest (pure units), next-intl.

## Global Constraints (verbatim aus Spec)

- **Spec:** `docs/superpowers/specs/2026-08-05-geo-p2-sp1-kuerzungs-capture-design.md`. Branch `kitta/geo-p2-kuerzungs-capture` (off origin/staging). Pfade rel. zu Repo-Root.
- **Regel 2:** DDL NUR via `apply_migration`. Danach `list_migrations` → recorded Version → File exakt so benennen + committen. Snapshot regen. Types regen + committen.
- **Flag-Drift-Ordering:** enum-Werte ZUERST in CHECK (Migration), DANN Code + `status-check-constraints.json` aktualisieren — sonst blockt `check:flag-drift` das literal `quelle: 'vs_kuerzung'`.
- **enum-Werte:** typ +`stundenverrechnung`,`upe`,`verbringung`,`beilackierung`; quelle +`vs_kuerzung`.
- **Error-Handling:** Result-Object (`{ ok, ... }`), kein throw. Non-critical Write → try/catch-log, bricht Status-Update nicht.
- **Umlaute** echt (UI-Strings/Labels). **Komponenten-Set:** `shared/forms/*`. **Kein** const-Export aus `'use server'`-Files.
- **Gate:** vitest (pure) lokal grün + tsc soweit node_modules reicht; voller Build + alle Ratchets = CI (PR). Regel 4 = Prod-Smoke post-deploy (Handoff).

---

### Task 1: DDL-Migration (enum-Erweiterung) — Regel 2

**Files:** Create `supabase/migrations/<recorded>_geo_p2_forderungspositionen_kuerzungs_enums.sql`; Modify `scripts/lib/status-check-constraints.json`, `src/lib/supabase/database.types.ts`

- [ ] **Step 1:** `apply_migration({ name: 'geo_p2_forderungspositionen_kuerzungs_enums', query: <DDL aus Spec Einheit 1> })`.
- [ ] **Step 2:** `list_migrations` → recorded Version `<V>` ablesen.
- [ ] **Step 3:** DDL als `supabase/migrations/<V>_geo_p2_forderungspositionen_kuerzungs_enums.sql` schreiben (Datei == Version).
- [ ] **Step 4:** `execute_sql` (READ): `pg_get_constraintdef` beider CHECKs → neue Werte drin?
- [ ] **Step 5:** `status-check-constraints.json` surgical: `forderungspositionen.typ` +4, `.quelle` +`vs_kuerzung` (die im JSON gelisteten Wertemengen erweitern; exakt an DB angleichen).
- [ ] **Step 6:** Types regen (CLI-Lese-Gen, kein DDL) + committen. Falls Env fehlt: aufschieben, im PR vermerken (Consumer nutzt nur eigene neue Files, nicht die generierten Row-Typen für die neuen enum-Literale).
- [ ] **Step 7:** Commit Migration-File + snapshot(+types).

### Task 2: `forderungsposition-typ.ts` (Label-Map) — TDD

**Files:** Create `src/lib/kanzlei-fall/forderungsposition-typ.ts`, `src/lib/kanzlei-fall/forderungsposition-typ.test.ts`

- [ ] **Step 1:** Failing test: jeder der 16 CHECK-`typ`-Werte hat ein Label in `FORDERUNGSPOSITION_TYP_LABEL`; `KUERZBARE_POSITIONEN` ⊆ Label-Keys.
- [ ] **Step 2:** Run → FAIL (Modul fehlt).
- [ ] **Step 3:** Implementieren (Spec Einheit 2 verbatim).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

### Task 3: `kuerzungs-positionen.ts` (`persistKuerzungsPositionen`) — TDD

**Files:** Create `src/lib/kanzlei-fall/kuerzungs-positionen.ts`, `src/lib/kanzlei-fall/kuerzungs-positionen.test.ts`

**Interfaces produced:** `persistKuerzungsPositionen(db, {fallId, claimId}, positionen: KuerzungsPosition[]): Promise<{ok, geschrieben, error?}>`; `interface KuerzungsPosition { typ; betrag_gefordert?; betrag_gekuerzt; bezeichnung? }`.

- [ ] **Step 1:** Failing tests (Mock-`db` mit `.from().insert()` capture): (a) ungültiger typ rausgefiltert; (b) nicht-finiter gekuerzt raus; (c) leer → `{ok:true,geschrieben:0}`, kein insert-Call; (d) bezeichnung-Fallback = Label; (e) quelle='vs_kuerzung' + fall_id+claim_id gesetzt; (f) insert-error → `{ok:false}`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implementieren (Spec Einheit 3 verbatim).
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit.

### Task 4: Payload-Typ + Funnel-Wiring — `process-event.ts`

**Files:** Modify `src/lib/lexdrive/process-event.ts`

- [ ] **Step 1:** Aktuelle `vs_kuerzt`-Behandlungszeile im Apply-Block lesen (Hot-File — Zeile kann gewandert sein; Anker `handleVsKuerztSideEffects(input.fallId`).
- [ ] **Step 2:** Import `persistKuerzungsPositionen` (+ Typ) oben ergänzen.
- [ ] **Step 3:** `LexDriveEventPayload` um `positionen?: Array<{...}>` erweitern (Spec Einheit 4a).
- [ ] **Step 4:** Nach dem `handleVsKuerztSideEffects`-Call den Guard-Write einfügen (Spec Einheit 4b).
- [ ] **Step 5:** tsc-Check des Files (soweit node_modules reicht) + Commit.

### Task 5: Manuelle Subform + Boy-Scout-Label

**Files:** Modify `src/app/faelle/[id]/_components/LexDriveTriggerPanel.tsx`, `src/app/gutachter/fall/[id]/stellungnahme/StellungnahmeClient.tsx`

- [ ] **Step 1:** `triggerLexDriveEventManually`-Signatur prüfen (nimmt beliebiges payload-Objekt → Array durchreichbar).
- [ ] **Step 2:** In `LexDriveTriggerPanel`: State `positionen: KuerzungsPosition[]`; wenn `activeEvent.id==='vs_kuerzt'` dynamische Positionen-Liste (SelectField `typ` aus `KUERZBARE_POSITIONEN`+Label-Map, TextField gefordert/gekürzt, +/-); vor Submit `converted.positionen = positionen` (nur wenn ≥1). Leere Liste = heutiges Verhalten.
- [ ] **Step 3:** Boy-Scout `StellungnahmeClient.tsx`: `k.typ` → `FORDERUNGSPOSITION_TYP_LABEL[k.typ] ?? k.typ`.
- [ ] **Step 4:** Commit.

### Task 6: Verify + PR + Smoke-Handoff

- [ ] **Step 1:** vitest der neuen Tests (`npx --no-install vitest run src/lib/kanzlei-fall/`) → grün.
- [ ] **Step 2:** tsc/Build soweit möglich; sonst CI-build als Gate (im PR vermerken).
- [ ] **Step 3:** Push + `gh pr create --base staging` (Body: 5 Einheiten, Migration-Hinweis, Verifikations-Ehrlichkeit, Regel-4-Smoke-Plan).
- [ ] **Step 4:** Marker + Regel-4-Smoke an Merge/Deploy-Session übergeben (Test-Fall + Flow + DB-Verifikation).

## Self-Review

**Spec-Coverage:** DDL→T1, Label-Map→T2, Writer→T3, Funnel→T4, Subform+Anzeige→T5, Verify/PR/Smoke→T6. ✓
**Placeholder:** DDL + Code verbatim in Spec; keine TBD. Types-Regen mit dokumentiertem Env-Fallback.
**Typ-Konsistenz:** `KuerzungsPosition` (T3) == Payload-`positionen`-Shape (T4) == Subform-State (T5); Label-Keys (T2) == CHECK-Werte (T1).
