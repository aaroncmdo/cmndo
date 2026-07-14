# Status-Achsen-Konsolidierung (`claims.status` + `operative_status` + `work_state` → 1 Achse) — Design

**Datum:** 2026-07-14 · **Lane:** `kitta/status-achsen-konsolidierung` (off `staging`) · **Status:** Design — Consumer-Karte + work_state-Vorab-Klaerung geliefert; **Drop-vs-Derived-Entscheidung offen (Aaron)**.

> Dies ist **Sub-Projekt B** aus `2026-07-08-claim-detail-ops-rebuild-lifecycle-cleanup-design.md`. **A ist erledigt** (verifiziert 14.07.: `v_claim_full` → `v_claim_base` → `v_claim_phase` mit `phase_override`-COALESCE kanonisch; A1-Parity-Test `src/lib/claims/__tests__/claim-phase-parity.test.ts` existiert). B war im 07-08-Plan als „hoechste Risk, eigenes detailliertes Design" markiert.

> **Aaron (14.07.):** „voll konsolidieren (1 Achse)" — bewusst trotz der spaeter etablierten D2/T1.1b-3-Achsen-Architektur. Diese Spec liefert die Consumer-Karte + den additiven Migrationsplan; die `status`-Drop-vs-Derived-Entscheidung faellt am per-File-Blast-Radius (§5).

---

## 1. Ist-Zustand (B0-Consumer-Audit, gegen Prod `paizkjajbuxxksdoycev` verifiziert)

Drei parallele Status-Spalten auf `claims` + die abgeleitete `v_claim_phase`. Die 3 CHECK-Constraints sind live.

### 1.1 `operative_status` — Engine-Cursor (faktische coarse-SSoT)
- **Typ:** `text`, **KEIN CHECK** (nur app-seitig via state-machine-DAG validiert). Vokabular = `fall_status`-ENUM, 19 Werte: `ersterfassung · onboarding · sv-gesucht · sv-zugewiesen · sv-termin · besichtigung · begutachtung-laeuft · gutachten-eingegangen · filmcheck · qc-pruefung · kanzlei-uebergeben · anschlussschreiben · regulierung · regulierung-laeuft · nachbesichtigung-laeuft · zahlung-eingegangen · vs-abgelehnt · abgeschlossen · storniert`. (`klage` via Webhook direkt.)
- **Writer (~4 — NICHT single-writer, entgegen erster Annahme):**

  | Writer | file:line | Wert(e) | Pfad |
  |---|---|---|---|
  | state-machine `transitionFallStatus` | `src/lib/faelle/state-machine.ts:197` | `newStatus` (voll) | Primaerer Cursor, `FALL_STATUS_TRANSITIONS`-DAG-validiert |
  | convert init | `src/lib/leads/convert-lead-to-claim.ts:414` | `ersterfassung` / `sv-termin` | Claim-Genesis |
  | endzustand-Konvergenz | `src/lib/claims/endzustand-actions.ts:117` | `abgeschlossen` / `storniert` | Mit-Write bei TERMINAL (Abschluss-Konvergenz, s. §1.4) |
  | werkstatt-close | `src/app/werkstatt/(shell)/auftraege/reparatur-abschluss-actions.ts:97` | `abgeschlossen` (`REPARATUR_CLOSE_STATUS`) | WS6-Close-Flip, direkt (bypasst state-machine) |

  Kein DB-Trigger/Function schreibt operative_status (`pg_proc`-Scan = ∅). Alle 4 Writer schreiben **gueltige `fall_status`-Werte**. (Das `operative_status:'in_bearbeitung'` in `repair-workstate-checks.test.ts` ist ein **Test-Fixture-Platzhalter**, kein Prod-Write.)
- **Reader (~38 Files):** ueberwiegend **Terminal-Ausschluss-Filter** (`.not/.in('operative_status', ['abgeschlossen','storniert',…])` = „aktive Faelle") + **Anzeige** (via `v_claim_full`: `c.operative_status::fall_status AS fall_status`). Domaenen: makler, werkstatt (repair-workstate-checks, auftrag-phase), sla (completion-signals), ops (derive-claim-workflow-state), lexdrive, kanzlei (mandate/kanban), inbound (match-fall), health (funnel-stuck), faq-bot, orchestrator, admin (finance-hub/karte/KpiCards/KritischeUpdates), api-crons (case-billing-batch, release-makler-provisionen, repair-reminders), get-claim-lifecycle-for-claim, get-kunde-faelle, faelle/[id]/page.

### 1.2 `status` — Terminal/Outcome-Achse
- **Typ:** `text`, **CHECK (12 Werte + NULL):** `dispatch_done · in_bearbeitung · in_kommunikation_vs · reguliert · abgelehnt · an_externe_kanzlei_uebergeben · storniert · reguliert_vollstaendig · klage_rechtsstreit · verjaehrt · abgelehnt_final · termin_durchgefuehrt`. **NULL = aktiver Claim.**
  - **3 tote Werte:** `dispatch_done` + `in_bearbeitung` (→ `work_state` seit T1.1b, nie mehr auf `status` geschrieben) + `reguliert` (nie post-MP-8).
- **Writer:**

  | Writer | file:line | Werte |
  |---|---|---|
  | state-machine via `mapFallStatusToClaimStatus` (dual-write) | `src/lib/faelle/fall-status-claim-mapping.ts` @ `state-machine.ts:192` | `regulierung[-laeuft]→in_kommunikation_vs` · `vs-abgelehnt→abgelehnt` · `klage→klage_rechtsstreit` · `abgeschlossen→reguliert_vollstaendig` (guarded) · sonst NULL |
  | endzustand-actions (7 manuelle Setter) | `src/lib/claims/endzustand-actions.ts` | `markClaimAsReguliert/Abgelehnt(final)/Storniert/Klage/Verjaehrt/AnExterneKanzlei/InKommunikationVs` |
- **Reader (~15, konzentriert):** getClaimLifecycle-SSoT (`src/lib/claims/lifecycle.ts:131-150` — `ABSCHLUSS_SUBSTATE` + `REGULIERUNG_STATUS_SUBSTATE`, status→sub_phase), `get-claim-lifecycle-for-claim.ts:58`, `state-machine.ts:85` (harder-terminal-Guard), `fall-status-claim-mapping.ts:98` (Terminal-Guard), `endzustand-actions.ts:42/113` (`setEndzustandFields` `.not('status','in',ENDZUSTAENDE)`-Guard), `lifecycle-seed.ts`. **`v_claim_phase` liest `status`** fuer die Abschluss/Regulierung-Sub-Phasen → **A1-Parity-gated**.

### 1.3 `work_state` — Dispatch/Processing-Achse (D2/T1.1b)
- **Typ:** `text`, **CHECK (2 Werte + NULL):** `dispatch_done · in_bearbeitung`.
- **Writer (3):** `convert-lead-to-claim.ts:370` (`dispatch_done`), `kanzlei-wunsch/actions.ts:575` (`in_bearbeitung`, smoke-Reset), `smoke/lifecycle-seed.ts:150`. Kein DB-Trigger.
- **Reader (LOAD-BEARING):** `endzustand-actions.ts:143` **VS-Gate** (`work_state !== 'in_bearbeitung'` blockt Uebergang → `in_kommunikation_vs`) + `faelle/[id]/page.tsx:103` **Display-Fallback** (`status ?? work_state`).
- **⚠ VORAB-BEFUND (Blocker fuer B3, s. §7):** im **Normalfluss** setzt offenbar **nur** `kanzlei-wunsch`/smoke `in_bearbeitung` — die state-machine schreibt `work_state` NICHT. → das VS-Gate koennte fuer viele Claims heute gar nicht sauber durchlaufen (bestehender Bug vs. gewollt). **MUSS geklaert werden, bevor B3 das Gate umhaengt.**

### 1.4 Der Konvergenz-Schmerz (der eigentliche Grund fuer B)
`endzustand-actions.ts:105-117` schreibt bei einem Terminal `operative_status` UND `status` **gleichzeitig**, damit `v_claim_phase` (leitet „abschluss" aus `status`-terminal ab) und der „aktive Faelle"-Filter (aus `operative_status NOT IN abgeschlossen/storniert`) nicht divergieren. Das ist **manuelle Dual-Write-Synchronisation zwischen zwei Achsen** — genau die Fehlerquelle, die eine einzige Achse eliminiert. (Zitat aus dem Code: „Sonst divergieren die zwei Phasen-Engines … zeigt den Fall weiter als aktiv.")

---

## 2. Ziel-Modell: `operative_status` = die einzige Status-Achse

- **`operative_status`** wird die SSoT-Achse, **erweitert** um die feinen Terminal-Outcomes (`reguliert_vollstaendig · abgelehnt_final · klage_rechtsstreit · verjaehrt · an_externe_kanzlei · in_kommunikation_vs · abgelehnt`) + zum ersten Mal einen **CHECK** (→ der `check:flag-drift`-Ratchet greift; Vokabular-Drift wird geblockt).
- **`status`** → abgeleitete Projektion ODER Drop (§5).
- **`work_state`** → **eliminiert**, ersetzt durch Fakt-Timestamp `kb_uebernommen_am` (ist kein „Status" mehr, konkurriert nicht mit der Achse). VS-Gate prueft dann `kb_uebernommen_am IS NOT NULL`; Display nutzt `operative_status`.

**Warum `operative_status` (nicht `status`) die SSoT ist:** faktische coarse-SSoT (jeder „aktive"-Filter + jede Anzeige nutzt es via `v_claim_full`), engine-nativ (`transitionFallStatus` ist der Orchestrator), granular (19 → 26 Werte). `status` ist bereits ein Derivat/Subset davon (`mapFallStatusToClaimStatus`).

---

## 3. Additive Migration (Reader-first, A1-Parity-gated je Phase — kein Big-Bang)

- **B0-Hardening (VOR B1):** (a) den work_state-Vorab-Befund (§7) klaeren; (b) den 38-Reader-Scan per-File finalisieren (diese Spec = Erststand, agent-basiert → grep-verifizieren); (c) pruefen ob ein „KB uebernimmt"-Write fehlt; (d) pruefen ob externe LexDrive `status` liest/schreibt.
- **B1 · Vokabular + CHECK:** `operative_status` bekommt die 7 Outcome-Werte + einen CHECK (Snapshot in `scripts/lib/status-check-constraints.json` fuer den flag-drift-Ratchet ergaenzen). state-machine (`mapFallStatusToClaimStatus` wird Identitaet fuer Terminals) + endzustand-actions schreiben die feinen Outcomes DIREKT in `operative_status` statt der coarse `abgeschlossen`. **Additiv** — alte Werte bleiben gueltig, keine Reader brechen.
- **B2 · Phase-SSoT umlenken:** `v_claim_phase` + `getClaimLifecycle` (`lifecycle.ts` ABSCHLUSS/REGULIERUNG-Maps) lesen die Terminal/Regulierung-Sub-Phasen aus `operative_status` statt `status`. **A1-Parity-Test bleibt gruen** (er beweist `getClaimLifecycle == v_claim_phase`; beide Quellen synchron geaendert). View-Rewrite via shape-preserving DO-block (Technik wie A2, Migration `20260710172215`-Muster). **Contested Core** — koordiniert.
- **B3 · `work_state` → `kb_uebernommen_am`:** neue Timestamp-Spalte + Backfill (aus `work_state='in_bearbeitung'` bzw. `kundenbetreuer_zugewiesen_am`); VS-Gate (`endzustand:143`) + Display-Fallback (`page:103`) umhaengen; `work_state`-Reader migrieren; dann `work_state` + CHECK droppen. **Erst nach §7-Klaerung.**
- **B4 · `status` deprecaten:** `status` wird derived/generated aus `operative_status` (Reader laufen unveraendert), die ~15 Reader schrittweise auf `operative_status` migriert. **Drop-vs-Derived = §5.**
- **B5 · Cleanup:** tote CHECK-Werte raus, `mapFallStatusToClaimStatus` weg, `database.types` regen, der endzustand-Konvergenz-Dual-Write (§1.4) wird zu EINEM Write.

**Jede Phase:** eigener Branch → PR gegen `staging` + A1-Parity gruen + 4 Ratchets 0-neu + CI-build + Prod-Smoke (Regel 4). **DDL nur via `apply_migration`** (Regel 2), Twin-Drift-Regel.

---

## 4. Consumer-Migrationskarte (Kurzform — per-File-Vollstaendigung = B0-Hardening)

| Consumer-Gruppe | Spalte | Anzahl | Was aendert sich |
|---|---|---|---|
| „aktive Faelle"-Terminal-Filter | operative_status | ~20 | Filter-Listen um die neuen Outcome-Werte erweitern (bleiben terminal) |
| Anzeige via `v_claim_full.fall_status` | operative_status | ~10 | unveraendert (View bleibt, Wert granularer) |
| getClaimLifecycle ABSCHLUSS/REGULIERUNG-Maps | status | 2 Maps | Quelle status → operative_status (B2) |
| state-machine Guard + mapping | status | 3 | mapping wird Identitaet; Guard auf operative_status (B2/B5) |
| endzustand-actions (7 Setter + Guard + Konvergenz) | status + operative_status | 1 File | schreibt nur noch operative_status-Outcome (B1/B5) |
| VS-Gate + Display-Fallback | work_state | 2 | → `kb_uebernommen_am` / operative_status (B3) |
| werkstatt-close + repair-workstate-checks | operative_status | 3 | unveraendert (schreibt/liest gueltige Terminals) |
| smoke-seed | alle 3 | 1 | Seed-Werte auf neue Achse (B1/B3) |

---

## 5. OFFENE ENTSCHEIDUNG — `status`: Drop vs. Derived (fuer Aaron)

- **Derived-Projektion (niedrig-Risk):** `status` = generated/derived column aus `operative_status`; die ~15 Reader laufen unveraendert weiter; schrittweise Migration; harter Drop als spaetere optionale Phase. Externe LexDrive-Consumer (falls sie `status` lesen) unberuehrt.
- **Hart-Drop (sauberster Endzustand, hoeheres Risk):** `status` + CHECK komplett weg; alle ~15 Reader + evtl. externe Consumer in einem Rutsch auf `operative_status`.
- **Blast-Radius-Fakt (fuer die Entscheidung):** die 15 `status`-Reader sind **konzentriert** (endzustand-actions, 2 lifecycle-Maps, get-claim-lifecycle, state-machine-Guard, fall-status-mapping, v_claim_phase) — ueberschaubar. **Zu klaeren in B0-Hardening:** schreibt/liest die **LexDrive**-Integration `claims.status` direkt? (Falls ja → Derived-Projektion Pflicht, kein Hart-Drop.)

---

## 6. Risiken + Koordination

**Hoechste Risk der Codebase** (07-08-Plan: „hoechste Risk, contested Core"). B2 fasst die **Phase-SSoT** an (die gerade A2-verifiziert wurde) → additiv, A1-Parity-Gate bei JEDEM PR, shape-preserving DO-block. Aktive Nachbar-Lanes an `v_claim_*`/`claims`-Status: `detail-view-konsistenz` (7572149e), `vermittler-ssot` (6242846a), `aar-956`. Koordinations-Marker `COORDINATION-status-achsen-konsolidierung`, additiv-first, vor jedem `v_claim_*`/status-Touch abstimmen.

---

## 7. work_state-Vorab-Klaerung (Blocker fuer B3)

**Frage:** Wie erreicht ein Claim im Normalfluss `work_state='in_bearbeitung'`, wenn nur `kanzlei-wunsch`/smoke es setzen (nicht die state-machine)? Optionen: (a) es fehlt ein „KB uebernimmt Fall"-Write (Bug — das VS-Gate blockt dann faelschlich), (b) das Gate wird real selten getroffen (KB-manuelle Aktion nach eigenem Uebernehmen), (c) ein Reader/Write wurde im Audit uebersehen. **Aufloesen via:** grep aller `work_state`-Writes (FS-Timeout-frei, enge Pfade) + Live-Check auf Prod (welche `work_state`-Verteilung haben aktive Claims — aktuell 0-Daten, also code-seitig). Erst danach B3.

---

## Anhang — Verifikations-Rezept
`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` · A1-Parity: `RUN_PARITY=1` + service-env → `npx vitest run src/lib/claims/__tests__/claim-phase-parity.test.ts` · flag-drift: `npm run check:flag-drift -- --ratchet` (Snapshot regenerieren bei jedem neuen operative_status-Wert) · DDL nur `apply_migration` (project_id `paizkjajbuxxksdoycev`) · Route/View-Changes → CI-build autoritativ.
