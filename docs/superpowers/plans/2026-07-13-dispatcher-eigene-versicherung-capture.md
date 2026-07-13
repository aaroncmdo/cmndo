# Dispatcher `eigene_versicherung` Capture + Q1 kasko-aware — Implementation Plan

> **For agentic workers (FRESH SESSION):** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Work in worktree `.claude/worktrees/abrechnungsweg-lead-capture` (branch `kitta/abrechnungsweg-lead-capture`, off staging). **RE-VERIFY each file against current code before editing** (this plan was written from a long design session; the exact form wiring must be read fresh). Steps use checkbox syntax.

**Goal:** Der Dispatcher kann `eigene_versicherung` (ja/nein) in der Lead-Qualifizierung erfassen (konditional bei `schuldfrage='eigenverantwortung'`) → `leads.eigene_versicherung`; die Q1-Engine wird kasko-aware; die veraltete Eigenverschulden-Warnung wird nuanciert. Speist 6f60c510s `derive_abrechnungsweg` (liest `leads.schuldfrage/eigene_versicherung`).

**Architecture:** Reines Frontend/Persist + Pure-Logic (Engine). **Kein DDL** (`leads.eigene_versicherung` existiert), **kein** Touch an `convert-lead-to-claim.ts` / `v_claim_*` / `derive_abrechnungsweg` (6f60c510s Lane). Spec: `docs/superpowers/specs/2026-07-13-dispatcher-eigene-versicherung-capture-design.md`.

## Global Constraints
- Regel 1: PR gegen **staging**, nie main. Regel 2: keine DDL hier (Column existiert). Interface: `leads.schuldfrage ∈ {gegner,eigenverantwortung,unklar}`, `leads.eigene_versicherung ∈ {ja,nein}` (6f60c510-bestätigt — via DB/types re-verify).
- Umlaute in UI-Strings. Token-audit-safe. Server-Actions = Result-Object-Pattern (`{ok,error?}`), `revalidatePath`.
- Vitest env=node. Build für Route/Action-Änderungen. Prod-Playwright-Smoke (Mandat 11.07.).
- 7-Punkte-Audit im Commit; Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>.

---

### Task 1: RE-VERIFY — Form-Persist-Pfad + Column + Value-Konvention

**Files (read only):** `src/app/dispatch/leads/[id]/page.tsx`, `src/app/dispatch/leads/[id]/_actions/*.ts` (v.a. `stammdaten.ts`), `src/app/dispatch/leads/[id]/DispatchGatesPanel.tsx`.

- [ ] **Step 1:** Finde, wo `schuldfrage` als Form-Feld gerendert + gespeichert wird. `grep -rn "schuldfrage" src/app/dispatch/leads/[id]`. Identifiziere (a) das Form-Control (segmented?), (b) die Server-Action / den Form-Save, der `schuldfrage` auf `leads` schreibt, (c) die Value-Konvention der Form (`'true'/'false'`-Strings? Freitext?).
- [ ] **Step 2:** Bestätige `leads.eigene_versicherung` Typ + erlaubte Werte via generierte Types (`src/lib/**/database.types.ts` o.ä.) oder Supabase-MCP `execute_sql` (READ): `select column_name,data_type from information_schema.columns where table_name='leads' and column_name in ('schuldfrage','eigene_versicherung')` + evtl. CHECK-Constraint. **Werte müssen `'ja'|'nein'` sein.**
- [ ] **Step 3:** Notiere die 3 Fakten (Control-Pattern, Persist-Action, Value-Konvention) — Task 3/4 hängen daran. Kein Commit (reine Verifikation).

### Task 2: qualification-engine — `eigene_versicherung` + Q1 kasko-aware (TDD)

**Files:** `src/app/dispatch/leads/[id]/_lib/qualification-engine.ts`, `.../_lib/deriveLeadWorkflowState.test.ts` bzw. das Engine-Test-File (RE-VERIFY welcher Test `computeQualificationStatus` deckt — es gibt `qualification-engine`-nahe Tests).

- [ ] **Step 1: Failing tests** — im Engine-Test-File neue Cases:
```ts
// eigenverantwortung + eigene_versicherung=ja => Q1 erfüllt (Kasko)
expect(computeQualificationStatus({ unfallhergang:'x', schuldfrage:'eigenverantwortung', eigene_versicherung:'ja' } as any, null).q1_schuldfrage).toBe(true)
// eigenverantwortung + nein => Q1 NICHT erfüllt
expect(computeQualificationStatus({ unfallhergang:'x', schuldfrage:'eigenverantwortung', eigene_versicherung:'nein' } as any, null).q1_schuldfrage).toBe(false)
// eigenverantwortung + unset => Q1 NICHT erfüllt
expect(computeQualificationStatus({ unfallhergang:'x', schuldfrage:'eigenverantwortung' } as any, null).q1_schuldfrage).toBe(false)
// gegner unverändert erfüllt; unklar+aufklaerung unverändert erfüllt
```
- [ ] **Step 2:** Run → FAIL (`eigene_versicherung` nicht im Typ / Q1 disqualifiziert eigenverantwortung).
- [ ] **Step 3:** `LeadLike` um `eigene_versicherung?: 'ja' | 'nein' | string | null` ergänzen. Q1 ersetzen durch:
```ts
const q1_schuldfrage =
  !!lead.unfallhergang && !!lead.schuldfrage &&
  (lead.schuldfrage === 'gegner' ||
   (lead.schuldfrage === 'unklar' && lead.aufklaerung_teilschuld_bestaetigt === true) ||
   (lead.schuldfrage === 'eigenverantwortung' && lead.eigene_versicherung === 'ja'))
```
- [ ] **Step 4:** Run → PASS. `npx vitest run <engine-test>`.
- [ ] **Step 5:** Commit.

### Task 3: `eigene_versicherung`-Control im Dispatcher-Form (konditional) + Persist

**Files:** `src/app/dispatch/leads/[id]/page.tsx` (+ das in Task 1 gefundene Form-Control-File + Persist-Action).

- [ ] **Step 1:** Neben dem `schuldfrage`-Control ein `eigene_versicherung`-Control (segmented ja/nein) rendern, **nur sichtbar wenn `schuldfrage === 'eigenverantwortung'`** (Live-Form-Wert). Label deutsch mit Umlaut: „Eigene Versicherung (Kasko)?", Optionen „Ja" / „Nein". Value-Konvention = wie in Task 1 verifiziert; DB-Wert `'ja'|'nein'`.
- [ ] **Step 2:** Persist: `eigene_versicherung` in denselben Save-Pfad wie `schuldfrage` aufnehmen (die Server-Action aus Task 1 um das Feld erweitern; `revalidatePath` prüfen). Beim Wechsel weg von `eigenverantwortung` das Feld auf null/leer setzen (kein stale Kasko-Wert).
- [ ] **Step 3:** `npx tsc --noEmit` (nur dein Change; env-OOM ggf. `NODE_OPTIONS=--max-old-space-size=8192`). Commit.

### Task 4: DispatchGatesPanel-Warnung nuancieren

**Files:** `src/app/dispatch/leads/[id]/DispatchGatesPanel.tsx`.

- [ ] **Step 1:** In `toLeadLike` ergänzen: `eigene_versicherung: str(values.eigene_versicherung)`.
- [ ] **Step 2:** Die `warnings`-Zeile für `values.schuldfrage === 'eigenverantwortung'` ersetzen durch eine `eigene_versicherung`-aware Logik:
  - unset → „Eigenverschulden — eigene Versicherung (Kasko) klären: Kasko-Anspruch oder Selbstzahler?"
  - `'ja'` → kein Warn (optional Info „Kasko-Anspruch über eigene Versicherung").
  - `'nein'` → „Selbstzahler — kein Haftpflicht-/Kasko-Anspruch."
- [ ] **Step 3:** tsc. Commit.

### Task 5: Verifikation + PR

- [ ] **Step 1:** `npm run build` (+ 8GB heap falls OOM) + 4 Ratchets (`check:token-audit`, `check:component-set`, `check:status-registry`, `check:knip`) + `npx vitest run`. Environmental (missing dev-deps `@turf/union`/`jsqr`) ist kein Blocker — CI baut clean.
- [ ] **Step 2:** e2e-Prod-Smoke-Spec `tests/e2e/flows/dispatcher-eigene-versicherung.spec.ts` (`// Run:`-Header, `loginContextOrSkip(browser,'dispatch')` aus `_golden-path-lib`): Dispatcher-Lead öffnen, schuldfrage=eigenverantwortung → eigene_versicherung-Control sichtbar → ja setzen → speichern → assert (DB via `serviceClient`/`assertRow` ODER UI Q1/Warnung). Post-merge-CI fährt gegen app.claimondo.de.
- [ ] **Step 3:** Push + `gh pr create --base staging`. PR-Body: Scope, Koordination (6f60c510 derive greift; Teil 1/2b bleibt ihre Lane), kein DDL.
- [ ] **Step 4:** 6f60c510 informieren (Marker/Update): Determinanten-Capture live → ihr derive löst die 15 Lücken jetzt auf.

## Self-Review (gegen Spec)
- §5.1 Files → Tasks 1–4. §5.3 Q1 → Task 2 (exakter Code). §5.2 Feld → Task 3. §5.4 Warnung → Task 4. §6 Testing → Task 2 (engine) + Task 5 (e2e/build). §7 Rollout → Task 5.
- Kein DDL/convert/view-Task (Nicht-Ziele eingehalten). RE-VERIFY-Schritte (Task 1) decken die offenen Punkte §8.
