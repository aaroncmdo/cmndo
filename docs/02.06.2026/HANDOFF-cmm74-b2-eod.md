# HANDOFF — CMM-74 b″ (Engine-Cursor-Re-Base) — Session-EOD 02.06.2026

> **Für die nächste Session.** Resume-Punkt = **Variante A, Schritt A2** (Reader-Tail-Repoint), dann **A3** (faelle.status-Write-Stopp), dann Smoke. Alles davor ist gebaut, verifiziert + gepusht. Diese Datei + die zwei Plan-Docs reichen zum nahtlosen Weitermachen — nichts muss neu hergeleitet werden.

## 0. Branch / PR / DB — was wo liegt

| Artefakt | Stand |
|---|---|
| **PR #2233** (`kitta/cmm-74-b2-prereq-and-cutover`) | **b″-Prereq**: `v_claim_phase +5 sub_phase` (Mig `20260602083708`) + b″-Execution-Plan. OFFEN, mergeable, verifiziert. |
| **Branch `kitta/cmm-74-b2-engine-variant-a`** (kein PR yet) | descends von #2233. Enthält zusätzlich: **A1** (`63febfa50`), **Variante-B-Plan** (`2e240b178`). **HIER weitermachen.** |
| DB `v_claim_phase` | +5 operative sub_phase **live** (Mig `20260602083708`), non-regressiv (Checksum 76/76) + 5 synthetisch grün. |
| DB `claims.operative_status` | **live** (Mig `20260602091849`), additiv + backfilled, **0 mismatch** vs faelle.status. |

**Worktree:** `.claude/worktrees/cmm-74-b2-prereq-and-cutover` (auf Branch `kitta/cmm-74-b2-engine-variant-a`; hat `node_modules` via npm ci — tsc läuft).

**Pläne (engine-grounded, no-placeholder):**
- Variante A (der Weg, den wir gehen): `docs/superpowers/plans/2026-06-02-cmm74-b2-engine-cursor-rebase.md`
- Variante B (North-Star, separate Session): `docs/superpowers/plans/2026-06-02-cmm74-b2-variante-b-derive-cursor.md`

## 1. Entscheidung (Aaron, 02.06.)
**Variante A** = privater Engine-Cursor von `faelle.status` → `claims.operative_status` verlegen (19-Wert-Vokabular, Graph + Side-Effects bleiben 1:1). Minimal-Risk, entsperrt den faelle-Drop. Variante B (derive aus v_claim_phase + Validierungs-Verschlankung) = separate Session per eigenem Plan.

## 2. ✅ GEBAUT + VERIFIZIERT (A1)
`src/lib/faelle/state-machine.ts` (commit `63febfa50`):
- Cursor-**Read**: `currentStatus = claims.operative_status ?? faelle.status` (Select erweitert um `claims:claim_id(status, operative_status)`, via Cast — wie der bestehende claims-Select-Cast).
- Cursor-**Write**: `claimsUpdate.operative_status = newStatus` (dual zu faelle.status).
- `faelle.status`-Write **bleibt** (Z. `update.status = newStatus`) → **behavior-neutral**, Reader-Tail unberührt.
- **Verifiziert:** tsc --noEmit grün · Backfill 0-mismatch · Read-Path-Shape live geprüft (`operative_status == faelle.status`, cursor_consistent=true) · non-regressiv.

## 3. ▶️ RESUME HIER — A2 (Reader-Tail + Writer repointen) — VOR A3!

> **Korrektheits-Reihenfolge:** A2 MUSS vor A3. Stoppt man den faelle.status-Write (A3) bevor die Reader auf operative_status zeigen, frieren sie auf stale Werten ein.

**A2a — Reader-Tail** (lesen noch `faelle.status` → auf `claims.operative_status` umstellen):
- `src/app/api/cron/case-billing-batch/route.ts` (`.select('id, status')` Billing-Filter)
- `src/app/api/cron/release-makler-provisionen/route.ts` (status-Gate)
- `src/app/api/email/send/route.ts` (status im Select)
- `src/app/api/gutachter/search/route.ts` (status in 3 Queries)
- `src/lib/sla/completion-signals.ts` (prüft status gegen `vs-kuerzt`/`anschlussschreiben` — die Werte sind 1:1 in operative_status)

**A2b — Direkte Status-Writer** (schreiben `faelle.status` direkt, NICHT über die Engine → müssen `claims.operative_status` mit-schreiben, sonst Cursor-Drift):
- `src/lib/lexdrive/process-event.ts` (LexDrive-Webhook: schreibt z.B. `vs-kuerzt`/`vs-abgelehnt`)
- `src/lib/actions/dispatch-fall-actions.ts`
- Verifikations-Grep: `grep -rn "\.from('faelle')" src | grep -i update` + `grep -rn "status:.*'vs-kuerzt'\|status:.*'vs-abgelehnt'" src`

**A2-Pattern:** wo `faelle.status` gelesen wird → `claims.operative_status` lesen (gleiche Werte). Wo `faelle.status` direkt geschrieben wird → zusätzlich `claims.operative_status` setzen (via claim_id).

## 4. A3 — faelle.status-Write-Stopp (der eigentliche b″-Goal)

In `state-machine.ts`, im `update`-Objekt-Init: die Zeile **`status: newStatus,`** entfernen.
- Effekt: `status` landet nicht mehr in `faelleUpdate` (via `splitOrKeepFaelleUpdate`) → faelle.status wird nicht mehr geschrieben.
- `operative_status` (A1) + `claims.status` (b′-Mapping) bleiben — der Cursor + Lifecycle laufen weiter.
- Timestamps (`status_changed_at` etc.) bleiben unberührt (separat gesetzt, claims-routed).
- **Caveat:** Legacy claim-lose faelle (Alt-Daten, 0 in den aktuellen 75/76) bekommen dann kein faelle.status mehr — akzeptiert (pre-claims-Ära).

## 5. Smoke (PFLICHT vor PR-Merge) — A-Plan §5
Node-Probe gegen **staging** (seed→`transitionFallStatus`→assert→`delete_fall_komplett`-cleanup): jeder Hauptpfad-Übergang; nach jedem `claims.operative_status` korrekt + `faelle.status` eingefroren; Kürzungs-SLA (`→vs-kuerzt` startet `kanzlei_kuerzung_antwort`); Notification (`fall.status_changed`); Billing (`→gutachten-eingegangen`); Portale (Admin/SV/Kunde/Kanzlei Screenshot).

## 6. Koordination (PFLICHT)
- **939-Single-Toucher** (`state-machine.ts`): Re-Check `git rev-list --count origin/staging..origin/<939-branch> -- src/lib/faelle/state-machine.ts` (war 02.06. = 0) **+ SendMessage an die 939-Lane über Aaron VOR dem A3-Commit.** (A1 ist additiv/behavior-neutral committed; A3 ist der verhaltensändernde Flip.)
- `claims.operative_status` / `v_claim_phase` = geteilte Flächen; additive Migrationen via Plugin (Regel 2), EXCEPT-0/Parity-grün halten.

## 7. PR-Strategie
Wenn A2+A3+Smoke grün: **Variante A als 1 PR** (`kitta/cmm-74-b2-engine-variant-a`). Base = `staging` NACH #2233-Merge (sonst stacked auf #2233, damit der Diff sauber ist). 7-Punkte-Audit + Smoke-Doc `docs/02.06.2026/cmm74-b2-smoke.md`.

## 8. Danach entsperrt
Mit gestopptem faelle.status-Write sind die status-Reader-Tail-Items des CMM-49-Masters erledigt → ein Schritt näher am `DROP TABLE faelle`. Variante B (operative_status retiren + derive) = North-Star-Folge, eigener Plan (§0-Branch).

## 9. Lektionen dieser Session
- **A2-vor-A3-Reihenfolge** (Reader-Repoint vor Write-Stopp) — sonst stale-Reader-Regression. (War im ersten A-Plan-Entwurf ein Gap, hier korrigiert.)
- **Shared-View-Mutation sicher:** per-claim md5-Checksum-Snapshot vor/nach (Non-Regression über alle Live-Rows) + synthetische `BEGIN…ROLLBACK`-Tests pro neuem Zweig (null Persistenz auf der geteilten prod+staging-DB). Muster aus dem PC-4-Smoke.
- **Worktree-Build-Gate:** frischer Worktree hat kein `node_modules` → `npm ci` im Worktree (nicht Junction) vor tsc.
- **Nested-Select-Cast:** `claims:claim_id(status, operative_status)` via Hand-Cast getypt (types-regen aufgeschoben, Regel 2 — Cast-Pfad, tsc grün).
