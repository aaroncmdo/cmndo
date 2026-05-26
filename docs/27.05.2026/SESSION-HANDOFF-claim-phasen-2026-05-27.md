# Session-Handoff — Claim-Phasen-SSoT (Session 2026-05-26 → 27)

> **Master-Handoff dieser Session.** Enthält: (0) den Auftrag, der hereinkam, (1) getroffene
> Entscheidungen, (2) was erledigt + gemergt ist, (3) der zentrale Befund, (4) aktueller Stand,
> (5) Nächster Schritt, (6) alle Artefakte, (7) Gotchas. Für die nächste Session reicht: dieses Doc +
> Spec + Plan lesen, dann bei §5 einsteigen.

---

## 0 · Der Auftrag, der hereinkam (Original-Handoff an mich)

> „Lies `docs/26.05.2026/handoff-claim-phasen-ssot-2026-05-26.md`, dann Spec + Plan (selber Ordner).
> Claim-Phasen-SSoT: **P0 ist fertig** (Loader + `v_claim_phase` appliziert, PR #1809). **Mach weiter
> mit P0 Task 4 (Parity-Probe) → P1.** Branch `kitta/cmm44-claim-phase-p0`. **Offene Entscheidung
> D1/D2 vor P1 klären.**"

**Steuerungs-Eingaben von Aaron im Verlauf der Session (alle umgesetzt):**
- „was ist logisch?" → D1/D2 mit Begründung entscheiden (→ **D1**).
- „termine hast du auch berücksichtigt?" → ja, Termin ist **orthogonal** (siehe §3).
- „erinner dich immer an die lifecycle memory" → `project_claim_phasen_ssot_architektur` ist Leitstern.
- „go für a … 1. ja das ist sogar richtig so" → P1-Reader auf 4-Phasen+Subphase neu schreiben (nicht
  11-Code konservieren); 7-Stufen-Admin-Pipeline kollabiert bewusst ins 4-Haupt+Subphasen-Modell.
- „a durchziehen, b planen mit Implementierungsplan und Handoff" → Override-Bug fixen (A) + verschmolzenen
  P1+P2-Plan + Handoff schreiben (B).
- „wenn der claim im whitelabelling angezeigt wird ist das gut" → die Phasen-Anzeige im (gebrandeten)
  Kunde-Portal ist der promotete Value; **DE-2 (Visibility-Rebase) ist whitelabel-kritisch.**

---

## 1 · Entscheidungen dieser Session

| # | Entscheidung | Begründung (kurz) |
|---|---|---|
| **D1** (gelöst) | Phase **rein abgeleitet** (`v_claim_phase`-View), `claims.phase`-Spalte + `calc_claims_phase` werden gedroppt | Phase ist *per Prämisse* Ableitung → als View modellieren. D2 (Trigger schreibt Spalte) = `calc_claims_phase` neu bauen = der Status-Motor, den wir abreißen, + Drift-Risiko. Perf trivial; falls je nötig → `MATERIALIZED VIEW` (bleibt single-source). |
| **Option (a)** | Die 11 System-A-Codes **retiren**, nicht konservieren | Admin-Granularität kommt aus re-baseter `resolveSubphase` (Sub-Entities), nicht aus Alt-Codes. |
| **Termin = orthogonal** | Termin-Detail (unterwegs/vor Ort) ist **Overlay**, nicht Phase | Spec §6. Termin treibt die Phase nur indirekt über `auftraege.status` (durchgeführt → Auftrag rückt). |
| **A = Stopgap** | Override-Bug **deaktivieren**, nicht „coarse" fixen | Echtes Feature erst nach System-B-Re-Base möglich; 11-Code-Rework wäre Wegwerf + ohne Visibility-Effekt. Re-Build = MP-8. |

---

## 2 · Erledigt + gemergt

| Aufgabe | PR | Branch | Status |
|---|---|---|---|
| **P0 Task 4 — Parity-Probe** (`scripts/probe-claim-phase-parity.mjs`, **0 Div / 59 Claims**) + **Task 2 — Vitests** (`lifecycle.test.ts` + `get-claim-lifecycle-for-claim.test.ts`, 22 grün) | **#1809** | `kitta/cmm44-claim-phase-p0` | ✅ **MERGED auf staging** @22:01 |
| **A — Override-Bug Stopgap** (`manualPhaseOverride` deaktiviert; `ManualPhaseOverrideModal` Banner + Submit-Sperre) | **#1818** | `kitta/cmm44-phase-override-stopgap` | ✅ **MERGED auf staging** @22:20 |
| **B — verschmolzener P1+P2-Plan + Handoff** (dieses Doc-Bundle) | **#1821** | `kitta/cmm44-p1p2-plan` | 🟡 OFFEN (docs) |

P0 ist damit **vollständig auf staging**: `v_claim_phase`-View + `getClaimLifecycleForClaim`-Loader +
Parity-Probe + 22 Vitests. (Der rote Build-Check auf #1809 war nur der transiente `check:rls-grants`-
Pooler-Abort; nach DB-Neustart grün, sync-watcher hat gemergt.)

---

## 3 · Der zentrale Befund (warum P1 ≠ Plan, und P1+P2 verschmolzen sind)

Beim Reader-Audit für P1 herausgekommen — **das kippt die ursprüngliche P1-Prämisse:**

1. **CMM-44 SP-D** (`20260521154558_cmm44_spd_view_repoint.sql`) hat `v_faelle_mit_aktuellem_termin`,
   `v_claim_full`, `v_claim_listing` auf **`c.phase AS aktuelle_phase`** repointet → seither liefert
   jeder `aktuelle_phase`-Read **`claims.phase` (11-Code, System A)**.
2. Die **reichen Consumer** (FaelleKanban, PhasePipeline/`buildPhasePipelineData`, FallStatusCard,
   Kanzlei-Kanban, Makler-PhasePill) erwarten render-seitig die **52 System-B-Subphasen** → matchen den
   11-Code NICHT → laufen schon **jetzt** auf `status`-Fallback.
3. **System B ist halb-abgebaut:** seine Storage-Spalte `faelle.aktuelle_phase` ist gedroppt (SP-A2,
   `20260517141457`), Consumer bekommen 11-Code, `SUBPHASE_VISIBILITY`-Lookups schlagen fehl.
4. **Termin** ist korrekt orthogonal: `v_claim_phase` liest `gutachter_termine` NICHT direkt; der
   Termin-Effekt fließt über `auftraege.status`.

→ **System-A-Retire (P1) ist mit System-B-Re-Base (P2) + Stepper (P2b) UNVERMEIDLICH gekoppelt.** Views auf
`v_claim_phase` umstellen ohne Consumer-Render-Logik = bricht die ohnehin-kaputten Consumer weiter.

**Live-Bug entdeckt + gefixt (A):** `manualPhaseOverride` schrieb einen der 52 SUBPHASE_VISIBILITY-Werte
direkt in `claims.phase` → gegen den 11-Code-CHECK `claims_phase_check` → **`23514`** (empirisch
bestätigt, ROLLBACK). Defekt seit SP-A2 (2026-05-17). Stopgap-deaktiviert (#1818).

---

## 4 · Aktueller Stand (was auf staging liegt)

- ✅ `v_claim_phase`-View (`main_phase` + `sub_phase`, abgeleitet aus Lead/Auftrag/Kanzleifall) — parity-getestet.
- ✅ `getClaimLifecycleForClaim`-Loader (`src/lib/claims/get-claim-lifecycle-for-claim.ts`).
- ✅ Parity-Probe + Vitests (Branch-Coverage für alle Phasen, die Live-Daten nicht abdecken).
- ✅ `manualPhaseOverride` neutralisiert (kein `23514` mehr; Re-Build = MP-8).
- 🟡 Plan + Handoff (PR #1821, noch offen).
- ❌ Noch NICHT migriert: die ~12 `claims.phase`-Reader, `resolveSubphase`-Re-Base, View-Alias-Entkopplung,
  System-A-Drop, `faelle.status`-Retire, Dispatch-Board/Ownership, Drift-Gate.

---

## 5 · Nächster Schritt (hier einsteigen)

**Vorbedingung:** PR #1809 ist auf staging (✓) → `v_claim_phase` verfügbar.

1. **MP-1 (Analyse, KEIN Code):** System-B-Inventur — die **52 `SUBPHASE_VISIBILITY`-Keys klassifizieren**
   (→ deckt 9er-Haupt-Subphase / Termin-Overlay / re-based Ops-Subphase / retire) + `resolveSubphase`-
   Input-Inventur + System-B-Consumer-Karte (analog zur System-A-Inventur). Output: `cmm44-subphasen-mapping.md`.
2. **DE-1/DE-2/DE-3 mit Aaron bestätigen** (siehe Plan §„Offene Entscheidungen"):
   - **DE-1** Subphasen-Vokabular (9 abgeleitete vs 52 System-B).
   - **DE-2** Visibility-Matrix-Rebase — **whitelabel-kritisch** (was sieht der gebrandete Kunde).
   - **DE-3** `aktuelle_phase`-Alias entkoppeln (3 Views).
3. Dann **MP-2** (`resolveSubphase` auf Sub-Entities) → **MP-3+MP-4 gekoppelt pro Portal** (View-Repoint +
   Reader-Rewrite + einheitlicher `ClaimPhaseStepper granularity`) → **MP-5** (Visibility-Rebase) →
   **MP-6** (System A droppen) → **MP-7** (faelle.status) → **MP-8** (Dispatch-Board + Ownership +
   Override-Redesign derived-kompatibel) → **MP-9** (Drift-Gate CI).

Vollständiges Step-Detail + Reader-Inventar: **der Plan** (§6).

---

## 6 · Artefakte (alles an einem Ort)

- **Spec (approved):** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md`
- **Plan (aktuell, verschmolzen P1+P2):** `docs/27.05.2026/cmm44-claim-phasen-p1p2-merged-plan-2026-05-27.md`
- **Handoff (P1+P2):** `docs/27.05.2026/handoff-claim-phasen-p1p2-2026-05-27.md`
- **Dieses Master-Session-Handoff:** `docs/27.05.2026/SESSION-HANDOFF-claim-phasen-2026-05-27.md`
- **Ur-Plan (Kontext):** `docs/26.05.2026/cmm44-claim-phasen-plan-2026-05-26.md` + `handoff-claim-phasen-ssot-2026-05-26.md`
- **Memory:** `project_claim_phasen_ssot_architektur` (D1 + SP-D-Befund + Deliverables)
- **PRs:** #1809 (P0, merged) · #1818 (Override-Stopgap, merged) · #1821 (Plan+Handoff, offen)
- **Code-Anker:** `src/lib/claims/lifecycle.ts` (`getClaimLifecycle`), `…/get-claim-lifecycle-for-claim.ts`,
  `supabase/migrations/20260526202512_v_claim_phase_view.sql`, `scripts/probe-claim-phase-parity.mjs`,
  `src/lib/fall/subphase-resolver.ts` + `subphase-visibility.ts` (System B, MP-1/MP-2-Ziel).

---

## 7 · Gotchas / Lessons (nicht nochmal reinlaufen)

- **`aktuelle_phase` ist ein überladener Alias** (claims.phase | Pflicht-Phase | 52-Subphase, je nach
  `.from()`/View-Quelle). NIE per String-Grep trennen — immer Embed-Quelle prüfen.
- **SP-D koppelt P1+P2** — getrennt zurückbauen geht nicht. MP-3 (View-Repoint) + MP-4 (Reader-Rewrite)
  immer **zusammen pro Portal** mergen, sonst brechen die System-B-Consumer.
- **False Friends** (NICHT als claims.phase-Reader behandeln): `KritischeUpdatesWidget`=`tasks.phase`,
  cron `kanzlei-sla-check`=`sla_tracking.phase`, cron `pflichtdokumente-reminder`=Pflicht-Vokabular+`tasks.phase`.
- **`db push` (Pooler 5432) funktioniert** auch wenn MCP/REST-Reads (443) timeouten (Pool-Blockade betrifft
  nur Verifikation). MCP-Token läuft ab → `curl -4` gegen PostgREST + `npx supabase db query --linked --file`
  sind die robusten Fallbacks (node `fetch` hängt gegen Supabase, IPv6).
- **Frischer Worktree:** node_modules-Junction + `supabase/.temp`-Kopie + (für Probes) `.env.local`. **Lokales
  `tsc` zeigt 11 Junction-Artefakte** (`sharp`/`@react-pdf`/`pdf-parse`) — KEINE echten Fehler, CI-Typecheck
  ist grün; nur Delta gegen Baseline zählt.
- **PR `--base staging`, NIE self-mergen** — sync-watcher merged build-grüne PRs autonom (+ löscht Branch →
  `[gone]` lokal ist normal nach Merge).
- **Override unter D1:** nicht durch Schreiben von `claims.phase` überschreibbar (Phase ist abgeleitet) →
  MP-8 baut ein Override-FELD (COALESCE über die Ableitung), kein Direkt-Write.
