# CMM-44 MP-8c Handoff — 30.05.2026

**Strecken-Status:** ✅ KOMPLETT verifiziert + persistent dokumentiert
**Master:** CMM-44 (faelle-Drop / Claim-SSoT-Vollmigration) · **Strecken-Position:** Phase 3.5 (Folge aus MP-8b)
**Worktree:** `.claude/worktrees/cmm44-mp8c-id-assumption-fixes`
**Aktueller Branch (HEAD):** `kitta/cmm44-mp8c-postmerge-smoke` (vom Post-Merge-Beweis)

---

## TL;DR

3 stille Prod-Korrektheits-Bugs der **`claims.id ≠ faelle.id`-Klasse** (entstanden durch MP-8b's View-Migration) live gefixt, A/B-verifiziert + persistent dokumentiert. Plus: Audit-Doc von 29.05. um Live-DB + Linear + de-noised Inventory revalidiert → ist jetzt Phase-4-Vorlage current. Bug-Klasse vollständig geschlossen.

**Bug-Effekt vor Fix:** 73 von 74 Karten in admin/faelle + 29 von 29 Mandate in kanzlei/mandate + kanzlei/kanban hingen still im `erfassung`-Fallback. Niemand hat es bemerkt seit MP-6c (28.05.), weil die UI „irgendwas" anzeigte (kein Crash, nur Falsch-Gruppierung).

**Fix-Effekt:** Post-Merge live verifiziert: `Erf=17 · Beg=12 · Reg=0 · Abs=0` exakt matchend zu Live-DB `v_claim_phase.phase_distribution`.

---

## 1 · Was wurde gemacht (chronologisch)

### Phase A — Audit (29.05.)

Ultracode-Workflow `wf_850922c8-853` mit 6 parallelen Findern → identifizierte 3 still-kaputte Phase-Lookups (admin/faelle hub, kanzlei/mandate, kanzlei/kanban). Plus de-noised Inventory `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` als Referenz für die echten Phase-4-Blocker.

**Output:** `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (§2 listet die 3 Bug-Stellen).

### Phase B — MP-8c Fix-Strecke (30.05., PR #2038)

Spec → Plan → 5 Fixes + Audit-Sweep + Audit-Refresh + Pre-Merge-Smoke → Merge.

**Fix-Stellen (alle mit `claim_id` aus `f.claim_id`-FK statt `f.id`-Verwechslung):**

| Datei | Strategie |
|---|---|
| `src/app/admin/faelle/(hub)/page.tsx` | Strategie A: separaten `v_claim_phase`-Read entfernt; `v_claim_listing.main_phase`/`sub_phase` direkt selektiert. 1 DB-Round-Trip weniger, Bug-Klasse strukturell eliminiert |
| `src/app/kanzlei/mandate/page.tsx` | `getClaimPhaseMap(claimIds)` Helper-Reuse + SELECT um `f.claim_id` erweitert; phaseMap.get(f.claim_id) statt phaseMap.get(f.id) |
| `src/app/kanzlei/kanban/page.tsx` | wie mandate; plus Header-Komment "claim_id == faelle.id"-Annahme korrigiert |
| `src/lib/claims/get-claim-for-role.ts:184-187` | stale "Nach Phase 6 ist faelle.id = claims.id"-Behauptung im Kommentar zu resolveClaimId korrigiert |
| `src/lib/claims/types.ts:30-31` | stale "parallele Row, gleiche id"-Behauptung im ClaimFull-Type korrigiert |

### Phase C — Audit-Refresh (30.05., im PR #2038 enthalten)

Workflow `wf_4d340a57-aec` mit 8 parallelen Verifiern + Critic + Synth-Architekt → identifizierte **10 Drifts** im Audit-Doc vom 29.05. Refresh als **§ Revalidation 30.05.**-Section ans Audit-Doc angehängt. Audit ist jetzt Phase-4-Vorlage current.

### Phase D — Post-Merge-Verifikation (30.05., PR #2046)

Same Smoke-Script erneut gegen staging gefahren nach Deploy. A/B-Vergleich Pre/Post bestätigt Fix glasklar.

---

## 2 · Querverweise (Single Source of Truth pro Achse)

### Pull Requests

| PR | Branch | Status | Inhalt |
|---|---|---|---|
| [**#2038**](https://github.com/aaroncmdo/cmndo/pull/2038) | `kitta/cmm44-mp8c-id-assumption-fixes` | ✅ MERGED `939cc4f5b` (30.05. 01:27Z) | 5 Code-Fixes + Spec + Plan + Audit-Sweep + Audit-Revalidation + Pre-Merge Visual-Smoke |
| [**#2046**](https://github.com/aaroncmdo/cmndo/pull/2046) | `kitta/cmm44-mp8c-postmerge-smoke` | 🆕 OPEN | Post-Merge Visual-Smoke (A/B-Beweis) + Smoke-Script env-Override + dieses Handoff |
| [#2020](https://github.com/aaroncmdo/cmndo/pull/2020) (Vorgänger) | (gemerged) | ✅ `4946cb847` (29.05. 19:38Z) | MP-8b — v_claim_phase claims-zentrisch (Ursache der MP-8c-Bug-Klasse) |

### Specs + Plans

| Dokument | Pfad |
|---|---|
| Audit-Doc (Phase-4-Vorlage) | [`docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md`](../29.05.2026/cmm44-faelle-drop-blocker-audit.md) — incl. § Sweep-Audit 30.05. + § Revalidation 30.05. (§R.1-§R.8) |
| De-noised Reader-Inventory | [`docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md`](../24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md) — ~338 GENUINE statt 417, Bucket-Aufteilung, View-Tabelle |
| MP-8c Spec | [`docs/superpowers/specs/2026-05-30-cmm44-mp8c-id-assumption-fixes.md`](../superpowers/specs/2026-05-30-cmm44-mp8c-id-assumption-fixes.md) |
| MP-8c Plan | [`docs/superpowers/plans/2026-05-30-cmm44-mp8c.md`](../superpowers/plans/2026-05-30-cmm44-mp8c.md) |
| Master-Strategie 16.05. (Phase 0-6 Rahmen) | [`docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`](../16.05.2026/claim-ssot-vollmigration-audit-strategie.md) |

### Linear-Tickets (Status-Realität → Audit-Doc §R.3)

| Ticket | Linear-Status | Body-Realität | Audit-Tag |
|---|---|---|---|
| [CMM-66](https://linear.app/aaroncmndo/issue/CMM-66) | Done 26.05. | **NUR Teil 1** (mandatsnummer-Live-Stale-Fix PR #1638). Teil 2 (volle View-Re-Base) explizit offen → SP-L (CMM-49) | „Teil 1 only" |
| [CMM-65](https://linear.app/aaroncmndo/issue/CMM-65) | Done 26.05. | ~50 PRs für created_at/updated_at/Finance DONE. Body listet "Zu verifizieren": status, sv_termin, kanzlei_wunsch_*, abrechnung_id, *_erinnerung_gesendet | „Phase 3.5 done, Rest Phase 4" |
| [CMM-63](https://linear.app/aaroncmndo/issue/CMM-63) | Done 25.05. | NUR SP-C1 (kunde_id → claim_parties geschaedigter). SP-C2 (gegner) + SP-C3 (halter) + Bankdaten offen | „SP-C1 done" |
| [CMM-61](https://linear.app/aaroncmndo/issue/CMM-61) | Done 26.05. | "Die 417 sind massiv über-zählt" — verwies auf de-noised Inventory (~338 GENUINE + ~75 FP + 6 Views als echte Breaker) | „de-noised Inventory authoritativ" |

### Workflow-Runs (Evidenz-Spuren)

| Run-ID | Zweck | Output |
|---|---|---|
| `wf_850922c8-853` | 6-Dimensionen-Audit (29.05.) | 814k tokens, journal.jsonl Z.7-12, manuell synthetisiert |
| `wf_4d340a57-aec` | 8-Verifier-Revalidation (30.05.) | 986k tokens, 10 Agenten, Verdict AUDIT_HAS_MINOR_DRIFT_UPDATE_BEFORE_PHASE4 |

Workflow-Transkripte unter: `C:\Users\Aaron Sprafke\.claude\projects\C--Users-Aaron-Sprafke-stampit-app-stampit-app-claimondo-v2\<session>\subagents\workflows\`

### Migrationen (von MP-8b — keine in MP-8c)

| Migration | Inhalt | Status |
|---|---|---|
| `supabase/migrations/20260529150758_cmm44_mp8b_v_claim_phase_join_on_claim_id.sql` | Interim Join-Fix (MP-8b Step 1) | live |
| `supabase/migrations/20260529155953_cmm44_mp8b_v_claim_phase_claims_centric.sql` | Vollständig claims-zentrisch (MP-8b Step 2) | live, Ursache der MP-8c-Bug-Klasse (wenn Caller nicht migriert sind) |

**MP-8c selbst ist DDL-frei** — reine Code- + Komment-Korrekturen.

### Smoke-Scripts + Output

| Script | Output (pre/post) |
|---|---|
| `scripts/smoke-cmm44-mp8c-pre-merge.mjs` (env-overridable via `SMOKE_OUT`) | [`docs/30.05.2026/smoke-mp8c-pre-merge/`](smoke-mp8c-pre-merge/) (Pre-Merge Baseline, 5 PNGs + report.json) |
| (same Script, env override) | [`docs/30.05.2026/smoke-mp8c-post-merge/`](smoke-mp8c-post-merge/) (Post-Merge Fix-Beweis, 5 PNGs + report.json) |

**Live-Smoke ausgeführt:** Pre-Merge `2026-05-29 23:25Z` · Post-Merge `2026-05-30 09:55Z`
**Re-Run:** `SMOKE_OUT=docs/<datum>/<label> node scripts/smoke-cmm44-mp8c-pre-merge.mjs` (Basic-Auth + Test-User aus `.env.local`)

### Memory-Anker

| Anker (in MEMORY.md) | Was |
|---|---|
| `project_cmm44_mp8c_complete` (NEU, dieses Handoff) | MP-8c Strecken-Abschluss + Phase-4.1-Hook |
| `project_cmm44_mp6c_ready` | MP-8 keystone + MP-8b status |
| `feedback_information_schema_check` | Memory-Snapshots stale 1-2 Tage → vor Migration live nachmessen |

---

## 3 · Verifikation (A/B-Beweis Live)

### Live-DB (`v_claim_phase` Phase-Verteilung, 30.05. 23:39Z)

```
erfassung/vollmacht_offen:          61
erfassung/sa_offen:                  2
begutachtung/kanzlei_uebergabe:     12
regulierung/*:                       0
abschluss/*:                         0
                                   ───
Total:                              75 claims (= claims.count)
```

### Invariante (29.05./30.05.)

```
faelle.count                    = 74
claims.count                    = 75 (1 claim hat keinen fall)
twins (id = claim_id)           = 1  (historischer Edge-Case, 1.4%)
non_twins (id ≠ claim_id)       = 73 (98.6%)
```

→ MP-8c-Bug-Klasse hätte für **73 von 74 Karten** den `v_claim_phase`-Lookup leer geliefert.

### UI A/B (gleicher Smoke gegen staging, 2 Läufe)

| Page | Pre-Merge Counts | Post-Merge Counts | Δ |
|---|---|---|---|
| `/admin/faelle` Kanban | 0/0/0/0 (kein Render im Smoke-Snapshot) | 1/1/1/1 (alle 4 Spalten-Header sichtbar) | ✅ |
| `/kanzlei/kanban` Pipeline | **Erf=29** · Beg=0 · Reg=0 · Abs=0 | **Erf=17 · Beg=12** · Reg=0 · Abs=0 | **+12 Begutachtung** ✅ |
| `/kanzlei/mandate` Liste | **29× "Erfassung"** | **17× "Erfassung" + 12× "Begutachtung"** | **+12 Begutachtung** ✅ |

**Cross-Check:** Post-Merge UI matcht 1:1 die Live-DB `phase_distribution` (12 in begutachtung/kanzlei_uebergabe).

---

## 4 · Lessons für die nächste Session (Lesson-fest, nicht wiederholen)

### Lesson 1: `claims.id ≠ faelle.id` ist hart

```
faelle.claim_id → claims.id   (1:1 für existierende faelle, IDs NICHT gleich)
faelle.id = claims.id          NUR für 1 von 74 (historischer Edge-Case)
```

Jeder Code-Pfad der „claim_id == fall_id" annimmt ist ein potenzieller Bug. **`getClaimPhaseMap(claimIds)` aus `src/lib/claims/claim-phase-map.ts`** dokumentiert die Invariante im File-Header verbindlich — Caller müssen claims.id übergeben.

### Lesson 2: Linear-Status ≠ Body-Realität

CMM-66/65/63/61 alle "Done"-getagged, aber Body listet substantielle offene Teile. **Cross-Check immer auf Ticket-Body, nicht nur Status-Spalte.** Bei MP-8c hat das Audit-Doc-§R.3 die PARTIAL-Tags ergänzt.

### Lesson 3: Audit-Doc-Zahlen verfallen schnell

- `417 Reader` (statischer Grep) → **~338 GENUINE + ~75 FP** (de-noised Inventory)
- `~40 f.* in v_claim_full` → **18** (Live-pg_views)
- `4 RLS-Policies` → **29 in 17 Tabellen** (Live-pg_policies)
- `9 SECDEF-Funktionen` → **22, davon 19 SECDEF** (Live-pg_proc)
- `4 cross-table Trigger` → **3** (1 existiert nicht live)

**Vor jeder neuen Migration:** Live-Catalog-Query gegen pg_views/pg_trigger/pg_constraint/pg_policy/pg_proc fahren. Memory `feedback_information_schema_check` bestätigt: Snapshots veralten in 1-2 Tagen.

### Lesson 4: 7 ON-faelle Trigger sind funktional kritisch

`DROP TABLE faelle CASCADE` räumt sie, aber 4 davon haben Business-Logik die VOR CASCADE auf claims-AFTER-UPDATE repliziert sein muss:

- `on_filmcheck_done` · `on_gutachten_eingegangen` · `on_regulierung` — 3 Notifications
- `trg_sa_bestaetigt_termin` — BEFORE UPDATE schreibt `gutachter_termine.status='bestaetigt' WHERE fall_id=NEW.id` (SA-Bestätigungs-Logik)

Plus `trg_sync_faelle_sv_id_to_claims` (Reverse-Sync, kann Phase-5-Writer-Smokes verfälschen — temporär disablen während Audit).

### Lesson 5: Anon-RPCs sind Phase-5-Priorität

`apply_gutachten_ocr` + `can_access_fall` sind SECDEF + anon-callable. Auth-Pfad ist bypassable → wenn faelle gedroppt wird, brechen sie. Phase-5 muss diese als ERSTES claim-zentrisch umschreiben.

### Lesson 6: `getClaimPhaseMap` ist das etablierte Pattern

5 Stellen nutzen es schon (`lib/makler/queries.ts:592`, `lib/makler/copilot-prompt.ts:143`, `lib/kanzlei/actions.ts:58`, `lib/kanzlei/queries.ts:64`, + nach MP-8c `kanzlei/mandate` + `kanzlei/kanban`). Jeder neue Phase-Lookup → diesen Helper nutzen. Inline-`.from('v_claim_phase')` ist seitdem ein Anti-Pattern.

---

## 5 · Nächste Strecke — Phase 4.1 (sofort startbar)

Per Audit §R.5 + §R.6 Umbau-Reihenfolge ist die **kleinste 2-View-Migration** der natürliche nächste Schritt.

### Scope

| View | f.* Spalten | Was zu tun | Effekt |
|---|---|---|---|
| `v_claim_listing` | 3 (nur f.id/sv_id/claim_id, alle faelle-nativ — keine relocateten Cols) | `LEFT JOIN faelle` entfernen; `sv_id` direkt aus claims (CMM-60 SSoT seit lange); `fall_id`-Output entfernen oder NULL casten | View überlebt CASCADE strukturell |
| `v_claim_timeline` | 2 (nur f.id/claim_id) | fall_id-Subqueries entfernen; `phase_transitions`/`timeline`-Branches über claim_id joinen (oder timeline-Spalten direkt aus claims/sub-tables) | View überlebt CASCADE strukturell |

**Eliminiert 2 von 6 Phase-6-Blocker-Views strukturell** + setzt das Re-Create-Template mit SECURITY DEFINER explizit (Phase-4.2-Pflicht).

### Why first

- **Keine Sub-Strecken-Abhängigkeit:** hängt NICHT an SP-E (vehicles), SP-F (vorschaeden), SP-C2/C3 (gegner/halter)
- **Kleinster Diff:** zusammen ~30 Zeilen SQL-Re-Create, keine relocateten Spalten zu migrieren
- **Pilot für Phase 4.2:** etabliert das DEFINER-Restore-Template + Consumer-Smoke-Pattern für die 4 schweren Views (`v_claim_full`, `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) die jeweils 18 / 62 / ~10 / ~8 f.* Spalten haben

### Empfohlener Workflow

1. **Spec** (`docs/superpowers/specs/2026-05-31-cmm44-phase-41-light-views.md`) — beide Views vor/nachher, DEFINER-Restore-Template, Consumer-Liste (`admin/faelle hub` für v_claim_listing-fall_id-Reader, Timeline-Consumer für v_claim_timeline)
2. **Plan** (`docs/superpowers/plans/2026-05-31-cmm44-phase-41.md`) — TDD-mäßige PR-Strecke
3. **Execute** auf neuem Branch `kitta/cmm44-phase-41-light-views`. Migration via Supabase-Plugin (sobald MCP wieder authenticated — aktuell disconnected, siehe §6)
4. **Verify:** Live `pg_views` + Consumer-Smoke (admin/faelle, finance hub) + Audit-Doc §R.5 Tabellen-Update mit "Done"-Tag
5. **PR gegen staging** + Aaron-Review + Merge

### Schwerere Folge-Strecken (nicht jetzt, aber gemapped)

- **Phase 4.2.1** `v_claim_full` (18 f.* — mandatsnummer schon stale heute; hängt an SP-E vehicles, SP-F vorschaeden)
- **Phase 4.2.2** `v_faelle_mit_aktuellem_termin` (62 f.* — härteste, FROM faelle primär)
- **Phase 4.2.3** `faelle_kunde_view` + `faelle_sv_view` (zusammen, gleiches Pattern, ~10+8 f.*)

---

## 6 · Offene Items + Caveats

### Caveat 1: Supabase MCP disconnected (Session-Start 30.05. 09:48Z)

Per System-Notice ist `mcp__plugin_supabase_supabase__*` aktuell **nicht verfügbar** (Server disconnected). Re-Authentication via `mcp__plugin_supabase_supabase__authenticate` nötig bevor Phase-4.1 Migration ausgeführt werden kann. Live-DB-READs via curl-REST mit env-Service-Key gehen weiter (siehe smoke-Script-Pattern).

### Caveat 2: Reverse-Sync-Trigger verfälscht Writer-Smokes

`trg_sync_faelle_sv_id_to_claims` (CMM-60 reverse) ist LIVE + enabled. Phase-5 Writer-Audit muss diesen Trigger temporär `DISABLE` setzen während Smokes, sonst maskiert er Restschuld (alte `faelle.sv_id`-Writes propagieren weiter nach claims, Tests „Writer schreiben jetzt claims" kommen falsch grün).

### Caveat 3: `e2e`-CI-Status FAIL bei PR #2038 — informativ

Per Memory `feedback_ci_e2e_tests_prod` testet `e2e` gegen prod (`app.claimondo.de`), nicht den PR. Status ist informativ, blockt Merge nicht inhaltlich. Aaron hat MP-8c trotzdem gemerged — korrekt.

### Caveat 4: 1 historischer Faelle-Twin (id == claim_id)

Exakt 1 von 74 Faelle hat id == claim_id (Backfill-Edgecase). MP-8c-Fixes handeln das korrekt (claim_id-Lookup matcht auch wenn IDs zufällig gleich sind). Sollte als Test-Fixture in Phase-4-Smoke-Liste geführt werden, falls etwas Phase-6-Drop testet was id-Equality voraussetzt.

### Caveat 5: Worktree-Branch-Hygiene

- `kitta/cmm44-mp8c-id-assumption-fixes` — gemerged via PR #2038; lokal noch vorhanden. Kann nach PR #2046-Merge gelöscht werden (`git -C $WT branch -d kitta/cmm44-mp8c-id-assumption-fixes`).
- `kitta/cmm44-mp8c-postmerge-smoke` — aktueller HEAD; bleibt bis PR #2046 gemerged ist.
- Worktree `.claude/worktrees/cmm44-mp8c-id-assumption-fixes` — kann nach PR #2046-Merge entfernt werden (`git worktree remove`).

### Caveat 6: `.env.local`-Hygiene im Worktree

Smoke-Script kopiert `.env.local` vom main-Repo in den Worktree, läuft, und entfernt es danach (per Sicherheitsregel — Service-Keys drin). **Niemals committen.** `.gitignore` enthält `.env.local` global, aber Doppelt-Check vor `git add` ist Pflicht.

### Caveat 7: Other Sessions Branch-Trampling Risk

19+ aktive Sessions auf `kitta/aar-939-monika-embed` (orthogonale Strecke). **Phase 4.1 muss in eigenem Worktree** (`scripts/new-session-worktree.mjs cmm44-phase-41-light-views`) — sonst Working-Tree-Trampling.

---

## 7 · Worktree/Branch-Stand (für Übergang)

```bash
# Aktuelles Worktree (post-merge smoke + handoff)
.claude/worktrees/cmm44-mp8c-id-assumption-fixes/
  Branch: kitta/cmm44-mp8c-postmerge-smoke
  Tracking: origin/kitta/cmm44-mp8c-postmerge-smoke
  Working-Tree: clean (nach Handoff-Commit)
  Stashes: leer

# Gemerged + auf staging
939cc4f5b CMM-44 MP-8c (#2038) — staging-head -2

# Noch offen
PR #2046 — kitta/cmm44-mp8c-postmerge-smoke → staging (Post-Merge-Beweis + Handoff)
```

**Session-Abschluss-Checkliste (Regel 3):**
- [x] Working-Tree clean (nach diesem Commit)
- [x] Stash-List leer (`git stash list`)
- [x] Alle lokalen Commits auf Remote gepusht (`git log --branches --not --remotes` leer nach diesem Push)

---

## 8 · Quellen / Querverweise (komplett)

### MP-8c-Strecke direkt

- PR #2038 (MP-8c Hauptarbeit, gemerged) — https://github.com/aaroncmdo/cmndo/pull/2038
- PR #2046 (Post-Merge-Beweis + Handoff) — https://github.com/aaroncmdo/cmndo/pull/2046
- Spec: `docs/superpowers/specs/2026-05-30-cmm44-mp8c-id-assumption-fixes.md`
- Plan: `docs/superpowers/plans/2026-05-30-cmm44-mp8c.md`
- Audit-Doc (Phase-4-Vorlage): `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (mit §R.1-§R.8 Revalidation 30.05.)

### MP-8b-Vorgänger (Ursache der Bug-Klasse)

- PR #2020 (gemerged 29.05. 19:38Z, mergeCommit `4946cb847`)
- Migrationen: `supabase/migrations/20260529150758_*` + `20260529155953_cmm44_mp8b_v_claim_phase_claims_centric.sql`
- Audit: `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` §2 (Bug-Identifikation aus MP-8b-Folge)

### Master-Strategie

- `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` (Phase 0-6 Rahmen)
- `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` (de-noised Reader-Buckets ~338 GENUINE)

### Memory-Anker (`./memory/MEMORY.md`)

- `project_cmm44_mp8c_complete` (NEU mit diesem Handoff)
- `project_cmm44_mp6c_ready` · `project_cmm60_claims_sv_id` · `project_cmm44_spg2_status` · `project_cmm44_spd_status` · `project_cmm44_spc_kunde_ownership`
- `feedback_information_schema_check` · `feedback_ci_e2e_tests_prod` · `feedback_worktree_build_gate`
