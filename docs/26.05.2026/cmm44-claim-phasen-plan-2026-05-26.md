# Claim-Phasen-SSoT — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (oder subagent-driven-development) zur task-weisen Umsetzung. Steps mit `- [ ]`.

**Goal:** `getClaimLifecycle` (Aggregation aus Lead+Auftrag+Kanzleifall) zur **app-weiten** Single-Source für Claim-Phase/Subphase machen; den Gutachter-Termin als orthogonale Dispatch-Achse sauber andocken; System A (`calc_claims_phase`/`claims.phase`) + System B (`resolveSubphase`) darauf zurückbauen; `faelle.status` + `transitionFallStatus` retiren.

**Architecture:** Phase = reine Aggregation (keine gespeicherte Wahrheit, Entscheidung D1 = abgeleitet). SQL-Spiegel-View für Listen/RLS. Termin orthogonal, Ownership Dispatcher→KB bei „Erst-Termin durchgeführt", Admin = Überwachung.

**Tech Stack:** Next.js 15 (App Router, Server Components/Actions), Supabase/Postgres (Views + RLS, Migrations via `npx supabase db push` — Regel 2), Vitest.

**Spec:** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md` (agreed 2026-05-26).
**Parallel zur Strecke:** `docs/claim-as-ssot-umbau.md` — dies ist die Status/Phasen-Portion deren Phase 1–6.

**Warum geschäftskritisch (nicht nur Refactor):** Die **Lifecycle-Dynamik** ist der dynamische
Mehrwert, den Claimondo **promotet** — der Claim lebt sichtbar in Echtzeit aus Auftrag-/Termin-/
Kanzlei-State (Kunde-Stepper, Live-Termin, Dispatch-Board, Admin-Überwachung). Dieser Schnitt = der
eigentliche Zweck der claims-as-ssot-Strecke. **Wird implementiert** (Start: P0).

**OFFENE ENTSCHEIDUNG (vor P1 bestätigen):** D1 (Phase rein abgeleitet, eine Quelle) vs D2 (materialisiert via Trigger). Plan nimmt **D1** an.

---

## Vollständigkeitsregel (hart, aus claim-as-ssot-umbau.md §5b)
Pro Phase: komplette Migration (kein Übergangs-Mischform), alte Komponenten **gelöscht** (`git grep` leer), Server-Actions auf `claim_id`, Smoke-Test (Screenshot-Pflicht) auf jedem betroffenen Portal, PR `--base staging`, kein Self-Merge.

---

## Phase P0 — Foundation: getClaimLifecycle = die EINE Quelle (+ SQL-Spiegel)

**Files:**
- Create: `src/lib/claims/get-claim-lifecycle-for-claim.ts` (Server-Loader: lädt Inputs + ruft `getClaimLifecycle`)
- Create: `supabase/migrations/<ts>_v_claim_phase.sql` (SQL-Spiegel der Aggregation)
- Modify: `src/app/kunde/faelle/[id]/page.tsx` (Inline-Input-Assembly → neuen Loader nutzen)
- Test: `src/lib/claims/get-claim-lifecycle-for-claim.test.ts` + Parity-Test gegen die View

- [ ] **Server-Loader extrahieren.** Heute baut die Kunde-Page die `ClaimLifecycleInput` (lead/auftraege/kanzleiFall) inline. Extrahiere `getClaimLifecycleForClaim(admin, claimId): Promise<ClaimLifecycle>` — lädt `lead`-Felder (sa_unterschrieben/vollmacht_signiert_am/onboarding_complete), `getAlleAuftraege`, `getKanzleiFall`, ruft `getClaimLifecycle`. Eine Funktion für alle Server-Konsumenten.
- [ ] **Vitest** für den Loader (Lead-only→erfassung; aktiver erstgutachten→begutachtung; kanzleiFall→regulierung; ausgezahlt+alle Aufträge fertig→abschluss). Gegen die bestehenden `lifecycle`-Tests spiegeln.
- [ ] **SQL-View `v_claim_phase`** (Migration, `db push`): pro claim `main_phase` + `sub_phase` aus `claims`+`auftraege`+`kanzlei_faelle`+lead-Feldern, **identische Priorität** wie `getClaimLifecycle` (abschluss > regulierung > begutachtung > erfassung). Für Listen/Kanban/RLS (die keine TS-Funktion aufrufen können). security_invoker=on.
- [ ] **Parity-Test:** Script `scripts/probe-claim-phase-parity.mjs` — für alle claims: `v_claim_phase.main_phase` == `getClaimLifecycleForClaim().mainPhase`. Muss 0 Divergenzen liefern (bei ruhigem Pool ausführen).
- [ ] tsc + Kunde-Smoke (Stepper unverändert) + Commit + PR `--base staging`.

**DoD P0:** Eine Phase-Quelle (TS `getClaimLifecycleForClaim` + SQL `v_claim_phase`), parity-getestet, Kunde-Stepper nutzt den Loader. Noch kein Reader migriert außer Kunde.

## Phase P1 — System A zurückbauen (`claims.phase` / `calc_claims_phase`)

**Files:** `supabase/migrations/<ts>_drop_calc_claims_phase_trigger.sql`, `v_claim_listing` (Repoint auf `v_claim_phase`), Kanban-/PhasePipeline-Konsumenten.

- [ ] `v_claim_listing.phase`/`status` aus `v_claim_phase` speisen (statt aus `claims.phase`-Spalte).
- [ ] `claims.phase`-Reader (Kanban `FaelleKanban`/`kanzlei/kanban`, `PhasePipeline`, `ClaimPhaseBadge`) auf `v_claim_phase`/Loader umstellen.
- [ ] `calc_claims_phase`-Trigger + Spalte `claims.phase` deprecaten: Trigger droppen; Spalte bleibt bis kein Reader mehr (dann Phase P5).
- [ ] Smoke: Admin-Kanban, Kanzlei-Kanban, Listen — Phasen korrekt. Commit + PR.

**DoD P1:** `claims.phase` wird nicht mehr aus gutachten/repairs/vs_korrespondenz berechnet; alle Listen/Kanban lesen die Aggregation. `git grep "calc_claims_phase"` nur noch Migration/deprecated.

## Phase P2 — System B zurückbauen (`resolveSubphase` auf Sub-Entities)

**Files:** `src/lib/fall/subphase-resolver.ts` (Input `FallRow` → Sub-Entity-Inputs), Konsumenten `PhaseTriggerList`, `next-step-hints.ts`, SLA-Tracker.

- [ ] `resolveSubphase`-Input von `faelle`-Trigger-Feldern auf Sub-Entities umstellen: Termin-Detail (unterwegs/vor Ort/durchgeführt) aus dem **Termin-Lifecycle** (gutachter_termine), Auftrag-States aus `auftraege`, Kanzlei-States aus `kanzlei_faelle`, VS-Reaktion/Rüge aus den jeweiligen Sub-Tabellen (vs_korrespondenz etc.).
- [ ] Bestehende `subphase-resolver.test.ts` auf die neuen Inputs umschreiben (Treffermenge erhalten).
- [ ] Konsumenten (`PhaseTriggerList`, `next-step-hints`, SLA) verifizieren — Ops-Subphasen unverändert sichtbar.
- [ ] Smoke: Admin/SV-Fallakte (PhaseTriggerList) + 1 SLA-Pfad. Commit + PR.

**DoD P2:** `resolveSubphase` liest **kein** `faelle`-Feld mehr; die 30+ Ops-Subphasen bleiben intakt (re-based).

## Phase P2b — Stepper-Komponente vereinheitlichen (Kunde + Admin = eine Quelle)

**Hintergrund:** Heute liest der **Kunde-Stepper** (`components/kunde/ClaimStepper`) aus `getClaimLifecycle`
(C, 4 Phasen), der **Admin-Stepper** (`app/faelle/[id]/FallakteShell` → `PhasePipeline`) aus
`resolveSubphase` (B) + `getStepperState` (`src/lib/fall/stepper-state.ts`). **Zwei Quellen → koennen
divergieren.** Beide muessen aus derselben Aggregation kommen, nur in unterschiedlicher Granularitaet.

**Files:** Neue/erweiterte rollenneutrale Komponente; `components/kunde/ClaimStepper`,
`app/faelle/[id]/FallakteShell.tsx` (PhasePipeline), `src/lib/fall/stepper-state.ts`.

- [ ] **Eine rollenneutrale Komponente** `ClaimPhaseStepper` mit `granularity: 'kunde' | 'admin'`-Prop
      (AGENTS.md §component-set: eine Komponente pro fachliche Aufgabe, rolle/Prop — keine Duplikate).
      Immer 4-Phasen-Backbone; Kunde = mainPhase + aktive subPhase inline; Admin = aktive Phase expanded
      (Subphasen aus dem re-baseten resolveSubphase) + Trigger-Felder + Manual-Override.
- [ ] Gefuettert aus **einer** Quelle: `getClaimLifecycleForClaim` (P0) für mainPhase/subPhase;
      Admin-Detail (feine Subphasen/Trigger) aus dem in P2 re-baseten `resolveSubphase`/`getStepperState`.
- [ ] Kunde-Page + Admin-FallakteShell auf die eine Komponente umstellen; alte getrennte Render-Pfade
      löschen (git grep).
- [ ] Smoke: Kunde-Stepper + Admin-PhasePipeline zeigen **konsistente** Phase für denselben Claim.

**DoD P2b:** EIN `ClaimPhaseStepper` (granularity-Prop) speist Kunde + Admin aus derselben Quelle →
keine Divergenz; Admin sieht reicher (Subphasen/Trigger/Override), nicht anders.

## Phase P3 — Dispatch-Board + Ownership-Handoff + Admin-Monitoring

**Files:** Dispatch-Board-View/Query, `bestaetigeTermin`/durchgeführt-Pfad, Admin-Monitoring-View, RLS.

- [ ] **Dispatch-Board** = Quelle Erst-Termine bis durchgeführt: View/Query `gutachter_termine` typ=erstgutachten (sv_begutachtung) `durchgefuehrt_am IS NULL` → das ist das Dispatch-Board. Dispatcher-Portal liest daraus.
- [ ] **Ownership-Handoff bei „durchgeführt":** beim Setzen von `durchgefuehrt_am` (Erst-Termin) → Auftrag `besichtigung→gutachten` + Ownership-Flag/Event Dispatcher→KB. Ein expliziter Übergang (kein impliziter).
- [ ] **SV-Komplettausfall → Re-Dispatch:** expliziter KB-Trigger der den Claim in die Dispatch-Queue zurückgibt (Re-Matching, ≠ Verlegung).
- [ ] **Admin-Monitoring:** Admin-View über Dispatch-Board + Phasen + Termine + Handoff-State; Manual-Override (`ManualPhaseOverrideModal`) + Audit-Trail bleiben.
- [ ] Smoke: Dispatch-Board, Handoff bei durchgeführt, Admin-Sicht. Commit + PR.

**DoD P3:** Dispatch-Board zeigt nur offene Erst-Termine; Handoff Dispatcher→KB bei durchgeführt; Nachbesichtigung NICHT im Board; Admin überwacht alles.

## Phase P4 — Reader-Sweep `faelle.status`

**Files:** alle `faelle.status`-Konsumenten (Inventur via `git grep "faelle.*status"` + `.eq('status'` auf `from('faelle')`).

- [ ] Konsumenten-Inventur erstellen (Sweep-Liste). Jeden auf Claim-Phase (`getClaimLifecycleForClaim`/`v_claim_phase`) bzw. die passende Sub-Entity umstellen — portal-weise (Kunde ✓ / SV / Mitarbeiter / Admin / Dispatch / Kanzlei), je 1 PR.
- [ ] Pro Portal Smoke (Screenshot). Alte Status-Komponenten gelöscht.

**DoD P4:** `git grep "faelle\.status\|fall_status"` in `src/` leer (außer deprecated/migration).

## Phase P5 — Retire (= claim-as-ssot Phase 6, Status-Portion)

**Files:** Migration (Drop), `state-machine.ts`, Notification-Trigger.

- [ ] Notification-Trigger (`on_gutachten_eingegangen`/`on_filmcheck_done`/`on_regulierung`) auf claims/Sub-Entity-Events umziehen oder droppen.
- [ ] `transitionFallStatus` + `faelle.status`-Writes entfernen; Spalte `faelle.status` + `claims.phase` (falls D1, ungenutzt) + `calc_claims_phase` droppen. Migration `db push`, DB-verifiziert.
- [ ] Voller Build + alle 5 Portale Smoke. Commit + PR.

**DoD P5:** `faelle.status` + `transitionFallStatus` + `calc_claims_phase` weg; Phase rein abgeleitet; alle Portale grün.

## Phase P6 — Drift-Bremse (CI-erzwungen — damit es NIE wieder driftet)

**Zweck:** Eine Quelle zu erreichen reicht nicht — es muss erzwungen bleiben. Analog zur bestehenden
**Token-Audit-Drift-Bremse** (AGENTS.md §branding, `npm run check:token-audit` als CI-Step). Ohne diese
Phase kann ein künftiger PR eine zweite Phasen-Quelle / einen faelle.status-Reader / eine
View↔TS-Divergenz wieder einschleusen.

**Files:** `scripts/check-claim-phase-drift.mjs` (neu), `package.json` (npm-Script), CI-Workflow.

- [ ] **Parity-Gate (CI):** `npm run check:claim-phase-parity` — `v_claim_phase` (SQL) muss für ALLE
      Claims `main_phase`/`sub_phase` == `getClaimLifecycleForClaim` (TS) liefern. Divergenz = CI-Fail.
      (Die P0-Parity-Probe wird hier zum permanenten Gate.)
- [ ] **B↔C-Konsistenz-Test (vitest, CI):** `resolveSubphase(...).phase` muss in dieselbe Hauptphase
      fallen wie `getClaimLifecycle(...).mainPhase` für dieselben Sub-Entity-Inputs (feine vs grobe
      Projektion DERSELBEN Wahrheit — dürfen nie widersprechen).
- [ ] **Single-Source-Guard (CI grep, im Drift-Script):** blockt (a) jeden neuen `faelle.status`/
      `fall_status`-Reader in `src/` (außer migration/deprecated), (b) neues `calc_claims_phase` oder
      paralleles Phasen-Compute, (c) Direkt-Konstruktion von `ClaimLifecycleInput` außerhalb des
      Loaders (`getClaimLifecycleForClaim` ist der EINZIGE Phasen-Entry; Skip-Header-Konvention wie beim
      Token-Audit für legitime Ausnahmen).
- [ ] In die CI-Pipeline aufnehmen (neben `check:token-audit`) + in AGENTS.md dokumentieren
      (§claim-phase-drift-bremse).

**DoD P6:** Drift ist **CI-blockiert** — eine zweite Phasen-Quelle, ein faelle.status-Reader oder eine
View↔TS-Parity-Divergenz lässt den Build rot werden. Das Phasen-System ist damit *strukturell*
single-source und kann nicht zurück-driften.

---

## Self-Review (Spec-Coverage)
- Spec §2.1 (2 Achsen) → P0 (Phase-Aggregation) + P3 (Termin/Dispatch). ✓
- Spec §2.2 (Sub-Lifecycles) → P0 Loader liest alle 3; Termin in P2/P3. ✓
- Spec §2.3 (Ownership-Schnitt durchgeführt) → P3. ✓
- Spec §2.4 (Admin-Überwachung) → P3. ✓
- Spec §3 (A/B/faelle.status reconcile) → P1/P2/P4/P5. ✓
- Spec §4 (D1 stored-vs-derived) → angenommen, vor P1 bestätigen. ⚠ offene Entscheidung.

## Risiken
- B-Re-Base (P2) ist die heikelste: die 30 Ops-Subphasen + SLA dürfen nicht eindampfen — Treffermengen-Test Pflicht.
- Phase rein abgeleitet (D1): View-Performance auf Listen prüfen (EXPLAIN); ggf. doch materialisieren (D2) wenn zu langsam.
- Termin orthogonal: Detail-States NICHT als Phase modellieren (Stepper-Overlay).
- Pool/Parallel-Sessions: Migrationen im ruhigen Slot, `db push` atomar, nur CLI.

---

## Inventar — Drops + Read/Write-Changes (am Lifecycle orientiert)

Explizite Liste, damit beim Ausführen nichts geraten werden muss. Quelle: Spec §3/§7 + Analyse 26.05.

### A · DROPs (P5 / Phase 6) — via `db push` (Regel 2), je nach D1/D2
| Objekt | Typ | Aktion | Bedingung |
|---|---|---|---|
| `faelle.status` | Spalte (fall_status-Enum) | **DROP** | nach P4 (kein Reader mehr) |
| `claims.phase` | Spalte | **DROP** | nur bei **D1** (rein abgeleitet via `v_claim_phase`); bei D2 bleibt sie materialisiert |
| `calc_claims_phase` | Function | **DROP** | bei D1 (View ersetzt sie) |
| `trg_claims_set_phase` | Trigger | **DROP** | mit calc_claims_phase |
| `transitionFallStatus` | TS-Function | **entfernen** | nach P4 (kein faelle.status-Write mehr nötig) |
| `on_gutachten_eingegangen` / `on_filmcheck_done` / `on_regulierung` | faelle-Trigger | **umziehen auf claims/Sub-Entity-Event ODER droppen** | P5 (Entscheidung im Kontext) |
| **NICHT droppen:** `resolveSubphase` (re-based P2), `gutachter_termine`/`auftraege`/`kanzlei_faelle`/`leads` (= die Sub-Lifecycle-Tabellen bleiben SSoT) | | | |

### B · NEUE Reads (Phase aus Sub-Entities, nicht faelle.status)
- **`getClaimLifecycleForClaim`** (P0, Detail-Pages) · **`v_claim_phase`** (P0, Listen/Kanban/RLS).
- **Reader-Sweep (P4)** — bekannte Konsumenten, je auf `getClaimLifecycleForClaim`/`v_claim_phase`/Sub-Entity umstellen:
  - *System A (claims.phase):* `v_claim_listing`, `FaelleKanban`, `kanzlei/kanban`, `PhasePipeline`, `ClaimPhaseBadge`.
  - *System B (resolveSubphase + `getStepperState`):* `PhaseTriggerList`, `next-step-hints`, SLA-Tracker, Admin-`FallakteShell`.
  - *faelle.status-Direkt-Reader:* exhaustiv via `git grep "faelle\.status\|fall_status" + .eq('status' auf from('faelle')` in P4 — Liste dort fixieren (portal-weise, je 1 PR).
  - *Termin-Detail* (unterwegs/vor Ort) → aus `gutachter_termine` (Termin-Lifecycle), NICHT faelle.

### C · Writes — jeder Sub-Lifecycle besitzt seine eigene Transition (kein zentraler faelle.status-Write)
- `auftraege.status`: `api/sv/upload-gutachten` (→gutachten) · `lib/auftrag/qc.ts` (→abgeschlossen) · `createErstgutachtenAuftragWennNoetig` (→termin).
- `kanzlei_faelle.status`: `upsert-kanzlei-fall`/`push-mandat` (→versicherungskontakt) · `vs-timer`/kanzlei-actions (→auszahlung + ausgezahlt_am).
- `gutachter_termine`: `bestaetigeTermin` (reserviert→bestätigt, durch SA) · `termin-verlegung-actions` (Verlegungs-State-Machine).
- `leads`: SA-/Vollmacht-/Onboarding-Signale (erfassung-Subphasen).
- **ENTFÄLLT in P5:** zentrale faelle.status-Writes — `transitionFallStatus` + die 5 Direct-Writer (`kanzlei-wunsch`, `gutachter/team`, `api/sv-zuweisung`, `lexdrive` ovFaelle-Pfad, `admin/faelle/anlegen`) + ~6 Smoke/Seed-Scripts.
