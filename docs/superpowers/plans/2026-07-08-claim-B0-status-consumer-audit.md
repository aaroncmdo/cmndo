# Sub-Projekt B0 — Status-Spalten Consumer-Audit (Findings)

**Datum:** 2026-07-08 · Read-only Audit. Grundlage für das B-Design (Status-Spalten-Konsolidierung).

## Verdikt: DEUTLICH weniger riskant als angenommen

Die 3 Spalten sind **NICHT 3 redundante Status-Felder**, sondern **zwei synchronisierte Phasen-Achsen + ein eigenständiges Dispatch-Flag**. Die Divergenz-Gefahr ist im Code bereits **bekannt und behandelt**.

## Die 3 Spalten

| Spalte | Rolle | Werte | Canonical Writer | Reader |
|---|---|---|---|---|
| **`operative_status`** | operativer Cursor (Phasen-Fortschritt) | 19 Werte (ersterfassung → abgeschlossen/storniert) | **`transitionFallStatus`** (`src/lib/faelle/state-machine.ts:210`) — mappt ATOMAR → `claims.status` (`:205-210` via `mapFallStatusToClaimStatus`) | `getClaimLifecycle` (furthest-wins), + ~40 Files (Anzeige/Filter/Health/Werkstatt/Kanzlei) |
| **`claims.status`** | terminale + rechtl. Phase | reguliert_vollstaendig/storniert/klage/verjaehrt/abgelehnt_final/an_externe_kanzlei + non-terminal in_kommunikation_vs/abgelehnt | `endzustand-actions` (Terminal-Setter) + state-machine (gemappt) | `getClaimLifecycle` (Terminal-Gate) + `v_claim_phase` |
| **`work_state`** | Dispatch/Processing-Achse (wer bearbeitet aktiv) | in_bearbeitung / dispatch_done / null | Dispatch-/Convert-Pfade (7 Files) | Guard in `endzustand-actions:158-162` (KB muss `in_bearbeitung` vor VS-Kontakt). **KEINE Phasen-Spalte.** |

## Kern-Erkenntnis: die zwei Phasen-Achsen sind SYNCHRONISIERT (by design)

- `transitionFallStatus` schreibt **beide** (`operative_status = newStatus` UND `claims.status = mapFallStatusToClaimStatus(newStatus)`) in EINEM Write.
- `endzustand-actions` hat eine explizite **„Abschluss-Konvergenz"** (`:105-118`): beim Setzen eines TERMINALEN Endzustands wird `operative_status` (+`abgeschlossen_am`) MITgeschrieben — der Kommentar dokumentiert exakt die Divergenz (v_claim_phase=abschluss vs subphase-resolver/aktive-Filter) und verhindert sie.
- ⇒ Die im Initial-Audit befürchtete „Drift zwischen den Achsen" ist **an den Haupt-Write-Punkten bereits geschlossen**.

## Writer-Inventar (operative_status-Assignments)

- ✅ `state-machine.ts:210` — Cursor-Senke (synct status).
- ✅ `endzustand-actions.ts:117` — Terminal-Konvergenz (synct operative_status).
- ⚠️ `gutachter/team/actions.ts:74` — direktes `operative_status: 'sv-zugewiesen'` (NICHT über die state-machine → **sync-verifizieren**: setzt es auch claims.status? falls nein, Kandidat für den Sync-Fix).
- ⚠️ `lexdrive/process-event.ts` (12 refs) + Webhook-Pfade (`vs_kuerzt`/`vs_abgelehnt`) — schreiben laut Kommentaren teils `status` direkt → **sync-verifizieren**.
- (Rest der 40 Files = Type-Defs / Test-Fixtures / Reader — keine Writer.)

## B — abgeleiteter (verkleinerter) Scope

1. **Writer-Sync verifizieren + härten:** die Edge-Writer (`gutachter/team`, lexdrive/webhooks, Creator-Pfade) prüfen — schreiben sie beide Achsen konsistent? Wo nicht: über `transitionFallStatus` routen ODER die Konvergenz nachziehen. (Kein Merge der Spalten — beide Achsen bleiben, aber garantiert synchron.)
2. **`work_state` klären:** eigenständige Dispatch-Achse — dokumentieren + ggf. sauberer modellieren (eigenes Enum/Guard), NICHT in die Phase falten. Prüfen ob die 7-File-Surface konsistent ist.
3. **Guard = A1-Parity-Test** (bereits gebaut): sichert `getClaimLifecycle ↔ v_claim_phase`. Ergänzend ggf. ein Test „operative_status-Terminal ⇒ claims.status-Terminal" (Konvergenz-Invariante).

## Offen (nächster B0-Schritt)
Edge-Writer im Detail lesen: `gutachter/team/actions.ts`, `lexdrive/process-event.ts`, die Webhook-Status-Schreiber, + die `work_state`-Setter (`convert-lead-to-claim.ts`, `kanzlei-wunsch/actions.ts`). Dann B-Plan schreiben.

## Koordination
Contested Core (`claims`-Status + `v_claim_*`). Aktive Sessions: 89f501f6 (v_claim_base-Revert), 6f60c510 (money-tables). B-Writes additiv + koordiniert.
