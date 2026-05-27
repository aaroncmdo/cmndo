# Session-Handoff — Claim-Phasen-SSoT: MP-2 + MP-3 gemerged, MP-4 gestartet (2026-05-27, Session 3)

> **Für die nächste Session reicht:** Memory-Leitstern `project_claim_phasen_ssot_architektur` +
> dieses Doc + den **MP-4-Plan** `docs/27.05.2026/cmm44-mp4-reader-rewrite-plan-2026-05-27.md` lesen,
> dann bei **§3 (MP-4b)** einsteigen.
> **ERST `npm ci` im Worktree** (§4 — sonst sind tsc/vitest/build kaputt).

---

## 0 · Der Auftrag (Strecke-Kontext)

Claim-Phasen-SSoT-Vollmigration (Master `CMM-44`). Phase = **abgeleitet** aus den Owning-Sub-Entities
(Lead/Auftrag/Kanzleifall/Termin/claims.status), 4 Hauptphasen erfassung→begutachtung→regulierung→
abschluss. MP-Strecke MP-0…MP-9. Business-Logic gelockt (DE-1…4 + B-1…15, siehe
`cmm44-subphasen-mapping.md` §10–§12). Diese Session hat MP-2 + MP-3 gemerged und MP-4 (Reader-Rewrite)
gestartet.

---

## 1 · Was diese Session erreicht hat

- **MP-2 — `resolveSubphase` Read-Swap (GEMERGED, PR #1836 → staging):** System B (33 Ops-Subphasen) liest
  jetzt die Owning-Sub-Entities (kanzlei_faelle/auftraege/gutachten/claims/leads/gutachter_termine) statt der
  sterbenden `v_faelle_mit_aktuellem_termin`-View. Assembly-Loader `getSubphaseResolverInput`. vitest 36/36,
  Parity view↔owning 64/65 (1 nur_gutachter-FIN-Datengap dokumentiert). Doc:
  `docs/27.05.2026/cmm44-mp2-resolver-rebase-2026-05-27.md`.
- **MP-3 — `v_claim_phase` + `getClaimLifecycle` neue Ableitung (GEMERGED, PR #1838 → staging):** Migration
  `20260527075024` via CLI auf Prod appliziert. regulierung-Eintritt = `kanzlei_faelle.lexdrive_case_id IS
  NOT NULL` (B-10); Interim (kf da, lexdrive null) = begutachtung-Tail `kanzlei_uebergabe`; abschluss =
  `claims.status`-terminal (B-11/B-12, Substates erfolgreich_reguliert/storniert/klage_rechtsstreit/
  verjaehrt). **Live-Shift: exakt 12 kanzlei_faelle regulierung→kanzlei_uebergabe.** Parity 0/65. Doc:
  `docs/27.05.2026/cmm44-mp3-v-claim-phase-2026-05-27.md`.
- **MP-4-Plan (Aaron-approved):** `docs/27.05.2026/cmm44-mp4-reader-rewrite-plan-2026-05-27.md`. Aaron-
  Entscheidungen bestätigt: (1) 4-Phasen-Modell rendern, 52-Substate-Rollen-Visibility 1:1 = MP-5;
  (2) Kanban künftig 4 Hauptphasen-Spalten; (3) Klage = abschluss-Substate-Badge (kein Schritt);
  (4) Reihenfolge MP-4a→e.
- **MP-4a (GEMERGED/merging, PR #1844 → staging):** `shared/claims/{ClaimPhaseBadge,PhasePipeline,
  phase-mappings}` (11-Code, 0 Consumer) gelöscht. tsc 0 src-Fehler.

---

## 2 · Aktueller Stand

- **staging hat:** MP-2 + MP-3 (+ MP-4a sobald #1844 durch ist — vor Start prüfen).
- **`claims.status`-Vokabular** trägt noch das ALTE CHECK-Set (dispatch_done/in_bearbeitung/…/reguliert/
  abgelehnt/storniert) — **NICHT** das volle B-11-Terminal-Vokabular. abschluss-Branch ist deshalb heute
  inert (forward-ready). CHECK-Erweiterung + terminal-Writer = **MP-7/8**.
- **Branches:** `kitta/cmm44-claim-phase-mp4` (= Plan + MP-4a, in PR #1844) · `kitta/cmm44-claim-phase-mp4b`
  (dieses Handoff-Doc; sonst noch leer für MP-4b). **Empfehlung nächste Session:** MP-4b frisch off
  `origin/staging` branchen (nach #1844-Merge), NICHT auf mp4b stacken (Squash-Drift vermeiden).

---

## 3 · NÄCHSTER SCHRITT — MP-4b (hier einsteigen)

**Ziel:** Die shared Phasen-Anzeige von der 10-Phasen/52-Subphasen-Matrix auf das 4-Phasen-`getClaimLifecycle`-
Modell umstellen (KEINE Klage-Hauptphase, abschluss-Substates, Side-Quests parallel).

1. **Builder:** Neue Funktion (z.B. `buildClaimPhasePipeline(lifecycle: ClaimLifecycle, rolle): PhaseStepData[]`)
   die aus `getClaimLifecycle`-Output **4** PhaseStepData baut (erfassung/begutachtung/regulierung/abschluss);
   aktive Phase = `mainPhase`, aktive Subphase-Label aus `SUBPHASE_LABEL[subPhase]` (`lifecycle.ts`);
   abschluss zeigt den terminalen Substate; Side-Quests aus `aktiveSideQuests`. Ersetzt/ergänzt
   `buildPhasePipelineData` in `src/lib/fall/subphase-visibility.ts`. **TDD** (Input lifecycle → 4 Phasen).
2. **`FallPhasenPanel`** (`src/components/shared/fall-phases/FallPhasenPanel.tsx`, 3 Variants aside/
   progress-card/header-strip) auf `lifecycle`-Input umstellen (statt `FallForPipeline`/`aktuelle_phase`).
   `PhasePipeline`/`PhaseStep` rendern PhaseStepData generisch — sollten mit 4 Phasen ohne große Änderung
   laufen (prüfen: progress-card-Progress%, header-strip terminal-Badge `storniert`).
3. **Caller wiren** (laden `getClaimLifecycleForClaim(admin, fallId)` + reichen `lifecycle` durch):
   - `src/app/faelle/[id]/page.tsx` (Admin/SV/KB-Fallakte → `FallakteShell` → FallPhasenPanel; lädt heute
     `fall` + `subphase`=resolveSubphase, ~Z.780 ist der MP-2-Resolver-Call — getClaimLifecycle daneben laden).
   - `src/app/gutachter/fall/[id]/FallDetailClient.tsx` + `_components/FallHeader.tsx` (SV).
   - `src/app/kunde/faelle/[id]/page.tsx` lädt `getClaimLifecycleForClaim` **schon** (Z.48/504 für ClaimStepper,
     MP-3 ✓) — nur an FallPhasenPanel durchreichen (Z.851).
4. **Verifikation:** TDD-Builder grün · **voller `npm run build`** · **Smoke Admin/SV/Kunde-Fallakte**
   (Screenshot: Phasen-Panel zeigt 4 Phasen, kanzlei_uebergabe-Interim bei den 12 Kanzlei-Fällen, keine
   Klage-Hauptphase). PR `--base staging`, NICHT self-mergen (sync-watcher).

**Danach (eigene PRs, §5 im Plan-Doc):** MP-4c Admin-Kanban (`FaelleKanban` Spalten → `v_claim_phase.main_phase`
4 Buckets; `admin/faelle/(hub)/page.tsx` lädt v_claim_phase) · MP-4d Kanzlei (kanban+mandate) · MP-4e
Makler (`MaklerAktenList`/`MaklerAkteDetail`/`makler/queries.ts`) + `kunde/FallStatusCard`. Dann MP-5
(Visibility 1:1 — die 52-Substate-Rollen-Matrix neu aufs 4-Phasen-Modell mappen, gebrandetes Kunde-Portal
smoken), MP-6 (System-A-Drop), MP-7/8 (Writer: claims.status-CHECK + terminal-Writer + lexdrive-Setzen +
no-show/storno + Override-Redesign), MP-9 (Drift-Gate).

---

## 4 · Worktree / Env (PFLICHT zuerst) — die Env-Lesson

Das Worktree-`node_modules` (`.claude/worktrees/cmm44-claim-phase-mp1`) ist ein **Symlink** aufs Main-Repo-
`node_modules`. Das degradierte mitten in dieser Session (leeres `.bin`, `vitest/config` + `next`
unauflösbar → tsc/vitest/build kaputt; vermutlich hat eine andere Session das Main-`node_modules`
angefasst). **Fix (vor jeder UI-/Build-Arbeit):**

```
cd .claude/worktrees/cmm44-claim-phase-mp1
unlink node_modules    # bzw. rm -f node_modules (entfernt nur den Symlink)
npm ci                 # eigenes reales node_modules im Worktree (isoliert, ~2-3 Min)
```

Das repariert tsc/vitest/build **und** beseitigt den `require-in-the-middle`-Build-Block aus MP-2/3
(`next build` lief vorher nicht, weil das symlink-`node_modules` die transitive Sentry/OTel-Dep nicht
auflöste). Nach `npm ci`: `node -e "require.resolve('next/package.json')"` muss OK sein. **Migrationen** weiter
via `npx supabase db push --linked --yes` (Regel 2; DB-Passwort in Memory `Claimondo Infrastruktur-Referenz`,
oder Keyring-cached). **Probes** (node type-strip, kein node_modules-Type-Resolve nötig):
`scripts/probe-claim-phase-parity.mjs` + `scripts/probe-claim-phase-mp3-logic.mjs`.

---

## 5 · Artefakte + Original-Pläne (Verweise)

- **Memory-Leitstern (zuerst):** `project_claim_phasen_ssot_architektur` (komplette MP-Historie + MP-4-Block).
- **MP-4-Plan (DAS Original für die nächste Session):**
  `docs/27.05.2026/cmm44-mp4-reader-rewrite-plan-2026-05-27.md` (Vokabular-Tangle, Reader-Inventar 14
  Consumer, MP-4/MP-5-Grenze, Increment-Plan 4a→e, offene Entscheidungen).
- **Autoritative Spec/Karte:** `docs/27.05.2026/cmm44-subphasen-mapping.md` §8–§12 (Owning-Map + Event-Katalog
  + Architektur + B-1…15 + Plan-Delta).
- **MP-1-Handoff (Ur-Kontext):** `docs/27.05.2026/SESSION-HANDOFF-claim-phasen-mp1-2026-05-27.md`.
- **MP-2-Doc:** `docs/27.05.2026/cmm44-mp2-resolver-rebase-2026-05-27.md` · **MP-3-Doc:**
  `docs/27.05.2026/cmm44-mp3-v-claim-phase-2026-05-27.md`.
- **Ur-Plan MP-0..9:** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md` (PR #1821).
- **Code-Anker:** `src/lib/claims/lifecycle.ts` (getClaimLifecycle, MAIN_PHASE_LABEL/SUBPHASE_LABEL) ·
  `src/lib/claims/get-claim-lifecycle-for-claim.ts` · `supabase/migrations/20260527075024_*.sql` (v_claim_phase) ·
  `src/lib/fall/subphase-visibility.ts` (buildPhasePipelineData + SUBPHASE_VISIBILITY = MP-4b/MP-5-Ziel) ·
  `src/components/shared/fall-phases/*` (FallPhasenPanel/PhasePipeline/PhaseStep/types).
- **PRs:** MP-2 #1836 (merged) · MP-3 #1838 (merged) · MP-4a #1844 (merging).

---

## 6 · Gotchas / Lessons (nicht nochmal reinlaufen)

- **Worktree-Pfad-Disziplin:** ALLE File-Writes mit dem **Worktree**-Pfad (`…\.claude\worktrees\cmm44-claim-
  phase-mp1\…`). Diese Session 3× versehentlich ins Main-Repo geschrieben (Docs) → musste verschoben werden.
- **`npm ci` im Worktree zuerst** (§4) — sonst kein tsc/vitest/build.
- **`;echo` maskiert Exit-Codes** bei `npm run build > log; echo` — der echo-Exit überschreibt den Build-Exit
  in der Task-Notification. Real-Exit separat in den Log schreiben (`rc=$?; echo "EXIT=$rc" >> log`).
- **`v_claim_phase` hat 0 App-SQL-Consumer** (nur Kommentare) — View-Änderungen brechen keinen Reader
  (Reader-Migration läuft erst in MP-4). `getClaimLifecycle` wird nur vom Kunde-`ClaimStepper` live
  konsumiert (+ ab MP-4b von den Fallakte-Pages).
- **sync-watcher** merged build-grüne NICHT-Draft-PRs gegen staging autonom + löscht den Branch → PRs erst
  öffnen wenn fertig; NIE self-mergen; MP-4b frisch off staging branchen (kein Stacking auf mp4b).
- **claims.status-Terminal-Vokabular** ist noch nicht im CHECK → abschluss-Anzeige bleibt bis MP-7/8 leer
  (das ist korrekt/erwartet, nicht „kaputt").
- **`aktuelle_phase`** = `claims.phase` (11-Code, via SP-A2-Repoint), matcht die 52-Matrix-Keys NICHT — der
  Grund warum die alte Pipeline auf Fallback läuft. MP-4 macht das obsolet; der View-Spalten-Drop (DE-3) ist
  Cleanup ganz am Ende (nach allen Readern).
