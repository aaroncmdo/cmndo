# T3 — `claims.status` physisch droppen (Status-Achsen-Konsolidierung, letzter Schritt)

**Entscheidung Aaron 15.07.:** physisch droppen (nicht Generated Column). Endzustand: `operative_status`
ist die EINZIGE Status-Achse der claims-Tabelle.

Safe-drop = mehrstufig + **deploy-gated**: Reader zuerst auf operative_status, DANN Writer entfernen,
DANN droppen. Sonst lesen Consumer stale/leere status. Jede Slice = eigener PR + Regel-4-Prod-Smoke.

## Vollständiger Audit (15.07., Session 3cff8e12)
- **6 Views**: `v_claim_base` (ZENTRAL, reicht `c.status` roh durch + hat schon operative_status/fall_status),
  `v_claim_phase` (status nur im Selbstzahler-Zweig, 3× `status OR operative_status`; op-Seite deckt
  `reguliert_vollstaendig` dort NICHT ab), `v_claim_listing`, `v_claim_sv`, `v_claim_for_gast`,
  `v_claim_timeline_ungated_internal`.
- **1 Funktion**: `cron_verjaehrungs_warner` (`WHERE c.status NOT IN ('reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')`).
- **2 Indizes**: `idx_claims_status_dispatch` (`WHERE status='dispatch_done'`), `idx_claims_status_offen` (TOT — 'offen' nicht im CHECK).
- **8 Writer**: 4 Dual-Write (schreiben operative_status BEREITS korrekt: endzustand `setEndzustandFields`
  Z.125/133, state-machine via `resolveCursorOperativeStatus`, close-nur-gutachter, seed) + **3 kanzlei-wunsch
  status-ONLY** (Drift) + Wert-Builder `mapFallStatusToClaimStatus`.
- **18 Reader** (14 direkt + 4 nested) + 1 Test. Dead-Read: `get-claim-lifecycle-for-claim.ts:59`.

## Slices

### Slice 1 — Harden die 3 status-only Writer (ADDITIV, standalone Bugfix) ← DIESE SESSION
`kanzlei-wunsch/actions.ts`: `versendeKanzleiPaket` (:340) + `bestaetigeSelbstEinreichungOhneKanzlei` (:408)
→ zusätzlich `operative_status:'an_externe_kanzlei_uebergeben', abgeschlossen_am:now`. Smoke-Helper (:646)
→ zusätzlich `operative_status:'in_kommunikation_vs'`. Danach trägt operative_status ALLES, was status trug.
Behebt zugleich den T4-Drift-Bug (Terminal ohne op-Status → Badge/Phase/aktive-Filter falsch).

### Slice 2 — Reader repointen (status → operative_status), deploy-gated auf Slice 1
18 Reader. Dead-Read (`get-claim-lifecycle-for-claim.ts:59` claimStatus) droppen; Dual-Reads
(release-runner:89, orchestrator/context:71 `operative_status ?? status`, state-machine:112 nested)
→ status-Teil weg; direkte (versicherungen/queries, flotte/*, kanzlei/actions, kunde-claim-view,
firmen-flotte-detail, inbound/process-inbound-text, twilio/inbound, embed-b-cron, subphase-resolver,
smoke-page) → operative_status. Ggf. in 2 Sub-PRs splitten.

### Slice 3 — Views + cron repointen (DDL via Plugin), deploy-gated auf Slice 2
- `v_claim_phase`: Selbstzahler-Zweig — die 3 `co.status`-Reads entfernen, op-Seite um
  `operative_status='reguliert_vollstaendig'` ergänzen (sonst Lücke).
- `v_claim_base`: `c.status`-Projektion → Ausgabe-Spalte `status` = `operative_status` (Alias, hält
  Downstream lebend) ODER Downstream separat repointen; entscheiden beim Bau.
- `v_claim_listing`, `v_claim_sv`, `v_claim_for_gast`, `v_claim_timeline_ungated_internal`: analog.
- `cron_verjaehrungs_warner`: `c.status NOT IN (terminals)` → `c.operative_status NOT IN (CLOSED_OPERATIVE_STATUS)`.

### Slice 4 — status-Writes aus Dual-Writern entfernen + Guards repointen, deploy-gated auf Slice 3
`endzustand-actions.ts` (status aus setEndzustandFields; Guard `.not('status','in',ENDZUSTAENDE)`
→ `.not('operative_status','in', CLOSED)`; loadClaimContext-status-Read weg), `state-machine.ts`
(claimsUpdate.status Z.235 weg; mapFallStatusToClaimStatus wird tot → entfernen; nested-Read :112 → op),
`close-nur-gutachter-termin.ts` (status Z.87 weg + Guard), `lifecycle-seed.ts` (status aus Insert),
`kanzlei-wunsch` (status-Writes aus Slice 1 raus — op trägt es), `lifecycle.ts`/`terminal-status.ts`
(claimStatus-Contract-Param droppen).

### Slice 5 — DROP, deploy-gated auf Slice 4
`DROP INDEX idx_claims_status_offen, idx_claims_status_dispatch` (Konsument repointet); `DROP COLUMN status`
(+ claims_status_check per Cascade); Types + flag-drift-Snapshot bereinigen.

## Koordination
Slices 3+4 fassen HOT Shared-Core an (v_claim_base, endzustand, state-machine) — bei vielen aktiven
Sessions einzeln + mit Markern fahren. Marker: [[handoff-status-achsen-b4-derived-first-session-end]].
