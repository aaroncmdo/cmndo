# Claim-Phasen-SSoT — P1+P2 (verschmolzen) Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (oder subagent-driven-development) zur task-weisen Umsetzung. Steps mit `- [ ]`.

**Goal:** `getClaimLifecycle` / `v_claim_phase` (4 Hauptphasen + Subphase, abgeleitet aus Lead+Auftrag+Kanzleifall) zur **app-weiten** Single-Source machen; die ~12 echten `claims.phase`-Reader und die System-B-Render-Logik darauf umstellen; den überladenen `aktuelle_phase`-View-Alias von `claims.phase` entkoppeln; `calc_claims_phase`/`claims.phase` (D1) retiren; Gutachter-Termin als orthogonale Achse sauber andocken.

**Architecture:** Phase rein **abgeleitet** (Entscheidung **D1**, Aaron 2026-05-26 — eine Quelle, kein Drift). **Wichtig:** P1 und P2 des ursprünglichen Plans (`docs/26.05.2026/cmm44-claim-phasen-plan-2026-05-26.md`) sind **verschmolzen**, weil CMM-44 **SP-D** den `aktuelle_phase`-Alias bereits an `claims.phase` gekoppelt hat und die „reichen" Consumer System-B-geformt sind. System A und System B lassen sich daher **nicht** getrennt zurückbauen. Termin bleibt **orthogonal** (Detail-States aus dem Termin-Lifecycle, nicht als Phase).

**Tech Stack:** Next.js 15 (App Router, Server Components/Actions), Supabase/Postgres (Views + RLS, Migrations via `npx supabase db push` — Regel 2), Vitest.

**Spec:** `docs/26.05.2026/cmm44-phase3-status-sp-strategie-2026-05-26.md` (approved 2026-05-26). **Memory:** `project_claim_phasen_ssot_architektur`.

---

## Stand & Vorarbeiten (NICHT nochmal machen)

- **P0 FERTIG** (PR #1809, Branch `kitta/cmm44-claim-phase-p0`): `getClaimLifecycleForClaim`-Loader (`src/lib/claims/get-claim-lifecycle-for-claim.ts`), SQL-Spiegel `v_claim_phase` (Migration `20260526202512_v_claim_phase_view.sql`), Parity-Probe (`scripts/probe-claim-phase-parity.mjs` — **0 Divergenzen / 59 Claims**), Vitests (`lifecycle.test.ts` + `get-claim-lifecycle-for-claim.test.ts`, 22 grün). `v_claim_phase` liefert `main_phase` (erfassung/begutachtung/regulierung/abschluss) + `sub_phase` (9 Werte).
- **Override-Stopgap FERTIG** (PR #1818, Branch `kitta/cmm44-phase-override-stopgap`): `manualPhaseOverride` war seit SP-A2 (2026-05-17) bei jeder Nutzung defekt (`23514 claims_phase_check` — schrieb 52-Subphasen-Werte in die 11-Code-Spalte). Stopgap-deaktiviert; **echter Re-Build = MP-8 (P3)** mit einem derived-kompatiblen Override-Feld.

## Warum geschäftskritisch

Die Lifecycle-Dynamik ist der promotete Produkt-Value (Aaron, explizit): der Claim lebt sichtbar in Echtzeit aus Auftrag-/Termin-/Kanzlei-State — **auch im gebrandeten Kunde-Portal** (Whitelabel). Genau die Phasen-Anzeige im Kunde-Stepper speist dieses Modell. MP-5 (Visibility) bestimmt direkt, was (Whitelabel-)Kunden sehen.

---

## DER zentrale Audit-Befund (warum P1+P2 verschmolzen sind)

CMM-44 **SP-D** (`supabase/migrations/20260521154558_cmm44_spd_view_repoint.sql`) hat `v_faelle_mit_aktuellem_termin`, `v_claim_full` und `v_claim_listing` auf **`c.phase AS aktuelle_phase`** repointet. Seitdem:

1. **`aktuelle_phase` = `claims.phase` (11-Code System A)** — überall wo eine View es liefert.
2. **Die reichen Consumer** (`FaelleKanban`, `PhasePipeline`/`buildPhasePipelineData`, `FallStatusCard`, Kanzlei-Kanban, Makler-`PhasePill`) erwarten render-seitig die **52 System-B-Subphasen** → matchen den 11-Code NICHT → laufen auf **`status`-Fallback**. (Schon JETZT auf staging so.)
3. **System B ist halb-abgebaut:** seine Storage-Spalte `faelle.aktuelle_phase` ist gedroppt (SP-A2, `20260517141457`:763), seine Consumer bekommen 11-Code, die `SUBPHASE_VISIBILITY`-Lookups schlagen fehl.
4. **`claims.phase`** hält live nur 11-Code (`{0_lead, 2_in_bearbeitung, 3_gutachter_unterwegs}`), geschrieben vom Trigger `trg_claims_set_phase`/`calc_claims_phase` (falsche Inputs: claims.status + gutachten/repairs/vs_korrespondenz).

→ Views auf `v_claim_phase` umstellen **ohne** die Consumer-Render-Logik mitzuziehen würde die ohnehin-kaputten Consumer weiter brechen. Beides muss zusammen, portal-weise.

**Lesson (im Plan verankern):** `aktuelle_phase` ist ein **überladener Alias** (claims.phase | Pflicht-Phase in `v_claim_full`-Cron-Kontext | 52-Subphase im Override-Kontext, je nach `.from()`-Quelle). NIE per String-Grep trennen — immer die Embed-/View-Quelle prüfen.

---

## OFFENE ENTSCHEIDUNGEN — vor MP-2 bestätigen (Spec-Review)

- **DE-1 Subphasen-Vokabular.** `v_claim_phase` = 9 Subphasen; System B `SUBPHASE_VISIBILITY` = 52. Spec §3/§6: feine Ops-Subphasen **bleiben** (re-based auf Sub-Entities), Termin-Detail (`sv_unterwegs`/`sv_vor_ort`/…) ist **orthogonal** → Termin-Overlay, NICHT Phase. Pro 52er-Key entscheiden: (a) deckt sich mit einer der 9 Haupt-Subphasen, (b) Termin-Overlay, (c) bleibt feine Ops-Subphase (re-based via `resolveSubphase` auf Sub-Entities), (d) retire. → MP-1 liefert diese Klassifikation.
- **DE-2 Visibility-Matrix.** `SUBPHASE_VISIBILITY` steuert Kunde/SV-Sicht (auch im gebrandeten Kunde-Portal). Auf die neue Subphasen-Quelle re-basen. **Kritisch** — bestimmt, was (Whitelabel-)Kunden sehen. Treffermenge vor/nach vergleichen.
- **DE-3 `aktuelle_phase`-Alias.** Repoint der 3 Views von `c.phase` auf `v_claim_phase` (`main_phase` + `sub_phase`). Property-Name beibehalten (`aktuelle_phase`) oder sauber umbenennen? Empfehlung: zwei explizite Felder `main_phase`/`sub_phase` in den Views, `aktuelle_phase` als Alias nur solange Consumer es brauchen, dann weg.

---

## Vollständigkeitsregel (hart)

Pro MP-Phase: komplette Migration (kein Übergangs-Mischform), alte Render-Pfade **gelöscht** (`git grep` leer), Smoke-Test (Screenshot-Pflicht) auf **jedem** betroffenen Portal, PR `--base staging`, **kein** Self-Merge (sync-watcher merged build-grün). Migrationen nur via `db push` (Regel 2), im ruhigen Pool-Slot (`db push` Port 5432 funktioniert auch wenn 443-Reads timeouten).

---

## Phase MP-0 — Foundation ✓ ABGESCHLOSSEN

`getClaimLifecycleForClaim` + `v_claim_phase` + Parity-Probe + Vitests. PR #1809. Nichts zu tun außer: **PR #1809 muss auf staging gemergt sein**, bevor MP-2+ startet (sonst fehlt `v_claim_phase`).

## Phase MP-1 — System-B-Inventur + Subphasen-Modell-Entscheidung (Analyse, kein Code)

**Files (read-only):** `src/lib/fall/subphase-resolver.ts`, `src/lib/fall/subphase-visibility.ts` (`SUBPHASE_VISIBILITY`, `PHASE_META`, `buildPhasePipelineData`), `src/components/shared/fall-phases/*` (System-B-`PhasePipeline`), `src/lib/fall/queries.ts` (`FALL_SELECT_KUNDE`, `getFallForAdmin/Sv`).

- [ ] **52-Subphasen-Klassifikation** erstellen: jede `SUBPHASE_VISIBILITY`-Key in {a: deckt 9er-Haupt-Subphase / b: Termin-Overlay / c: re-based Ops-Subphase / d: retire}. Tabelle als `docs/<datum>/cmm44-subphasen-mapping.md`.
- [ ] **`resolveSubphase`-Input-Inventur:** welche Felder liest es heute (faelle-Trigger-Felder? bereits umgebogen?) und woher kämen sie aus den Sub-Entities (`auftraege`/`kanzlei_faelle`/`leads`/`gutachter_termine`).
- [ ] **Consumer-Inventur System B** (analog zur System-A-Inventur im Audit): `PhaseTriggerList`, `next-step-hints`, SLA-Tracker, `FallPhasenPanel`, `buildPhasePipelineData`-Caller — je file:zeile + was es mit der Subphase tut.
- [ ] DE-1/DE-2/DE-3 mit Aaron bestätigen. **Kein Code vor Bestätigung.**

**DoD MP-1:** Subphasen-Mapping-Doc + System-B-Reader-Karte + bestätigte DE-1/2/3. (Kein Merge — reine Analyse.)

## Phase MP-2 — `resolveSubphase` auf Sub-Entities re-basen (System B)

**Files:** `src/lib/fall/subphase-resolver.ts`, `src/lib/fall/subphase-resolver.test.ts`, `src/lib/fall/subphase-visibility.ts`.

- [ ] `resolveSubphase`-Input von faelle-Trigger-Feldern auf **Sub-Entities** umstellen: Termin-Detail (unterwegs/vor Ort/durchgeführt) aus `gutachter_termine` (Termin-Lifecycle), Auftrag-States aus `auftraege`, Kanzlei aus `kanzlei_faelle`, Lead aus `leads`. Gemäß DE-1-Klassifikation.
- [ ] `subphase-resolver.test.ts` auf neue Inputs umschreiben — **Treffermenge erhalten** (kein Eindampfen der Ops-Subphasen). Treffermengen-Test ist Pflicht (Risiko-Hotspot).
- [ ] Smoke: Admin/SV-Fallakte (`PhaseTriggerList`/`FallPhasenPanel`) + 1 SLA-Pfad. Commit + PR.

**DoD MP-2:** `resolveSubphase` liest **kein** faelle-Feld mehr; die feinen Ops-Subphasen bleiben intakt (re-based); Termin-Detail kommt aus dem Termin-Lifecycle.

## Phase MP-3 — View-Alias-Entkopplung (`aktuelle_phase` → `v_claim_phase`)

**Files:** Migration `<ts>_cmm44_repoint_aktuelle_phase_to_v_claim_phase.sql` für `v_faelle_mit_aktuellem_termin`, `v_claim_full`, `v_claim_listing` (Definitionen: server-seitig via `pg_get_viewdef` lesen, `c.phase AS aktuelle_phase` → `v_claim_phase.main_phase` + `.sub_phase` joinen). **Gated:** zusammen mit MP-4 mergen (sonst brechen die Consumer).

- [ ] Migration: die 3 Views joinen `v_claim_phase vcp ON vcp.claim_id = c.id`, exponieren `vcp.main_phase` + `vcp.sub_phase`; `aktuelle_phase` bleibt als Alias auf `sub_phase` **nur** solange Consumer es lesen.
- [ ] `db push` im ruhigen Slot, DB-verifiziert (`pg_get_viewdef` Vorher/Nachher; Smoke auf den lesenden Portalen).

**DoD MP-3:** `aktuelle_phase` aus den 3 Views = abgeleitete Subphase (nicht mehr `c.phase`). Reine View-DDL.

## Phase MP-4 — Reader-Rewrite portal-weise (die ~12 Consumer)

**Reader-Inventur (aus dem Audit 2026-05-26):** je Portal eine PR.

- [ ] **Kunde-Portal** — `src/lib/claims/get-kunde-faelle.ts:583` (`aktuelle_phase: c.phase`) → `v_claim_phase`/Loader; `FallStatusCard.tsx` `getStatusConfig` auf 4-Haupt+Subphase. Smoke `/kunde`, `/kunde/faelle`, `/kunde/faelle/[id]` (gebrandet testen!).
- [ ] **Admin-Hub/Kanban** — `src/app/admin/faelle/(hub)/page.tsx:67,117,269` + `FaelleKanban.tsx` (`mapStatus`, `buildPhasePipelineData`, System-B-`PhasePipeline` Overlay) → `v_claim_phase`. Smoke Admin-Kanban.
- [ ] **Kanzlei-Kanban** — `src/app/kanzlei/kanban/page.tsx:67,91` (`phaseFromAktuellePhase(fClaim.phase)` — nutzt Ziffern-Prefix, bricht bei `erfassung`!) → 4-Haupt-Gruppierung. `src/app/kanzlei/mandate/page.tsx:41`. Smoke Kanzlei-Kanban.
- [ ] **Makler** — `src/lib/makler/queries.ts:330,559` (`aktuelle_phase` → `PhasePill`) → neue Subphase. Smoke Makler-Liste.
- [ ] **Admin/SV-Fallakte** — `src/lib/fall/queries.ts` (`FALL_SELECT_KUNDE`, `getFallForAdmin/Sv`) → `FallakteShell.tsx:153`/`FallDetailClient.tsx:238` → `FallPhasenPanel`. **Eine** rollenneutrale `ClaimPhaseStepper`-Komponente (`granularity: 'kunde' | 'admin'`) für Kunde+Admin (ehemals P2b): 4-Phasen-Backbone, Kunde = mainPhase + aktive subPhase inline, Admin = aktive Phase expanded + Subphasen (aus re-baseter `resolveSubphase`) + Trigger + Override-Einstieg. Alte getrennte Render-Pfade löschen (`git grep`). Smoke Kunde-Stepper + Admin-PhasePipeline = konsistent.

**DoD MP-4:** Alle ~12 Reader lesen die abgeleitete Phase; `ClaimPhaseBadge`/claims-`PhasePipeline` (0-Consumer-Altlast) entweder genutzt oder gelöscht; Stepper Kunde+Admin aus einer Quelle.

## Phase MP-5 — Visibility-Matrix re-base (DE-2)

**Files:** `src/lib/fall/subphase-visibility.ts` (`SUBPHASE_VISIBILITY`).

- [ ] `SUBPHASE_VISIBILITY` auf die neue Subphasen-Quelle (MP-2) re-basen; Keys = die re-based Subphasen, nicht die alten 52 faelle-Werte.
- [ ] **Whitelabel-kritisch:** Kunde/SV-Sichtbarkeit pro Phase vor/nach vergleichen (Treffermenge), gebrandetes Kunde-Portal smoken.

**DoD MP-5:** Visibility wird aus der abgeleiteten Subphase gespeist; Kunde/SV sehen identisch oder bewusst korrigiert; gebrandetes Portal geprüft.

## Phase MP-6 — System A retiren (`calc_claims_phase` / `claims.phase`)

**Files:** Migration `<ts>_cmm44_drop_calc_claims_phase.sql`.

- [ ] Vorbedingung: `git grep "claims.*phase"` zeigt **keinen** Reader von `claims.phase` mehr (nur abgeleitete Quelle). Trigger `trg_claims_set_phase` + Function `calc_claims_phase` droppen; Spalte `claims.phase` + CHECK `claims_phase_check` droppen (D1). `db push`, DB-verifiziert.
- [ ] Smoke alle 5 Portale.

**DoD MP-6:** `calc_claims_phase`/`claims.phase`/`claims_phase_check` weg; Phase rein abgeleitet.

## Phase MP-7 — `faelle.status` retiren (ehemals P4/P5)

**Files:** Reader-Sweep `faelle.status`/`fall_status` + `transitionFallStatus` (`src/lib/.../state-machine.ts`), Notification-Trigger.

- [ ] Konsumenten-Inventur (`git grep "faelle\.status\|fall_status"` + `.eq('status'` auf `from('faelle')`), portal-weise umstellen. Notification-Trigger (`on_gutachten_eingegangen`/…) auf claims/Sub-Entity-Events umziehen oder droppen. `transitionFallStatus` + `faelle.status` droppen.
- [ ] Voller Build + 5 Portale Smoke.

**DoD MP-7:** `faelle.status` + `transitionFallStatus` weg.

## Phase MP-8 — Dispatch-Board + Ownership-Handoff + Termin-Achse + Override-Redesign (ehemals P3)

**Files:** Dispatch-Board-View/Query, `bestaetigeTermin`/durchgeführt-Pfad, Admin-Monitoring, `manual-phase-override.ts` (Re-Build), `ManualPhaseOverrideModal.tsx`.

- [ ] **Dispatch-Board** = `gutachter_termine` typ=erstgutachten `durchgefuehrt_am IS NULL`.
- [ ] **Ownership-Handoff bei „durchgeführt":** Erst-Termin durchgeführt → Auftrag `besichtigung→gutachten` + expliziter Übergang Dispatcher→KB.
- [ ] **SV-Komplettausfall → Re-Dispatch** (KB-Trigger, ≠ Verlegung).
- [ ] **Override-Redesign (derived-kompatibel):** statt `claims.phase`-Write ein **Override-Feld** (z.B. `claims.phase_override` + Grund), das der Loader/`v_claim_phase` respektiert (COALESCE override über abgeleitet). `manualPhaseOverride`-Action + Modal reaktivieren (siehe Stopgap PR #1818, git-Historie für die Audit-Logik).
- [ ] **Admin-Monitoring** + Audit-Trail.

**DoD MP-8:** Dispatch-Board zeigt offene Erst-Termine; Handoff bei durchgeführt; Override funktioniert wieder (derived-kompatibel); Termin-Detail als Overlay.

## Phase MP-9 — Drift-Bremse (CI-erzwungen, ehemals P6)

**Files:** `scripts/check-claim-phase-parity.mjs` (aus `probe-claim-phase-parity.mjs`), `package.json`, CI-Workflow, AGENTS.md.

- [ ] **Parity-Gate (CI):** `npm run check:claim-phase-parity` — `v_claim_phase` == `getClaimLifecycleForClaim` für alle Claims (P0-Probe → permanentes Gate).
- [ ] **B↔C-Konsistenz (vitest, CI):** `resolveSubphase(...)`-Hauptphase == `getClaimLifecycle(...).mainPhase` für dieselben Sub-Entity-Inputs.
- [ ] **Single-Source-Guard (CI grep):** blockt neue `claims.phase`/`faelle.status`/`calc_claims_phase`-Reader + Direkt-Konstruktion von `ClaimLifecycleInput` außerhalb des Loaders (Skip-Header-Konvention wie Token-Audit).
- [ ] In CI-Pipeline + AGENTS.md §claim-phase-drift-bremse dokumentieren.

**DoD MP-9:** Drift CI-blockiert; eine zweite Phasen-Quelle / faelle.status-Reader / View↔TS-Divergenz macht den Build rot.

---

## Self-Review (Spec-Coverage)
- Spec §2.1 (2 Achsen) → MP-2/MP-3/MP-4 (Phase) + MP-8 (Termin/Dispatch). ✓
- Spec §2.2 (Sub-Lifecycles) → MP-0-Loader + MP-2-resolveSubphase re-base. ✓
- Spec §2.3 (Ownership durchgeführt) → MP-8. ✓
- Spec §2.4 (Admin-Überwachung) → MP-8. ✓
- Spec §3 (A/B/faelle.status reconcile) → MP-2 (B) / MP-4 (Reader) / MP-6 (A) / MP-7 (faelle.status). ✓
- Spec §4 (D1) → bestätigt; `claims.phase` Drop in MP-6. ✓
- Spec §6 (Termin orthogonal, Detail NICHT als Phase) → DE-1 + MP-2 (Termin-Overlay) + MP-8. ✓
- Spec §7 (Konsumenten-Karte) → Reader-Inventur in MP-1 (B) + Audit (A, schon erledigt). ✓

## Risiken
- **MP-2 (System-B-Re-Base) = heikelster Schritt:** die feinen Ops-Subphasen + SLA dürfen nicht eindampfen — Treffermengen-Test Pflicht.
- **MP-3+MP-4 gekoppelt:** View-Repoint ohne Consumer-Rewrite bricht die System-B-Consumer. Immer zusammen pro Portal mergen.
- **MP-5 Whitelabel:** Visibility-Re-Base bestimmt, was gebrandete Kunden sehen — vor/nach vergleichen.
- **D1 View-Performance:** `v_claim_phase` auf Listen mit EXPLAIN prüfen; falls zu langsam → `MATERIALIZED VIEW` (bleibt single-source), NICHT zurück zur Spalte.
- **Pool/Parallel-Sessions:** Migrationen im ruhigen Slot, `db push` atomar, nur CLI.

## Inventar — die ~12 echten `claims.phase`-Reader (aus dem Audit 2026-05-26)
`src/app/admin/faelle/(hub)/page.tsx` (67/117/269), `src/lib/claims/get-kunde-faelle.ts:583`, `src/app/kanzlei/kanban/page.tsx` (67/91), `src/app/kanzlei/mandate/page.tsx:41`, `src/lib/makler/queries.ts` (330/559), `src/lib/fall/queries.ts` (`FALL_SELECT_KUNDE`, `getFallForAdmin/Sv`), `src/app/faelle/[id]/FallakteShell.tsx:153`, `src/app/gutachter/fall/[id]/FallDetailClient.tsx:238`, `src/components/admin/fallakte/FallActionBar.tsx:58`, `src/components/kunde/FallStatusCard.tsx:121`, `src/app/admin/faelle/(hub)/FaelleKanban.tsx` (122/255/421).
**False Friends (NICHT anfassen — anderes Vokabular):** `KritischeUpdatesWidget` (`tasks.phase`), cron `kanzlei-sla-check` (`sla_tracking.phase`), cron `pflichtdokumente-reminder` (`v_claim_full`-Pflicht-Phase + `tasks.phase`).
**Writer:** `trg_claims_set_phase`/`calc_claims_phase` (Trigger). `manual-phase-override` = Stopgap-deaktiviert (PR #1818), Re-Build in MP-8.
