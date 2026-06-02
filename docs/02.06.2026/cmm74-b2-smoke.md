# CMM-74 b″ — Engine-Cursor-Re-Base + faelle.status-Write-Stopp — Smoke & Audit (02.06.2026)

## Ziel
`transitionFallStatus` hört auf, `faelle.status` zu schreiben (war der letzte Writer) →
Engine von der zu droppenden `faelle`-Spalte entkoppelt (CMM-49 Drop-Runway). Operativ-
Cursor lebt jetzt auf `claims.operative_status` (19-Wert-Vokabular, 1:1-Mirror).

## Befund-Korrektur gg. Handoff
Der EOD-Handoff nahm einen **5-Datei-Reader-Tail** an. Live-Audit ergab: **kein** status-
Sync-Trigger (nur `sv_id` wird faelle↔claims gesynct) **+ ~30 Dateien / 39 Call-Sites**
lesen/filtern `faelle.status` **+ 3 Views** exponieren `f.status`. Ohne vollständigen
Repoint hätte A3 (Write-Stopp) dutzende Reader auf eingefrorene Werte gefroren. Daher
vollständiger Sweep statt 5 Dateien.

## Was gebaut wurde (Branch `kitta/cmm-74-b2-engine-variant-a`)
| Commit | Inhalt |
|---|---|
| `63febfa50` (A1, vorh.) | Cursor read/write `claims.operative_status` (Dual-Write zu faelle.status) |
| `546ac3d22` (A2) | 26 Code-Reader auf `operative_status` repointet (SELECT-Embed+Fallback / FILTER Zwei-Schritt) |
| `fa7cdd8a6` (Views) | 3 Views (`v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`) → `COALESCE(c.operative_status::fall_status, f.status)`. Mig `20260602115133` |
| `1ae47265e` (A3) | `status: newStatus` aus dem Engine-`update` entfernt → faelle.status-Write gestoppt |

## Verifikation

### 1. Statisch
- `npx tsc --noEmit` **grün** (voller next build OOMt im Worktree → tsc-Gate per Konvention).
- `status` ∉ `CLAIM_OWNED_DUPLICATE_COLUMNS` verifiziert → Entfernen aus `update` stoppt den
  faelle.status-Write; `updated_at` bleibt in `faelleUpdate` (nie leeres Update);
  `claims.status` (b′-Mapping) + `status_changed_at` (claims-routed) + `operative_status` bleiben.
- Side-Effects keyen alle auf `newStatus` (nicht den Cursor) → unverändert: SLA (AAR-85/431),
  Billing (AAR-924/926), Notifications (AAR-501), LexDrive-Email (AAR-77), Auto-Task (AAR-313).

### 2. Live-DB (Projekt paizkjajbuxxksdoycev, geteilte prod+staging)
- `claims.operative_status` == `faelle.status`: **0 Mismatch** über alle 75 Fälle.
- 3 Views nach Repoint: je 75 Zeilen, `status` == `operative_status` **0 Mismatch**.
- `::fall_status`-Cast sicher: alle `operative_status`-Werte sind gültige Enum-Labels (0 invalid).
- View-Repoint server-seitig aus Live-Def generiert (kein Transkriptions-Risiko) + pro View geguardet.

### 3. Engine-Smoke (echte `transitionFallStatus` gegen Staging, seed→assert→cleanup)
Throwaway-Vitest (`_b2-smoke.test.ts`, nicht committet): seed claim+fall
(`operative_status='ersterfassung'`, `faelle.status='ersterfassung'`) → `transitionFallStatus(fall, 'sv-gesucht')`.
- ✅ `claims.operative_status` → `'sv-gesucht'` (Cursor bewegt sich)
- ✅ `faelle.status` bleibt `'ersterfassung'` (**EINGEFROREN** — A3 wirkt)
- ✅ `claims.status` unverändert (operativer Dispatch-State ohne Lifecycle-Mapping — korrekt)
- ✅ Cleanup via `delete_fall_komplett` erfolgreich (kein Orphan)
- Hinweis: `[emit] worker-trigger ECONNREFUSED` im Testlauf = Notification-Worker (Port 4001)
  läuft im Test nicht → caught, Cron-Fallback (non-fatal, kein A3-Concern).
- **Vitest: 1 passed.**

## Koordination
- `state-machine.ts` = Prod-Breaker-Single-Toucher. 939-Lanes **0 Commits** an der Datei,
  keine aktive Session fasst sie an. Heads-up via Aaron freigegeben vor dem A3-Commit.
- Geteilte Views: andere Sessions, die diese 3 Views `CREATE OR REPLACE`n, müssen den
  `operative_status`-Repoint erhalten.

## Caveat
Claim-lose Legacy-Faelle (aktuell **0**) bekommen kein `faelle.status` mehr (pre-claims-Ära,
akzeptiert). Der COALESCE-View-Fallback (`… , f.status`) deckt sie defensiv ab.

## Danach entsperrt (CMM-49)
Mit gestopptem faelle.status-Write + repointeten Readern/Views liest **nichts** mehr lebendig
aus `faelle.status`. Der status-Reader-Tail des CMM-49-Masters ist erledigt — ein Schritt
näher am `DROP TABLE faelle` (verbleibt: 45 FKs `fall_id`→`claim_id` migrieren + RLS).

## Nicht im Scope
- `v_claim_full.fall_status` (nur Kommentar-Referenzen, 0 Runtime-Consumer) — unverändert.
- `v_claim_listing.status` nutzt `claims.status` (kein f.status) — unverändert.
- Portal-UI-Screenshot-Smoke (Admin/SV/Kunde/Kanzlei) → post-merge auf deploytem Staging.
- TS-Typen-Regen für `operative_status` aufgeschoben (Cast-Pfad wie A1); 1 typed-Client-Consumer
  (`get-kunde-faelle.ts`) via `unknown`-Bridge gecastet.
