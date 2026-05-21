# Handoff — CMM-44 SP-D Abschluss (2026-05-21)

**Sub-Projekt:** SP-D — 25 termin-bezogene `faelle`-Spalten → `gutachter_termine` (1:N, aktuellster Termin).
**Master:** CMM-44 (`faelle`-Drop). **Vorgaenger:** SP-G2 (claim_id). **Status:** Code + Migrationen live auf staging; **nur PR3 (gated) + dieser Finish-PR offen.**

## 1 · Was erledigt wurde
| PR | Inhalt | Stand |
|---|---|---|
| **#1526** | PR1 — 23 ADD COLUMN + Backfill auf aktuellsten Termin (start_zeit DESC) | gemergt staging |
| **#1528** | View-Repoint — 4 Views (v_faelle_mit_aktuellem_termin extend + faelle_kunde_view/faelle_sv_view/v_claim_full add current-termin-LATERAL); Block-0 ALTER 3 gt-Numerics auf faelle-Precision | gemergt staging |
| **#1529** | PR2 Code-Sweep — 56 Sites: Reads (37 A + 7 B) + Writes (12 C) faelle→gutachter_termine aktueller Termin | gemergt staging |
| **(dieser)** | Smoke-Protokoll + Handoff + Phase-1-Mapping | offen |

**2 DUP-Spalten** (`geschaetzte_fahrzeit_min`→`geschaetzte_fahrtzeit_min`, `gcal_event_id`→`google_event_id`): 0 Call-Sites, via View-Repoint abgedeckt.

## 2 · Verifikation
- `tsc --noEmit` clean (PR2a + PR2b). Spot-Checks aller heiklen Transforms (Batch-Routing findBestSV/reachability/sv-reminder, besichtigungsort-gt-else-faelle-Fallback, Crons→gt, nachbesichtigung/page-Filter-Restruktur) korrekt.
- View-Repoint live verifiziert: 4 Views sourcen gt; Output-Spalten byte-identisch (Precision via Block-0-ALTER erhalten).
- Portal-Smoke (`docs/21.05.2026/cmm44-spd-smoke.md`): 5 OK / 1 pre-existing React-#418 (Fallakte rendert voll, nicht SP-D-verursacht).

## 3 · Lessons (SP-D-spezifisch)
1. **besichtigungsort ist claim-level, nicht per-Termin** — wird vom Dispatch pre-/around-Termin gelesen + ist auf `leads`. Entscheidung (Aaron): trotzdem → gutachter_termine, aber **Reads null-safe + leads-Fallback erhalten**, und **Write = gt-wenn-Termin-sonst-faelle-Fallback** (kein Datenverlust). Sauberer waere claim-level gewesen; pre-launch tragbar.
2. **PR1 ADD verlor Precision** (plain `numeric` statt faelle-`numeric(10,7)`/`(6,1)`) → View-Repoint Block-0-ALTER musste die gt-Spalten-Typen angleichen (sonst 42P16). **Lehre:** beim ADD-COLUMN nicht nur `udt_name`, sondern `numeric_precision/scale` der Quelle messen.
3. **Termin-Selektions-Mismatch:** v_faelle nutzt Status-Prioritaets-LATERAL, Backfill + andere Views nutzen start_zeit-DESC → bei Multi-Termin-Claims koennen SP-D-Cols divergieren. Pre-launch ~1 Claim, vernachlaessigbar; bei N>1-Termin-Claims revisiten.
4. **Subagent-Fehler-Handling:** Ein View-Migration-Subagent brach per Socket-Error ab (uncommitted + dry-run-failing); ein Sweep-Subagent lief 35min/217-Tools + confabulierte „prior sessions". **Lehre:** Subagent-Output immer empirisch pruefen (git status/untracked, grep, tsc, Spot-Checks) — nie dem Report trauen. Der paren-balanced grep ueberzaehlt (False Positives: Spaltenname im NEUEN gt-Query nahe der bereinigten faelle-Query) — nicht als „remaining" missinterpretieren; praezise via faelle-`.select/.update`-Payload pruefen.

## 4 · Offen
- **PR3 (COALESCE-Catch-up):** gated auf #1529-**main**-Release (erst wenn prod den neuen Writer-Code laeuft). Idempotenter `UPDATE gutachter_termine SET <col>=COALESCE(gt.<col>, f.<col>) … aktueller Termin`. Pre-launch wenig betroffen; faengt faelle-Writes aus dem Deploy-Fenster.
- **Stale-Fenster:** durch PR2b (Crons + Writes → gt) geschlossen, sobald #1529 prod-live ist.

## 5 · Naechster CMM-44-Schritt
SP-D entsperrt nichts Weiteres direkt. Verbleibende Strecke (Phase-1 §4): SP-C (Parteien), SP-E (Fahrzeug), SP-F (Vorschaeden), SP-I (Kanzleifall-LC), SP-J (Abrechnung), SP-K/L. Dann Phase 6 (`DROP TABLE faelle`).
