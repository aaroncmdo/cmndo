# Re-Baseline gegen staging (2026-07-11)

Das Audit + die 8 Pläne liefen gegen **aar-956** (stale, **742 Commits hinter staging**, merge-base 2026-06-14). Dieser Check prüft per gezielter Greps gegen **staging-HEAD `32447052b` (#4134)**, welche Findings auf staging noch real sind. **Wichtig: DB-verifizierte Funde laufen gegen die Live-Prod-DB und bleiben real, unabhängig vom Code-Branch.**

| FG | Verdikt auf staging | Evidenz (staging) | Konsequenz |
|----|---------------------|-------------------|------------|
| **FG1** claims-Funnel | **GRÖßTENTEILS GEFIXT** | `endzustand-actions.ts:117` schreibt jetzt `operative_status` (+`abgeschlossen_am`) beim Endzustand (Kommentar :106 „sonst divergieren die…") → der #1-Bypass ist zu | Rest-Scope: übrige Direkt-Writer (`sv-zuweisung`, Creators) + optionaler Trigger-Backstop als Absicherung. **HIGH → LOW.** Vor Bau residual verifizieren. |
| **FG2** Termin-Bugs | **BEIDE BUGS GEFIXT** | `kb-booking.ts:267` „FIX (Status-Enum-Audit 05.07.): 'kunde_storniert'…"; `slots.ts`-`geplant`-Write weg (das noch vorhandene `status:'geplant'` in `faelle/[id]/_actions/termine.ts:223` sitzt auf der **Legacy-`termine`-Tabelle**, dort gültig — nicht derselbe Bug) | Phase 0 obsolet. Rest: Phase-1 Workstate-Mirror (`abgesagt`/`abgelehnt`→resolver) — prüfen, ob noch nötig (staging hat #4134 v_claim_phase-Umbau). |
| **FG3** Branding-Gate | **NOCH VALIDE** | `kunden-theme.ts:66` / `token-theme.ts:34` weiter inline `use_custom_branding !== true` + select `verifiziert`; SV-own `resolve-theme.ts:44/59` nur `use_custom_branding`; **kein Shared-Resolver** | **Voll bauen. HIGH (Access-Control).** frist-enforce-Entscheidung steht. |
| **FG4** Provision | **ENTANGLED / verschoben** | `makler_provisionen` noch in staging `database.types.ts:10706` + Code (`convert-lead-to-claim.ts:450`, `erstelle-anfrage.ts`) — der Drop→`partner_provisionen` liegt auf einem Provision-Feature-Branch, **noch nicht in staging** | → **Provision-Lane `6f60c510`** (ownt die Restrukturierung). Release=Completion+7d-Regel ist im Plan verankert. |
| **FG5** Demotions | **Cluster-5 valide, Rest klein/moot** | `abrechnungen.reminder_gesendet_am` weiter gelesen (`admin/abrechnungen/page.tsx:27,51`) | Cluster-5 (`reminder_gesendet_am`-Drop) + Cluster-3 (dead `durchgefuehrt`-Prädikat) bauen; `abgeschlossen_am`/`gutachten_vorhanden` bleiben (moot). |
| **FG6** dual-SSoT | **REAL (DB-verifiziert)** | `leads.vollmacht_datum` NULL für **alle 35** konvertierten Leads → CPA-Billing liest leer (Live-DB-Fakt); Code-Split lifecycle(lead-copy)↔resolver(claim-copy) | **Bauen.** Enthält echten Billing-Bug. Part B (work_state) bleibt decision-gate. |
| **FG7** SLA | **REAL (DB-verifiziert)** | **69 `sla_breach`-Tasks offen** (Live-DB); `checkCompletionSignal` existiert (`completion-signals.ts:25`), aber SV-`sla-check`-Aufruf noch zu prüfen | **Bauen** (SV-SLA Completion-Re-Check + auto-cancel + blocker-recompute). |
| **FG8** faelle | **MOOT** | **0 live `.from('faelle')`** auf staging (nur CMM-49-Kommentare); faelle längst gedroppt (Mig 20260622140745) | Nur Regression-Guard (`check:faelle-refs`), sonst **skip**. |

## Revidierte Priorität (nach Re-Baseline)

**Echte HIGH jetzt:** **FG3** (Access-Control-Leck) · **FG6** (CPA-Billing-Bug + dual-SSoT) · **FG7** (69 gestaute Breach-Tasks).
**Klein/Rest:** FG5-Cluster5 · FG1-Residual · FG2-Phase1 (jeweils erst „noch nötig?"-Check).
**Nicht selbst bauen:** FG4 → Provision-Lane · FG8 → Regression-Guard/skip.

**Prozess-Lehre:** Baseline immer gegen `staging` prüfen, nicht gegen den zufälligen Session-Branch — hier waren FG1 (#1-Fund) + FG2 (die „dringenden" Bugs) in den 742 staging-Commits bereits erledigt.
