# Claim-Detail Ops-Rebuild + Lifecycle-Cleanup — Design Spec

**Datum:** 2026-07-08 · **Owner-Lane:** claim-lifecycle-cleanup (Session ops-cockpit) · **Status:** Design (Aaron approved decomposition)

## Ziel

Die **Claim-Detail-View (Fallakte)** von Grund auf neu — ops-ausgerichtet, auf die DB normalisiert, rollen-aware — als DETAIL-Gegenstück zum Phase-2-Cockpit. **Gleichzeitig** das darunterliegende **Claim-Lifecycle-Modell sauber machen**: EINE Phasen-SSoT überall kanonisch + die drei Status-Spalten konsolidiert, damit die Sub-Entity-Lifecycles (Lead/Auftrag/Kanzleifall) **ein integriertes Modell** bleiben statt paralleler Ableitungen.

## Kontext — Ist-Zustand (aus dem Audit, gegen Prod verifiziert)

Der Claim ist **keine flache Zeile**, sondern eine Komposition von 4 Sub-Entity-Lifecycles:

| Entity | Tabelle | Phase | Lifecycle |
|---|---|---|---|
| **Lead** | `leads` | Erfassung | Qualifizierung (Q1–Q8), `qualifizierungs_phase`, `sa_unterschrieben`/`vollmacht`/`onboarding` |
| **Auftrag** (SV-Arbeit) | `auftraege` | Begutachtung | `typ` (erstgutachten/nachbesichtigung/stellungnahme) × `status` (termin→besichtigung→gutachten→abgeschlossen) + `filmcheck_ok`/`gutachten_url` → filmcheck/qc. Mehrere pro Claim, reihenfolge-geordnet. |
| **Kanzleifall** | `kanzlei_faelle` | Regulierung | `status`, `vs_reaktion_typ` (gekuerzt), `vs_kontakt_am`, `anschlussschreiben_am`, `lexdrive_case_id`, `ausgezahlt_am`. 0..1 pro Claim. |
| **Claim** (Top) | `claims` | — | 3 Status-Spalten (s.u.) |

**SSoT der Phase:** `getClaimLifecycle` (TS, `src/lib/claims/lifecycle.ts`, 8-Prioritäten furthest-wins) ↔ `v_claim_phase` (SQL, bit-parity) + `phase_override` (Phase 1d, COALESCE in v_claim_phase).

**Ist-Detail-View:** 3 voll-duplizierte Rollen-Routen — `/faelle/[id]` (Admin/KB, ~1130 LOC, Tabs), `/kunde/faelle/[id]` (~1071 LOC, Scroll-Flow), `/gutachter/fall/[id]` (~671 LOC, Card-Stack). ~40% Query-Duplikation. Nutzt **keine** Phase-2-Ops-Primitiven.

**Sauberkeits-Baustellen (verifiziert gegen Prod):**
1. **`v_claim_full` dupliziert die Phasen-Ableitung inline** (liest `v_claim_phase` NICHT) → `phase_override` erreicht `v_claim_phase` + Cockpit (via COALESCE), aber NICHT `v_claim_full`/`v_claim_base` → SSoT **nicht überall kanonisch**.
2. **3 Status-Spalten** `claims.status` (enum, terminal+nicht-terminal) / `operative_status` (Cursor, state-machine) / `work_state` (Dispatch-Achse, verwaist) — parallele Achsen, `getClaimLifecycle` liest nur `status`, keine Cross-Validierung → Drift-Risiko.
3. **Kein Parity-Test** `getClaimLifecycle` ↔ `v_claim_phase`.

## Scope-Entscheidungen (Aaron)

- **Alle 3 Rollen, geteilte Datenschicht + getrennte Präsentationen.**
- **Voll-Cleanup inkl. Status-Spalten-Konsolidierung.**

## Dekomposition (4 Sub-Projekte, Fundament-zuerst)

### A · Lifecycle-SSoT-Härtung *(Fundament, moderate Risk)*
- **A1 — Parity-Test:** `getClaimLifecycle` ↔ `v_claim_phase` auf Live-Sample als PR-Gate (`src/lib/claims/__tests__/claim-phase-parity.test.ts` o.ä.). Beweist die EINE Ableitung. Muss existieren, BEVOR A2 die Views anfasst.
- **A2 — Dedup:** `v_claim_full`/`v_claim_base` **lesen `v_claim_phase`** (`LEFT JOIN v_claim_phase` + `vcp.main_phase`/`vcp.sub_phase`) statt inline-CASE → `phase_override` überall kanonisch. Chirurgisch (wie Phase 1d): 9-Substring-Verifikation, Gate + `audit_ungated_definer_views`/`audit_claim_views_leaking_to_nobody` = 0, verhaltens-neutral gegen die Parity.
- **Risk:** `v_claim_full` ist contested (Sessions `6f60c510`/`6c630247`). Koordiniert, additiv-verifiziert.

### B · Status-Spalten-Konsolidierung *(höchste Risk — contested Core, eigener Bau)*
- **B0 — Consumer-Audit:** vollständige Karte wer `status`/`operative_status`/`work_state` liest/schreibt (state-machine, endzustand-actions, autoPhase, v_claim_workstate, Listen, Cockpit, …).
- **B1 — Ziel-Achsen:** `status` = Phase-SSoT (terminal + nicht-terminal). `operative_status` = EIN-Writer-Cursor (state-machine) ODER abgeleitet. `work_state` = klären-oder-droppen (heute verwaist).
- **B2 — Writer-Alignment:** state-machine einziger Writer von `operative_status`; endzustand-actions für `status`; `autoPhase`-Dup in state-machine konsolidieren.
- **Risk:** hoch, viele Consumer, aktive Sessions. Mitigation: Consumer-Audit zuerst, additiv, breite Tests, Koordination. **Eigenes detailliertes Design/Plan.**

### C · `ClaimDetail`-Datenschicht
- `getClaimDetail(supabase, claimId, role)` → getyptes `ClaimDetail`, das die Sub-Entity-Lifecycles über die (nach A) saubere SSoT komponiert — **nie re-derived**.
- **Shape:** `claim` (Core) · `lifecycle` (getClaimLifecycle-Bundle: mainPhase/subPhase/aktiverAuftrag/aktiveSideQuests) · `workItem` (Phase-2 `ClaimWorkItem` aus v_claim_workstate: Next-Best-Action/overdue) · `lead` · `auftraege[]` (je eigener Lifecycle) · `kanzleiFall` · `parties` · `fahrzeug` · `payments` · `mietwagen` · `dokumente` · `timeline` · `permissions` (Rolle → sichtbare Sektionen + editierbare Felder + erlaubte Aktionen).
- Reused `getClaimLifecycleForClaim`; rollen-gescoped (RLS + Permission-Descriptor). Killt die 40%-Duplikation.

### D · Rollen-Präsentationen *(auf C migriert, getrennte Layouts)*
- **D1 — Admin/KB:** voll ops-editierbare Detail — Next-Best-Action-Hero + Phasen-Stepper + Inline-Edit JEDES Sub-Entity-Felds + Timeline. **„Der ganze Claim mit Ops."** Reused WorkItemCard/updateClaimField/overrideClaimPhase/Status-Registry.
- **D2 — SV:** ihre `auftraege` + gescopeter Claim-Kontext (Task-Layout bleibt).
- **D3 — Kunde:** Narrativ-Slice auf normalisierten Daten (Scroll-Flow bleibt).

## Ziel-Architektur

- **EINE Phasen-SSoT** (`getClaimLifecycle` ↔ `v_claim_phase`), nach A überall kanonisch (inkl. `phase_override`).
- **EINE Claim-Status-Achse** (nach B): `status`=Phase, `operative_status`=Cursor, `work_state` aufgelöst.
- **EIN normalisierter Detail-Loader** (`getClaimDetail`), 3 Rollen-Präsentationen.
- Reused Phase-2-Ops-Primitiven: `ClaimWorkItem`, `WorkItemCard`, `updateClaimField`, `overrideClaimPhase`, `src/lib/status`-Registry, `ClaimMainPhaseBadge`/`FallPhaseBadge`.

## Sequenz

**A → B → C → D.** A zuerst (well-defined, de-riskt alles). B sorgfältig mit Consumer-Audit + Koordination. C/D auf dem sauberen Modell. Jedes Sub-Projekt: eigener Plan → Branch → PR gegen staging → Prod-Smoke bis 1+ (wie Phase 2).

## Koordination

- **Claim-lifecycle-cleanup-Lane = diese Session.** A+B fassen `v_claim_full`/`v_claim_phase`/`claims`-Status an = contested Core, geteilt mit `6f60c510` (payment-ledger)/`6c630247` (termine)/`876a45e8` (claim-ai). **Vor jedem Touch an v_claim_*/claims-Status koordinieren; additiv-first + Parity-Gate.**
- Phase-3-Dispatch-Foundation (`v_lead_workstate`) = Session `1069c2a2` — konsumieren, NICHT duplizieren.

## Testing

- **A:** Parity-Test (PR-Gate) + audit=0 + 9-Substring-Verifikation.
- **B:** Consumer-Audit + Regression-Tests auf Status-Transitions + Parity bleibt grün.
- **C:** Loader-Unit-Tests (rollen-gescoped, Komposition, env=node).
- **D:** Rollen-Prod-Smokes (echte Inputs, frischer SW-freier Browser — wie Phase-2 Admin-Smoke via Service-Key-Magic-Link).

## Risiken

- **B (Status-Spalten) = höchste Risk:** contested Core, viele Consumer. Mitigation: Consumer-Audit zuerst, additiv, breite Tests, Koordination, ggf. eigenes Sub-Projekt-Design.
- **Kollision** auf `v_claim_*`/`claims` mit aktiven Sessions. Mitigation: Koordinations-Marker, additiv-first, Parity-Gate.
- **Scope-Größe:** 4 Sub-Projekte → strikt sequenziell, jedes einzeln prod-reif + gesmoked bevor das nächste startet.
