# Track 1 — T1.2: Operative Zustände re-beheimaten + fall_status auflösen

> **Design-Input (verbindlich):** `docs/31.05.2026/AAR-939-A7-fall_status-claims-quelle-spec.md` (Aaron-GELOCKT: Option A — keep + re-home alle 5). Master: CMM-49 #2118 §A7/§B1/§C/§D3. Branch: `kitta/track1-2-operative-rehoming`.
> **Voraussetzung (GATE):** (1) staging-Fire raus (v_claim_full.phase / faelle_sv_view.auszahlung_gutachter_betrag / fall_status='reklamation' — NICHT meine, müssen vorher gefixt sein) · (2) **`state-machine.ts` = Single coordinated PR mit der 939-Lane.** Erst dann §D3 bauen.

## Stand (was schon erledigt ist)
- **D2 work_state-Split komplett** (T1.1a/b/c). claims.status = Lifecycle/Terminal, work_state = Dispatch/KB.
- **§C Reader (13 „aktiv-vs-terminal"-Filter) → main_phase: via #2131 (98ff5349) MERGED.** Verbleibt nur der **1 granulare** Cron + die 4 Display-Reader (§A7 Teil 1).
- **Heimaten existieren** (§A7 §1, live geprüft): kanzlei_faelle trägt vs_reaktion_typ/vs_kuerzung_grund/anschlussschreiben_am/status; gutachten existiert (QC); claim_payments (Zahlung); claims.vs_ablehnungs_grund. **Einzige Neu-Verdrahtung:** `auftraege.typ='nachbesichtigung'`.

## Sub-PRs (Reihenfolge)
### T1.2-a — `auftraege.typ='nachbesichtigung'` enablement (additiv, KEIN ⚠️SM)
`nachbesichtigung-laeuft` (fall_status) → `auftraege.typ='nachbesichtigung'` (Aaron-Entscheidung). CHECK auf `auftraege.typ` um `'nachbesichtigung'` erweitern (falls noch nicht). v_claim_phase-Side-Quest liest das bereits (vfat hat nachbesichtigung_status). Verify: bestehende auftraege.typ-Werte valide; kein Reader bricht.

### T1.2-b — §D3 Engine-Umbau (⚠️SM, **der große, koordinierte PR**)
`state-machine.ts` (`transitionFallStatus`) hört auf, `faelle.status` zu schreiben → schreibt:
- **Terminals** → `claims.status` (reguliert_vollstaendig/storniert/klage/verjaehrt/abgelehnt_final/an_externe_kanzlei/termin_durchgefuehrt).
- **VS-Granularität** (vs-kuerzt/vs-abgelehnt/anschlussschreiben/regulierung-laeuft) → `kanzlei_faelle` (status/vs_reaktion_typ/vs_kuerzung_grund/anschlussschreiben_am — Felder liegen dort).
- **QC** (filmcheck/qc-pruefung) → `gutachten.status`/`auftraege.status`.
- **Zahlung** (zahlung-eingegangen) → `claim_payments.status='erhalten'`.
**Pflicht-Caveats (§A7 Teil 3):** (1) Side-Effects erhalten — Kürzungs-SLA `state-machine.ts:322` (`kanzlei_kuerzung_antwort`), Billing/Notification-Hooks an der neuen Heimat. (2) **Webhook-Writer** (LexDrive/VS schreiben vs-kuerzt/abgelehnt direkt) mit re-homen, nicht nur die State-Machine. (3) `enumsortorder` (1.5/8.625…) → `sub_phase`-Sortmap (vor Drop `grep "ORDER BY status"` auf faelle-Reader). (4) `checkFallAutoPhase` (2 fire-and-forget Caller: filmcheck.ts:107, kanzlei-paket.ts:400) **mit-retiren**, Task-Trigger (triggerQcTask/triggerKanzleiPaketTask) auf die Sub-Entity-Writer umhängen. (5) `FALL_STATUS_TRANSITIONS`-Graph → schlanke claims-Terminal-Validierung + Sub-Entity-State-Machines.
**Koordination:** andere 939-Owner schreiben claims-Lifecycle teils direkt (embed-B `closeNurGutachter`→termin_durchgefuehrt, dispatch) — bleiben kanonisch; state-machine.ts wird dazu konsistent. **Niemand fasst state-machine.ts parallel an.** Build (npm ci) + Smoke (Status-Übergänge, Kürzungs-SLA feuert, QC-Gate) Pflicht.

### T1.2-c — v_claim_phase-Derivation erweitern (sub_phase für die operativen Zustände)
v_claim_phase um die neuen Sub-Entity-Signale ergänzen, damit die operative Granularität als `sub_phase` ablesbar ist (z.B. kanzlei_faelle.vs_reaktion_typ='gekuerzt' → sub_phase, auftraege.typ='nachbesichtigung' → Side-Quest). EXCEPT-0/0 gegen den Pre-Stand (PR3-Pattern) + lifecycle.ts-Spiegel + Parity-Test (T1.6). **Vor** dem granularen Reader (T1.2-d) landen.

### T1.2-d — Reader-Rest + v_claim_full fall_status-Drop (§B1)
- `api/cron/vs-korrespondenz-review` (1 granular) → `kanzlei_faelle` direkt (status='versicherungskontakt' + vs_reaktion_typ + anschlussschreiben_am) + nachbesichtigung-Signal.
- 4 Display-Reader → `v_claim_phase.sub_phase`-Label.
- Dann **`f.status AS fall_status` aus v_claim_full ersatzlos droppen** (§B1) — kein CASE (Reader sind umgestellt).

## Danach
Track-2 §A7/§D3 erledigt → faelle.status (19-Enum) + FALL_STATUS_TRANSITIONS sterben mit dem faelle-Drop (CMM-49 §G). T1.5 (Lead-Doppel) + T1.6 (Parity-Test) parallel/assignbar.

## Verifikation
Jeder Sub-PR: build (npm ci + tsc) + Portal-Smoke + Screenshot. T1.2-b zusätzlich: Kürzungs-SLA-Smoke + Notification-Baseline-Vergleich. T1.2-c: EXCEPT-0/0 + v_claim_phase-Parity.
