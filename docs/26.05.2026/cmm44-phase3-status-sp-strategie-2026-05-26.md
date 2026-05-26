# Claim-Phasen-Architektur — Agreed Design (Brainstorm 2026-05-26)

**Status: MODELL APPROVED** (Aaron, Brainstorm 2026-05-26). Ersetzt die frühere „status-SP"-Strategie
(falsche Prämisse: status sei eine zu migrierende Duplikat-Spalte). Dies ist die autoritative
Architektur für das Phasen/Status-System — ein Kernstück der App. Nächster Schritt: Implementierungsplan.

---

## 0 · Kernaussage (eine Zeile)

Die Claim-**Phase** ist eine **reine Aggregation** dreier Sub-Entity-Lifecycles (Lead · Auftrag ·
Kanzleifall). Der **Gutachter-Termin** ist eine dazu **orthogonale Scheduling-Achse** (Dispatch), die
am Auftrag hängt. Es gibt **keinen zentralen Status-Motor** — `faelle.status`, `transitionFallStatus`,
`calc_claims_phase` und `resolveSubphase` werden darauf zurückgebaut bzw. retired.

---

## 1 · Ist-Zustand: drei divergierende Systeme (das Problem)

| # | Quelle | Output | Inputs | Verdikt |
|---|---|---|---|---|
| A | `calc_claims_phase` (SQL-Trigger) → `claims.phase` | 7+4 Codes | `claims.status` + gutachten/repairs/vs_korrespondenz + kb_id | falsche Inputs (nicht auftraege/kanzlei_faelle) |
| B | `resolveSubphase` (TS) | phase 1–9 + 30+ Subphasen | **faelle**-Trigger-Felder via View | koppelt Termin→Phase direkt (legacy) |
| C | `getClaimLifecycle` (TS, CMM-32) | **4 Phasen** + subPhase + sideQuests | **lead · auftraege · kanzlei_faelle** | ✅ **kanonisch** (Kunde-Stepper) |

`faelle.status` (`fall_status`-Enum, 19 Werte) treibt **keines** davon → vestigial.
`claims.status` (text, 7 Werte) hängt empirisch auf `dispatch_done` (nie weiter-advanced).

→ **C ist das richtige Modell.** A + B werden darauf zurückgeführt.

## 2 · Das agreed Modell

### 2.1 Zwei Achsen
- **Phase-Progression (horizontal):** `erfassung → begutachtung → regulierung → abschluss` — Aggregation
  über `getClaimLifecycle(lead, auftraege, kanzleiFall)`. Priorität top-down: abschluss > regulierung >
  begutachtung > erfassung. SubPhase = Status des treibenden Lifecycles.
- **Termin-Achse (orthogonal):** eigener Scheduling-Lifecycle, **unabhängig** von der Phase-Progression,
  am Auftrag via `auftrag_id`. Berührt den Auftrag nur am Sync-Punkt „durchgeführt".

### 2.2 Die Sub-Lifecycles (jeder besitzt seine eigenen Transitions)

| Lifecycle | States | Trigger (Domain-Events) | → Phase |
|---|---|---|---|
| **Lead** | sa_offen → vollmacht_offen → onboarding_offen | SA unterschrieben · Vollmacht signiert · Onboarding complete | erfassung |
| **Auftrag** (typ=erstgutachten) | termin → besichtigung → gutachten → abgeschlossen | Termin durchgeführt · `upload-gutachten` · QC/Filmcheck (`auftrag/qc.ts`) | begutachtung |
| **Kanzleifall** | versicherungskontakt → auszahlung | an Kanzlei übergeben (`upsert-kanzlei-fall`) · VS zahlt aus (vs-timer) | regulierung / abschluss |
| **Termin** (orthogonal) | reserviert → bestätigt → [unterwegs → vor Ort → durchgeführt] | Dispatch legt an (reserviert) · **SA-Unterschrift** bestätigt (NICHT der SV) · GPS/Tracking · `bestaetigeTermin` | — (treibt Auftrag bei „durchgeführt") |

Verlegungs-Loop (Termin, AAR-864): `bestätigt → verlegt → verlegung_pending → (bestätigt|abgelehnt) →
verschoben/storniert`. Triggerbar von **SV** (→pending, braucht Bestätigung), **Kunde** (König → sofort
bestätigt), **KB/Admin**. Route-Engine (`findVerlegungsVorschlaege`, Isochron) läuft automatisch in der
Action — kein Dispatcher-Mensch nötig.

Side-Quests: typ=nachbesichtigung/stellungnahme = eigene Aufträge, laufen parallel sichtbar in
„regulierung", ändern die Hauptphase nicht.

### 2.3 Ownership-Schnitt: Dispatcher hält Termine bis „durchgeführt"
- **Dispatch-Domain:** hält die **zentrale Termine-Quelle** (= `gutachter_termine` typ=erstgutachten,
  noch nicht durchgeführt = das **Dispatch-Board**) — vom Reservieren (Lead) über SA-Bestätigung bis der
  Erst-Termin **stattgefunden** hat. Verlegung des Erst-Termins läuft hier. SV-Komplettausfall =
  Re-Matching (auch Dispatch).
- **„durchgeführt" = der saubere Schnitt:** eine Linie, zwei Bedeutungen — (1) Auftrag rückt auf
  „gutachten", (2) Ownership Dispatcher → **KB**.
- **KB-Domain (nach durchgeführt):** Gutachten/QC → Regulierung → Abschluss, + **Nachbesichtigungs-/
  Stellungnahme-Termine** (eigene Aufträge, KB-koordiniert — NICHT Dispatch).
- **Claim-Daten** lesen alle 5 Rollen ab Konversion; die **Termin-Koordination** (operatives Owner) ist
  bis „durchgeführt" Dispatch, danach KB (zweistufiges Ownership).

### 2.4 Admin = Überwachungs-Ebene (quer)
Admin überwacht das Ganze: volle Sicht auf Dispatch-Board, alle Phasen, alle Termine + den
Dispatcher→KB-Handoff. **Manual-Override** (ManualPhaseOverrideModal / ManualStatusOverrideModal) +
Audit-Trail. Cross-cutting, keine eigene Lifecycle-Achse.

## 3 · Reconciliation: A + B + faelle.status

- **System A (`calc_claims_phase`)**: auf die Aggregation umstellen — `claims.phase` wird aus
  **denselben Sub-Entities** abgeleitet wie C (lead/auftrag/kanzlei_fall), nicht aus
  gutachten/repairs/vs_korrespondenz. (Für Listen/Kanban/RLS, die einen *gespeicherten* Phase-Wert
  brauchen — siehe §4.)
- **System B (`resolveSubphase`)**: die feinen Ops-Subphasen bleiben erlaubt, aber **re-based auf die
  Sub-Entities** (Termin/Auftrag/Kanzleifall) statt faelle-Trigger-Felder. Insbesondere die
  Termin-Detail-States (unterwegs/vor Ort) kommen aus dem Termin-Lifecycle (orthogonal), nicht aus
  faelle.
- **`faelle.status` + `transitionFallStatus`**: retire (Phase 6). Kein zentraler Status mehr — die
  Domain-Events schreiben ihren jeweiligen Sub-Lifecycle.

## 4 · Offene Umsetzungs-Entscheidung (für Spec-Review)

**Gespeichert vs. abgeleitet** für `claims.phase`/`claims.status`:
- **Option D1 (Empfehlung):** Phase rein **abgeleitet** (`getClaimLifecycle` als einzige Quelle, auch
  serverseitig für Listen/RLS — via SQL-View, die dieselbe Logik spiegelt). Kein Drift möglich (eine
  Quelle). `claims.phase`-Spalte wird zur generierten Projektion ODER entfällt.
- **Option D2:** Phase **materialisiert** (Trigger schreibt `claims.phase` aus den Sub-Entities bei
  jeder Sub-Entity-Änderung). Schneller für Listen/RLS, aber Trigger-Komplexität + Drift-Risiko.

Empfehlung **D1** (eine Quelle, kein Drift) — final in der Spec-Review entscheiden.

## 5 · Migrations-Sequenz (high-level — Details im Plan)
1. `getClaimLifecycle` als die EINE Phase-Quelle festschreiben; SQL-Spiegel-View für Listen/RLS.
2. `calc_claims_phase` auf Sub-Entity-Inputs umstellen (oder durch die View ersetzen).
3. `resolveSubphase` auf Sub-Entities re-basen (Termin-Detail aus Termin-Lifecycle).
4. Dispatch-Board = Quelle Erst-Termine bis durchgeführt; Ownership-Handoff bei durchgeführt; Admin-Monitoring.
5. Reader-Sweep: alle `faelle.status`-Konsumenten → claims-Phase/Sub-Entities.
6. Phase 6: `faelle.status` + `transitionFallStatus` + Trigger droppen.

## 6 · Risiken
- B-Konsumenten (Ops-Subphasen, next-hints, SLA) brauchen die feinen States weiter → Re-Base sorgfältig,
  nicht eindampfen.
- Termin-Detail (unterwegs/vor Ort) ist orthogonal — NICHT als Phase modellieren, sondern als
  Termin-Live-Status-Overlay (Stepper Termin-Card).
- Dispatcher-bis-durchgeführt heißt: Dispatcher berührt den Claim nach Konversion (für den Termin) —
  bewusste Abweichung vom alten claim-as-ssot-Doc (§2 „Dispatcher fertig bei Konversion").
- `db push` atomar, nur CLI (Regel 2); Pool unter Parallel-Last.

## 7 · Konsumenten-Karte (was hängt an Phase/Status — für den Reader-Sweep)
- **C (`getClaimLifecycle`)**: Kunde-`ClaimStepper`.
- **A (`claims.phase`)**: `v_claim_listing`, Kanban, `PhasePipeline`/`phase-mappings`, evtl. RLS.
- **B (`resolveSubphase`)**: Admin/SV-Fallakte (`PhaseTriggerList`), `next-step-hints`, SLA-Tracker.
- **`faelle.status`**: Legacy-Reader (Sweep-Ziel, Phase 6).
