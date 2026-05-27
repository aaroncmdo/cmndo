# Session-Handoff — Claim-Phasen-SSoT: MP-4 KOMPLETT + auf staging VERIFIZIERT → MP-5 als Nächstes (2026-05-27, Session 5)

> **Für die nächste Session reicht:** Memory-Leitstern `project_claim_phasen_ssot_architektur` + **dieses Doc**
> + den **MP-4-Plan** (§5) + **`cmm44-subphasen-mapping.md` §8–§12** (§5) lesen, dann bei **§3 (MP-5)** einsteigen.
> **ERST `npm ci` im Worktree** (§4 — sonst sind tsc/vitest/build kaputt).
> Vorgänger-Handoff (der MP-4 GEBAUT hat): `SESSION-HANDOFF-claim-phasen-mp4-COMPLETE-2026-05-27.md`.

---

## 0 · Der Auftrag (Strecke-Kontext)

Claim-Phasen-SSoT-Vollmigration (Master **CMM-44**). Phase = **abgeleitet** aus den Owning-Sub-Entities
(Lead / Auftrag / Kanzleifall / `claims.status`), **4 Hauptphasen** erfassung→begutachtung→regulierung→
abschluss (Termin orthogonal als Dispatch-Achse). MP-Strecke MP-0…MP-9. Business-Logic gelockt
(DE-1…4 + B-1…15, siehe `cmm44-subphasen-mapping.md` §10/§11). **MP-4 (Reader-Rewrite, 4a–4e) ist durch**:
ALLE Portale lesen die Phasen-**Anzeige** aus dem 4-Phasen-`getClaimLifecycle`/`v_claim_phase`-Modell
statt aus der toten 10-Phasen/52-Subphasen-Matrix bzw. dem `claims.phase`-11-Code.

---

## 1 · Was Session 5 erreicht hat (MP-4 staging-verifiziert + Hydration-Cleanup)

- **MP-4 auf staging gesmoket + verifiziert** (im MP-4-Bau war der Smoke nur lokal): alle Portale rendern
  das 4-Phasen-Modell, **0 pageerror** (final, empirisch). Harness: `scripts/smoke-cmm44-mp4-staging.mjs`,
  Doc: `docs/27.05.2026/cmm44-mp4-staging-smoke-2026-05-27.md`. Belegt:
  - Admin-Kanban (4 Spalten + Card-Hover-Pipeline, 53/12/0/0) · Admin/KB-Fallakte-`aside` (4-Phasen vertikal)
  - Kanzlei-Kanban + Mandate (als Admin **und** Kanzlei-Rolle) · Kunde Progress-Card + ClaimStepper
  - Kunde + Makler via **Seed-Fixture** nachgezogen (Test-Accounts hatten 0 Echtdaten — §7-Lücke des MP-4-Handoffs).
- **Fallakte React #418 gefixt** (pre-existing, vor MP-4, kosmetisch — React recovered, Seite rendert):
  echte Quelle = verschachteltes `<a>` in `FallKontakteCard/KontaktRow` (Profil-`<Link>` umschloss tel/mailto-
  `<a>`) → **PR #1871** (verifiziert: 0 pageerror nach Deploy). 2 **Misdiagnose-PRs** davor (raten aus
  prod-minified): **#1865** (tz in PhaseStep/SubphaseStepper) + **#1867** (SlaAlerts `Date.now()`-mount-gate)
  — bleiben als **valide Hydration-Hygiene** (echte latente Mismatch-Quellen), waren aber NICHT die #418.
- **Seed-Fixture** (geteilte Prod-DB, reversibel, **behalten**): Claim **CLM-2026-00203** = `cccc5555-…-50`
  (claim+fall, `id==claim_id`), Lead `…51`, makler_consent `…52` → test-kunde ownt + test-makler-Consent.

---

## 2 · Aktueller Stand (staging)

- **staging hat:** MP-4a–e + die 3 Hydration-PRs (#1865/#1867/#1871) — alle via sync-watcher gemergt.
- **`claims.status`** trägt noch das ALTE CHECK-Set (`dispatch_done`/`in_bearbeitung`/`in_kommunikation_vs`/
  `reguliert`/`abgelehnt`/`an_externe_kanzlei_uebergeben`/`storniert`) — **NICHT** das B-11-Terminal-Vokabular
  → die `abschluss`-Anzeige ist heute inert/forward-ready. CHECK-Erweiterung + terminal-Writer = **MP-7/8**.
- **`lexdrive_case_id`** durchgehend null → die Kanzlei-Fälle stehen in `begutachtung` (Interim
  `kanzlei_uebergabe`), nicht `regulierung`. Regulierung beginnt sobald lexdrive_case_id gesetzt wird (MP-8).
- **0-Consumer-Dead-Code wartet auf Drop (MP-5/6):** `buildPhasePipelineData` (`subphase-visibility.ts:613`),
  `SUBPHASE_VISIBILITY` (`:82`), `PHASE_META` (`:40`); ggf. `app/dev/phases` (10-Phasen-Mock, prod-gated via
  `if (NODE_ENV==='production') notFound()`).

---

## 3 · NÄCHSTER SCHRITT — MP-5 (hier einsteigen)

**MP-5 = 52-Substate-Rollen-Visibility 1:1 (DE-2).** Anderer Charakter als MP-4 (nicht mehr nur Anzeige-
Struktur, sondern **Rollen-Feinsichtbarkeit der Substates**). Erst Plan/Brainstorm der Map, dann Code — nicht
blind.

**Code-Anker (origin/staging, Zeilen Stand 27.05.):**
- `src/lib/claims/lifecycle.ts` — `ClaimMainPhase` (4 Werte), `ClaimSubPhase` (13 Werte, `:25`),
  `MAIN_PHASE_LABEL` (`:74`), `SUBPHASE_LABEL` (`:81`), `mainPhaseOf` (`:108`), `toClaimSubPhase` (`:210`).
- `src/lib/fall/subphase-visibility.ts` — **`buildClaimPhasePipeline` (`:694`)**; Zeile **`:698`
  `void rolle // MP-5: Rollen-Feinsteuerung der Substates; 4 Hauptphasen sind rollenneutral.`** = **DER
  Einstiegspunkt**. Die alte 52-Matrix `SUBPHASE_VISIBILITY` (`:82`, 52 Subphasen × 5 Rollen × label/visible)
  + `buildPhasePipelineData` (`:613`) + `PHASE_META` (`:40`) sind **0-Consumer** (von MP-4 entkoppelt).

**Schritte:**
1. Die `SUBPHASE_VISIBILITY`-Rollen-Matrix **neu aufs 4-Phasen-Modell mappen** — d.h. pro `ClaimSubPhase`
   (13 Werte) + Rolle festlegen, welches Label / welche Sichtbarkeit gilt. Heute trägt `buildClaimPhasePipeline`
   `rolle` nur als no-op (`void rolle`, `:698`); MP-5 verdrahtet die Rollen-Feinsteuerung der Substate-Labels
   darauf. **Quelle der Wahrheit für die 52→13-Zuordnung:** `cmm44-subphasen-mapping.md` §8/§9 + die 52-Key-
   Klassifikation im MP-1-Handoff (§5).
2. **Treffermenge vor/nach vergleichen** (welche Rolle sah welche Subphase → welche sieht welchen Substate)
   + **gebrandetes Kunde-Portal smoken** (Whitelabel-Sicht via `resolveKundenTheme` — verifizierter SV mit
   `use_custom_branding`). Der MP-4-Smoke-Harness (§4) deckt die Rollen ab; Branding zusätzlich gegenchecken.
3. **DANN** `buildPhasePipelineData` + `SUBPHASE_VISIBILITY` + `PHASE_META` droppen (0-Consumer, grep-
   verifiziert) + Tests in `src/lib/fall/subphase-visibility.test.ts` anpassen.

**Danach (eigene, größere Strecken — §5-Pläne):**
- **MP-6 — System-A-Drop:** `calc_claims_phase`-Trigger (+ Replaces aar838/aar839/search_path_lock) +
  `claims.phase`-Spalte droppen; Listen/Kanban/RLS lesen `v_claim_phase`. **Vorher:** alle `claims.phase`-
  Reader weg (MP-4 hat die Anzeige-Reader migriert; Rest-Reader siehe MP-4-Plan §2 + `aktuelle_phase`-View-
  Spalten-Drop = DE-3-Cleanup).
- **MP-7/8 — Writer:** `claims.status`-CHECK um B-11-Terminal-Vokabular erweitern + terminal-Writer
  (KB/Kanzlei setzt `erfolgreich_reguliert`/`storniert`/`klage_rechtsstreit`/`verjaehrt`) + `lexdrive_case_id`-
  Setzen (regulierung-Eintritt) + no-show/storno-Counter + **`ManualPhaseOverride`-Redesign** (in MP-1
  disabled) + **Ersatz für den in MP-4c entfernten Admin-Kanban-Status-Drag** (Status-Wechsel laufen aktuell
  nur über die Fallakte/EndzustandDropdown).
- **MP-9 — Drift-Gate:** Parity-Probe als CI-Step (getClaimLifecycle ↔ v_claim_phase bitgleich halten).
  Script-Stub vorhanden: `scripts/probe-claim-phase-parity.mjs`.

**Quer-Tasks:** `claim_payments.empfaenger` (DE-4); Kanzlei-Inline-`v_claim_phase`-Load auf `getClaimPhaseMap`
adoptieren (MP-4d inline, MP-4e extrahierte den Helper); `vs_ablehnungsgrund` live-verify; Pflichtdok-Matrix-
Re-Map (B-14, eigenes Ticket); **Cookiebot-Script-Hydration-Mismatch** (global, §6).

**Koordination:** `src/components/shared/fall-phases/*` + `src/lib/fall/subphase-visibility.ts` sind die
File-Domäne der (idle) mp4b-Session (`kitta/cmm44-claim-phase-mp4b`). Vor dem Verdrahten abstimmen +
`git rebase origin/staging` vor jedem PR.

---

## 4 · Worktree / Env (PFLICHT zuerst) + Smoke + Hydration-Debug-Rezept

```
cd .claude/worktrees/<dein-worktree>
rm -f node_modules        # falls Symlink aufs Main-Repo (degradiert mitten in Sessions)
npm ci                    # eigenes reales node_modules — tsc/vitest/build/next-dev laufen erst dann
```

- **Voller `next build` OOMt bei Default-Node-Heap (~4 GB)** in der TS-Pass (exit 134) →
  `NODE_OPTIONS=--max-old-space-size=8192 npm run build`. Stale `.next/dev/types` → `rm -rf .next` vor Build.
- **Migrationen** via `npx supabase db push --linked --yes` (AGENTS Regel 2 — nie Management-API-DDL).
- **Staging-Smoke (NEU, Session 5):** `node scripts/smoke-cmm44-mp4-staging.mjs` → Basic-Auth via
  `httpCredentials` (`STAGING_BASIC_AUTH_*` aus `.env.local`), Form-Login alle Test-Accounts
  `test-*@claimondo.de` / `Test1234!` (2FA off), **Viewport**-Screenshots (NICHT fullPage — Fallakte hat
  Realtime → `networkidle` nie) + Phasen-Label-Textsignal + pageerror-Capture → `docs/27.05.2026/
  smoke-mp4-staging/`. **playwright via `@playwright/test` importieren** (Repo-Pin 1.59 → Browser-Build 1217
  gecacht; `npm i playwright` unpinned will 1223 → Executable-Mismatch).
- **Seed-Fixture (für Kunde/Makler-Smokes):** CLM-2026-00203 (`cccc5555-…-50` claim+fall, `…51` lead,
  `…52` makler_consent). Cleanup-SQL im Smoke-Doc. **Kunde-Fixture-Rezept:** `claims.status≠'neu'` +
  `created_via='lead_konvertierung'` + `onboarding_complete=true` (sonst Redirect auf `/kunde/onboarding`).
- **Hydration-Debug-Rezept (#418-Lesson, WICHTIG):** prod-minified `#418` verschweigt die Quelle (`args[]=HTML`
  ist generisch) → **lokaler `next dev`** (Port ≠3000, isoliert; eine Seite laden, Server **sofort killen**
  wegen Prod-DB-Connection-Pool) → React-Dev loggt die exakte „Server: X / Client: Y"-Diff + Komponenten-Stack.
  Probe: `scripts/probe-fallakte-hydration.mjs`. **Nicht aus prod-minified raten** (kostete 2 PRs).

---

## 5 · Artefakte + Original-Pläne (Querverweise MIT Erklärungen)

> Reihenfolge = Lese-Empfehlung. „WAS" = Inhalt, „WANN" = wann du es brauchst.

1. **Memory-Leitstern (ZUERST):** `project_claim_phasen_ssot_architektur`
   - WAS: Der claims-as-SSoT Phasen-Schnitt + der promotete Produkt-Mehrwert (Brainstorm 26.05., Aaron-
     Durchbruch). Phase = Aggregation der 3 Lifecycles via `getClaimLifecycle` + Termin orthogonal. Komplette
     MP-Historie inkl. MP-4a–e-Deliverables + alle Lessons.
   - WANN: immer zuerst — der „warum so"-Kontext der ganzen Strecke.

2. **Dieses Doc + Vorgänger:** `SESSION-HANDOFF-claim-phasen-mp4-COMPLETE-2026-05-27.md`
   - WAS: wie MP-4 (4a–e) gebaut wurde (Increment-Tabelle, Kern-Bausteine, lokaler Smoke, Gotchas).
   - WANN: wenn du verstehen willst, was MP-4 konkret geändert hat, bevor du auf MP-5 draufbaust.

3. **AUTORITATIVE Spec/Karte:** `docs/27.05.2026/cmm44-subphasen-mapping.md` **§8–§12**
   - WAS: Owning-Sub-Entity-Map, Event-/Writer-Katalog, Architektur, **Business-Logic B-1…15**, Plan-Delta.
     §8/§9 = die 52-Subphasen → 13-ClaimSubPhase/4-Hauptphasen-Zuordnung.
   - WANN: **DIE Referenz für MP-5** (Schritt 1: welche Subphase → welcher Substate/welche Rolle) und für
     MP-6+ (Writer/Events). Bei jeder „was gilt eigentlich"-Frage hier nachschlagen.

4. **MP-4-Plan (das Original der Reader-Strecke):** `docs/27.05.2026/cmm44-mp4-reader-rewrite-plan-2026-05-27.md`
   - WAS: 3-Vokabular-Tangle (10-Phasen vs 52-Subphasen vs claims.phase-11), **Reader-Inventar 14 Consumer**,
     die **MP-4/MP-5-Grenze**, Increment-Plan 4a→e, Aaron-Entscheidungen (4-Phasen rendern / Kanban 4 Spalten /
     Klage = abschluss-Substate).
   - WANN: für die exakte MP-4/MP-5-Grenze + welche Reader schon migriert sind (Rest-Reader = MP-6).

5. **MP-1-Handoff (52-Key-Klassifikation):** `docs/27.05.2026/SESSION-HANDOFF-claim-phasen-mp1-2026-05-27.md`
   - WAS: Ur-Kontext + die Klassifikation aller 52 Subphasen-Keys.
   - WANN: Schritt 1 von MP-5 — die Quell-Liste, die du aufs 4-Phasen-Modell re-mappst.

6. **Ur-Plan MP-0..9 (verschmolzen):** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md` (PR #1821)
   - WAS: der Gesamt-Plan MP-0 bis MP-9 in einem Stück.
   - WANN: für den Überblick „wo stehe ich, was kommt nach MP-5".

7. **Architektur/Brainstorm (Ur-Schnitt, 26.05.):** `docs/26.05.2026/cmm44-claim-phasen-plan-2026-05-26.md`
   (P0–P5) + `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md`
   - WAS: der ursprüngliche Schnitt (P0–P5) bevor er zu MP-0..9 wurde + die SP-Strategie-Einbettung.
   - WANN: wenn du die Herkunft einer Entscheidung verstehen willst.

8. **MP-2-Doc:** `docs/27.05.2026/cmm44-mp2-resolver-rebase-2026-05-27.md` · **MP-3-Doc:**
   `docs/27.05.2026/cmm44-mp3-v-claim-phase-2026-05-27.md`
   - WAS: MP-2 (Resolver-Rebase) + MP-3 (`v_claim_phase`-View-Ableitung; die SQL-Spiegel-View, die für
     MP-6 die `claims.phase`-Reads ersetzt).
   - WANN: für die DB-Seite (v_claim_phase ist `FROM faelle f LEFT JOIN claims c ON c.id=f.id` —
     **Invariante faelle.id==claims.id**).

9. **Vollmigrations-Audit (Master-Strategie):** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`
   - WAS: die übergeordnete faelle-DROP-Strategie (Phase 0–6), in die MP-0..9 eingebettet ist.
   - WANN: für den großen Bogen (wann stirbt `faelle`).

10. **Session-5-Smoke + #418-Fixes:** `docs/27.05.2026/cmm44-mp4-staging-smoke-2026-05-27.md` +
    PRs **#1865** (tz) / **#1867** (SlaAlerts) / **#1871** (nested-`<a>`, die echte #418).
    - WAS: der Staging-Smoke-Befund + die Hydration-Saga.
    - WANN: als Beleg dass MP-4 sauber ist + als Vorlage für künftige Portal-Smokes.

**Code-Anker (kompakt):** `src/lib/claims/lifecycle.ts` · `src/lib/claims/get-claim-lifecycle-for-claim.ts` ·
`src/lib/claims/claim-phase-map.ts` (`getClaimPhaseMap` — Service-Read von v_claim_phase für Listen/Kanban) ·
`src/lib/fall/subphase-visibility.ts` (`buildClaimPhasePipeline:694` + 0-Consumer-Matrix) ·
`supabase/migrations/20260527075024_cmm44_mp3_v_claim_phase_lexdrive_abschluss.sql` (`v_claim_phase`) ·
`src/components/shared/fall-phases/*` (PhasePipeline/PhaseStep/FallPhasenPanel) ·
`src/app/admin/faelle/(hub)/{page,FaelleKanban}.tsx` · `src/app/kanzlei/{kanban,mandate}/*` ·
`src/lib/makler/queries.ts` + `src/components/makler/*` · `src/app/faelle/[id]/*` + `src/app/kunde/faelle/[id]/*`.

---

## 6 · Gotchas / Lessons (nicht nochmal reinlaufen)

- **#418 zuerst diagnostizieren, dann fixen (Session-5-Lesson):** prod-minified Hydration-Errors sind nicht
  erratbar → lokaler `next dev`-Verbose-Lauf holen (exakte Diff + Komponenten-Stack), DANN fixen. 2 PRs
  verbrannt durch Raten (#1865/#1867).
- **`<a>` in `<a>` = #418:** Profil-`<Link>` darf keine tel/mailto-`<a>` umschließen (`validateDOMNesting`).
  Pattern: interaktive Anchors als **Geschwister** rendern, nicht als Nachfahren (siehe FallKontakteCard-Fix #1871).
- **`claims` hat KEIN `kunde_id`:** Kunde-Ownership = `claims.geschaedigter_user_id` + `claim_parties(user_id,
  rolle='geschaedigter')` + `faelle.kunde_id` (legacy FK, `getKundeFaelle` Pfad 1b). Spalten **live** prüfen
  (`information_schema`), Snapshots sind stale.
- **`v_claim_phase` braucht `faelle.id==claims.id`:** alte Seeds mit getrennten UUIDs fallen aus der View.
- **`v_claim_phase` ist `security_invoker`:** für Kanzlei/Makler (eingeschränkte RLS) → **Service-Read der
  vorgefilterten IDs** (`getClaimPhaseMap`), sonst falsche Phase. Kein Leak.
- **Makler-Portal surfaced synthetische Fälle nicht** (Liste leer trotz Count=1) — Daten/RLS sind ok (RLS
  `faelle_makler_read` consent-basiert), aber App-Query/Provenance braucht echten Lead→promotion_code-Pfad.
  Für Makler-Smokes ggf. volle Provenance seeden, nicht nur Consent.
- **Builder additiv halten:** `buildClaimPhasePipeline` läuft NEBEN `buildPhasePipelineData`; Drop der 52-Matrix
  erst wenn 0-Consumer (= jetzt, MP-5/6).
- **Worktrees teilen `.git`:** paralleler `git fetch` schiebt `origin/staging` vor → `git diff origin/staging`
  zeigt Phantom-Deletions. `git rebase origin/staging` vor jedem PR.

---

## 7 · Housekeeping / Offene Punkte

- **Audit-Doc-Korrektur:** in diesem PR mit-korrigiert (das Smoke-Doc nannte zuerst „tz" als #418-Ursache →
  echte Quelle ist nested-`<a>` #1871; #1865/#1867 = Hygiene).
- **Cookiebot-Script-Hydration-Mismatch (global, separat):** der lokale Dev-Lauf zeigte zusätzlich einen
  Attribut-Mismatch am Cookiebot-`<Script>` in `RootLayout` (`__html`/type/charset/src server≠client). Das ist
  eine **globale, recoverable** Warning **ohne** Pageerror (Kanban/Kunde haben sie auch + 0 pageerror) → eigenes
  Ticket wert, **nicht** Teil der Fallakte-#418.
- **Seed-Fixture behalten** (nützlich für Kunde/Makler-Smokes) — oder via Cleanup-SQL entfernen (Smoke-Doc).
- **Worktree-Cleanup:** Branches `kitta/cmm44-mp4-hydration-fix` / `…-sla-alerts-hydration` /
  `…-fallakte-nested-anchor` sind gemergt; Worktree `cmm44-mp4-hydration-fix` (+ kopierte `.env.local`) kann weg.
