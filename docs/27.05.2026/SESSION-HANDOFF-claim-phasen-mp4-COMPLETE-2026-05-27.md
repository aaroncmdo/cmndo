# Session-Handoff — Claim-Phasen-SSoT: MP-4 (Reader-Rewrite) KOMPLETT → MP-5 als Nächstes (2026-05-27, Session 4)

> **Für die nächste Session reicht:** Memory-Leitstern `project_claim_phasen_ssot_architektur`
> + dieses Doc + den **MP-4-Plan** (§5 unten) lesen, dann bei **§3 (MP-5)** einsteigen.
> **ERST `npm ci` im Worktree** (§4 — sonst sind tsc/vitest/build kaputt).

---

## 0 · Der Auftrag (Strecke-Kontext)

Claim-Phasen-SSoT-Vollmigration (Master **CMM-44**). Phase = **abgeleitet** aus den Owning-Sub-Entities
(Lead / Auftrag / Kanzleifall / claims.status), **4 Hauptphasen** erfassung→begutachtung→regulierung→
abschluss (Termin orthogonal als Dispatch-Achse). MP-Strecke MP-0…MP-9. Business-Logic gelockt (DE-1…4 +
B-1…15). Diese Session hat **die komplette MP-4-Reader-Rewrite-Strecke (4a–4e)** abgeschlossen: ALLE
Portale lesen die Phasen-**Anzeige** jetzt aus dem 4-Phasen-`getClaimLifecycle` / `v_claim_phase`-Modell
statt aus der toten 10-Phasen/52-Subphasen-Matrix bzw. dem `claims.phase`-11-Code.

---

## 1 · Was diese Session erreicht hat (MP-4 KOMPLETT)

| Increment | Inhalt | PR | Status |
|---|---|---|---|
| **MP-4a** | dead 11-Code `shared/claims/*` gelöscht (+ approved Plan) | #1844 | merged |
| **MP-4b** | `FallPhasenPanel` + neuer Builder `buildClaimPhasePipeline` (Admin/KB-aside + Kunde-progress-card) | #1848 | merged |
| **MP-4c** | Admin-Kanban `FaelleKanban` → 4 Hauptphasen-Spalten (read-only, Drag entfernt) | #1852 | merged |
| **MP-4d** | Kanzlei-Portal (`kanban` + `mandate`) → 4 Hauptphasen | #1855 | merged |
| **MP-4e** | Makler-Portal (`MaklerAktenList` + `MaklerAkteDetail`) → 4 Hauptphasen; dead `kunde/FallStatusCard` gelöscht; **shared `getClaimPhaseMap`** | #1857 | offen (mergeable) |

**Kern-Bausteine (alle auf staging):**
- `src/lib/claims/lifecycle.ts` — `getClaimLifecycle`, `MAIN_PHASE_LABEL` (4), `SUBPHASE_LABEL` (13),
  `mainPhaseOf`, `getMainPhaseIndex`, **+ Guards `toClaimMainPhase` / `toClaimSubPhase`** (MP-4c; TDD).
- `src/lib/fall/subphase-visibility.ts` — **neu `buildClaimPhasePipeline(lifecycle, rolle): PhaseStepData[4]`**
  (MP-4b; 8 TDD-Tests). `buildPhasePipelineData` + `SUBPHASE_VISIBILITY` (52-Matrix) sind jetzt **0-Consumer**
  → Drop in MP-5/MP-6.
- `src/lib/claims/claim-phase-map.ts` — **neu `getClaimPhaseMap(ids)`** (MP-4e): lädt `v_claim_phase`
  (main_phase/sub_phase) via **Service-Client** für RLS-vorgefilterte IDs (Listen/Kanban; rollen-
  eingeschränkte Reader).
- `src/components/shared/fall-phases/FallPhasenPanel.tsx` — liest `lifecycle` statt `aktuelle_phase`.

**Smoke (Screenshots ausgewertet):** Admin-Fallakte-aside (`01 Erfassung·Vollmacht offen → 02 Begutachtung
→ 03 Regulierung → 04 Abschluss`) · Admin-Kanban (4 Spalten, real 53/12/0/0 = MP-3-Verteilung, Card-Hover-
Pipeline) · Kanzlei-Kanban (4 Spalten, 16/12/0/0, Substate-Chips „Vollmacht offen"/„Kanzlei-Übergabe läuft") ·
Kanzlei-Mandate (Phase-Spalte 4-Phase+Substate) · dev-Matrix (alle 3 Variants × 6 States inkl. Side-Quests +
storniert-Pill). **Konsistente 65-Claim-Verteilung** (53 erfassung + 12 begutachtung/kanzlei_uebergabe; 0
regulierung/abschluss — lexdrive_case_id durchgehend null, claims.status-Terminal-Vokabular noch nicht im CHECK).

---

## 2 · Aktueller Stand

- **staging hat:** MP-4a/b/c/d (gemerged via sync-watcher) — und MP-4e sobald #1857 durch ist (vor MP-5 prüfen).
- **`claims.status`-Vokabular** trägt noch das ALTE CHECK-Set (dispatch_done/in_bearbeitung/…/reguliert/
  abgelehnt/storniert) — **NICHT** das volle B-11-Terminal-Vokabular → die `abschluss`-Anzeige ist heute
  inert/forward-ready. CHECK-Erweiterung + terminal-Writer = **MP-7/8**.
- **`lexdrive_case_id`** durchgehend null → die 12 Kanzlei-Fälle stehen in `begutachtung` (Interim
  `kanzlei_uebergabe`), nicht `regulierung`. Regulierung beginnt sobald lexdrive_case_id gesetzt wird (MP-8).
- **0-Consumer-Dead-Code wartet auf Drop (MP-5/6):** `buildPhasePipelineData`, `SUBPHASE_VISIBILITY`,
  `PHASE_META` in `subphase-visibility.ts`; ggf. `app/dev/phases` (10-Phasen-Mock).

---

## 3 · NÄCHSTER SCHRITT — MP-5 (hier einsteigen)

**MP-5 = 52-Substate-Rollen-Visibility 1:1 (DE-2).** Anderer Charakter als MP-4 (nicht mehr nur
Anzeige-Struktur, sondern Rollen-Feinsichtbarkeit):

1. Die `SUBPHASE_VISIBILITY`-Rollen-Matrix (52 Subphasen × 5 Rollen × Label/visible, `subphase-visibility.ts`)
   **neu aufs 4-Phasen-Modell mappen** — d.h. pro `ClaimSubPhase` (13 Werte) + Rolle festlegen, welches
   Label/welche Sichtbarkeit gilt. Heute trägt `buildClaimPhasePipeline` `rolle` nur als no-op (`void rolle`);
   MP-5 verdrahtet die Rollen-Feinsteuerung der Substate-Labels darauf.
2. **Treffermenge vor/nach vergleichen** (welche Rolle sah welche Subphase → welche sieht welchen Substate)
   + **gebrandetes Kunde-Portal smoken** (Whitelabel-Sicht).
3. **DANN** `buildPhasePipelineData` + `SUBPHASE_VISIBILITY` + `PHASE_META` droppen (jetzt 0-Consumer,
   grep-verifiziert) + Tests in `subphase-visibility.test.ts` anpassen.

**Danach (eigene Strecke, §5-Pläne):**
- **MP-6 — System-A-Drop:** `calc_claims_phase`-Trigger (+ Replaces aar838/aar839/search_path_lock) +
  `claims.phase`-Spalte droppen; Listen/Kanban/RLS lesen `v_claim_phase`. **Vorher:** alle `claims.phase`-
  Reader weg (MP-4 hat die Anzeige-Reader migriert; Rest-Reader siehe MP-4-Plan §2 + `aktuelle_phase`-View-
  Spalten-Drop = DE-3-Cleanup).
- **MP-7/8 — Writer:** `claims.status`-CHECK um B-11-Terminal-Vokabular erweitern + terminal-Writer
  (KB/Kanzlei setzt erfolgreich_reguliert/storniert/klage_rechtsstreit/verjaehrt) + `lexdrive_case_id`-
  Setzen (regulierung-Eintritt) + no-show/storno-Counter + **`ManualPhaseOverride`-Redesign** (in MP-1
  disabled) + **Ersatz für den in MP-4c entfernten Admin-Kanban-Status-Drag** (Status-Wechsel laufen
  aktuell nur über die Fallakte/EndzustandDropdown).
- **MP-9 — Drift-Gate:** Parity-Probe als CI-Step (getClaimLifecycle ↔ v_claim_phase bitgleich halten).

**Quer-Tasks:** `claim_payments.empfaenger` (DE-4); Kanzlei-Inline-v_claim_phase-Load auf `getClaimPhaseMap`
adoptieren (MP-4d schrieb es inline, MP-4e extrahierte den Helper); `vs_ablehnungsgrund` live-verify;
Pflichtdok-Matrix-Re-Map (B-14, eigenes Ticket).

---

## 4 · Worktree / Env (PFLICHT zuerst) + Smoke-Rezept

```
cd .claude/worktrees/<dein-worktree>
rm -f node_modules        # falls Symlink aufs Main-Repo (degradiert mitten in Sessions)
npm ci                    # eigenes reales node_modules — tsc/vitest/build/next-dev laufen erst dann
```

- **Voller `next build` OOMt bei Default-Node-Heap (~4 GB)** in der TS-Pass (exit 134, „Compiled
  successfully" davor) → `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
- **Stale `.next/dev/types`-Validator** kann nach einem `next dev` einen Phantom-tsc-Fehler auf gelöschte
  Dev-Pages werfen → `rm -rf .next` vor dem Build.
- **Migrationen** via `npx supabase db push --linked --yes` (Regel 2).
- **Smoke-Login-Rezept (Lessons):** EINEN Login + `ctx.storageState({path})` cachen + reusen (NICHT pro
  Smoke neu einloggen — wiederholte Logins triggern transientes Supabase-Auth-Rate-Limit; Diagnose:
  anon-`signInWithPassword`-node-Probe = Timeout/429, DB-Service-Key bleibt ok). `waitForURL(u=>!/login/)`
  großzügig (90 s) wegen Cold-Dev-Compile. Test-User: `test-admin@` / `test-kunde@` / `test-sv@claimondo.de`
  / `Test1234!` (2FA off). **localhost-Smoke geht** (proxy.ts macht auf localhost nur updateSession).
  **Admin darf in Kanzlei-Portal** (`requirePortalAccess(['kanzlei','admin'])`), **NICHT** ins Makler-Portal
  (`['makler']`). Service-Reads (z.B. v_claim_phase für Listen) brauchen `SUPABASE_SERVICE_ROLE_KEY`.

---

## 5 · Artefakte + Original-Pläne (Querverweise)

- **Memory-Leitstern (zuerst):** `project_claim_phasen_ssot_architektur` (komplette MP-Historie inkl. der
  MP-4a–e-Deliverables-Blöcke + alle Lessons).
- **Architektur/Brainstorm (Ur-Schnitt, 26.05.):** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md`
  + `docs/26.05.2026/cmm44-claim-phasen-plan-2026-05-26.md` (P0–P5).
- **Ur-Plan MP-0..9 (verschmolzen):** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md` (PR #1821).
- **Autoritative Spec/Karte:** `docs/27.05.2026/cmm44-subphasen-mapping.md` **§8–§12** (Owning-Sub-Entity-Map,
  Event-/Writer-Katalog, Architektur, Business-Logic **B-1…15**, Plan-Delta) — *die* Referenz für MP-5+.
- **MP-4-Plan (DAS Original für die Reader-Strecke):** `docs/27.05.2026/cmm44-mp4-reader-rewrite-plan-2026-05-27.md`
  (3-Vokabular-Tangle, **Reader-Inventar 14 Consumer**, MP-4/MP-5-Grenze, Increment-Plan 4a→e, offene
  Entscheidungen — Aaron bestätigt: 4-Phasen rendern / Kanban 4 Spalten / Klage = abschluss-Substate).
- **MP-1-Handoff (Ur-Kontext + 52-Key-Klassifikation):** `docs/27.05.2026/SESSION-HANDOFF-claim-phasen-mp1-2026-05-27.md`.
- **MP-4-Start-Handoff (Vorsession, auf Branch `kitta/cmm44-claim-phase-mp4b`):**
  `docs/27.05.2026/SESSION-HANDOFF-claim-phasen-mp4-2026-05-27.md` (§3 = MP-4b-Einstieg, der diese Session ausführte).
- **MP-2-Doc:** `docs/27.05.2026/cmm44-mp2-resolver-rebase-2026-05-27.md` · **MP-3-Doc:**
  `docs/27.05.2026/cmm44-mp3-v-claim-phase-2026-05-27.md`.
- **Vollmigrations-Audit (Master-Strategie):** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`.
- **Code-Anker:** `src/lib/claims/lifecycle.ts` · `src/lib/claims/get-claim-lifecycle-for-claim.ts` ·
  `src/lib/claims/claim-phase-map.ts` · `src/lib/fall/subphase-visibility.ts` (`buildClaimPhasePipeline` +
  die 0-Consumer-Matrix) · `supabase/migrations/20260527075024_cmm44_mp3_v_claim_phase_lexdrive_abschluss.sql`
  (`v_claim_phase`) · `src/components/shared/fall-phases/*` · `src/app/admin/faelle/(hub)/{page,FaelleKanban}.tsx` ·
  `src/app/kanzlei/kanban/{page,KanbanBoardClient}.tsx` + `src/app/kanzlei/mandate/page.tsx` ·
  `src/lib/makler/queries.ts` + `src/components/makler/{MaklerAktenList,akte-detail/MaklerAkteDetail}.tsx` ·
  `src/app/faelle/[id]/{page,FallakteShell}.tsx` + `src/app/kunde/faelle/[id]/page.tsx`.
- **PRs dieser Session:** MP-4b #1848 · MP-4c #1852 · MP-4d #1855 · MP-4e #1857 (alle `--base staging`,
  sync-watcher, NICHT self-merged).

---

## 6 · Gotchas / Lessons (nicht nochmal reinlaufen)

- **Plan-Inventar kann stale sein:** Reader-Inventar (#2 SV-`FallPhasenPanel`, #9 `kunde/FallStatusCard`)
  listete Consumer, die längst entkoppelt/entfernt waren (SV nutzt `AuftragHeaderPanel`; FallStatusCard
  CMM-36-entfernt, 0-Consumer → gelöscht). **Immer Import-grep statt Inventar-Glaube** vor dem Verdrahten.
- **`v_claim_phase` ist `security_invoker`:** für Admin (volle RLS) ok via RLS-Client; für Kanzlei/Makler
  (eingeschränkte RLS, sehen auftraege/leads NICHT) → **Service-Read der vorgefilterten IDs** (`getClaimPhaseMap`),
  sonst falsche Phase-Ableitung. Kein Leak (nur ohnehin sichtbare Fälle).
- **Worktrees teilen `.git`:** ein paralleler `git fetch` einer anderen Session schiebt `origin/staging`
  lokal vor → `git diff origin/staging` zeigt Phantom-Deletions fremder Commits (aber `git status` vs HEAD
  ist sauber). **Vor jedem PR `git rebase origin/staging`** (clean, wenn kein File-Overlap), sonst „revertet"
  der PR fremde Commits.
- **Builder additiv halten:** `buildClaimPhasePipeline` wurde NEBEN `buildPhasePipelineData` gebaut, damit
  FaelleKanban (MP-4c) nicht vorzeitig bricht. Drop der Matrix erst wenn 0-Consumer (= jetzt, MP-5/6).
- **Admin-Kanban-Drag (MP-4c):** bewusst entfernt (Aaron „4-Phasen read-only") — Phase ist abgeleitet/nicht
  setzbar. Der Status-Writer-Ersatz für das Board ist **MP-7/8** (bis dahin Status-Wechsel via Fallakte).
- **Default-Node-Heap OOMt den Build** + **stale `.next/dev/types`** → siehe §4.

---

## 7 · Offene Verifikation (auf staging gegenchecken)

- **Kunde-Portal** (`/kunde/faelle/[id]`: `FallPhasenPanel` progress-card + `ClaimStepper`) — lokal NICHT
  browser-gesmoket (kein `test-kunde`-Konto mit Claim in dieser DB). Das 4-Phasen-Render-Pattern ist via
  Admin-aside + dev-Matrix bewiesen.
- **Makler-Portal** (`/makler/akten` + `/akten/[id]`) — lokal NICHT gesmoket (Test-Makler hat 0 consent-Fälle;
  Portal makler-only, kein Admin-Zugang). Identisches `getClaimPhaseMap`+`MAIN_PHASE_LABEL`-Pattern ist via
  Kanzlei (MP-4d) gesmoket.
- **Pre-existing (NICHT von MP-4):** Hydration-Warnung (nested-`<a>`, global) + Suspense-Boundary-Warnung im
  Kanzlei-Layout (`TasksPill`, dev-only) — brechen keine Seite (alle 200 + volle Daten).
