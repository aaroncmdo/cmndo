# CMM-49 — faelle-Retirement (Endspiel) — sequenzierter Plan + Fortschritt

Stand 2026-06-04, nach Entity-Foundation (PR #2395 + #2402). Ziel: **`DROP TABLE faelle`** sauber + deploy-safe.
Branch: `kitta/cmm49-faelle-retirement`.

## Fortschritt
- ✅ **P0 Foundation** — `faelle_claim_bridge.fall_created_at` (Mig 123100, 77/77 backfilled) + `operative_status`-Gap-Backfill (Mig 123116, Gap=0)
- ✅ **P1a v_claim_full faelle-frei** (Mig 123438) — 8 Reads repointed + Join→bridge; **0 diff** (fall_status/fall_created_at/fall_id vs faelle), security_invoker unverändert
- ⬜ **P1b** restliche 3 faelle-Views: `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view`
- ⬜ **P2** Code-4a (~165 `from('faelle')`)
- ⬜ **P3** WRITER-Sites · **P4** Funktionen/Trigger · **P5** DROP + Smoke

## IST-Inventar (live verifiziert)
**4 Views auf faelle:** `v_claim_full` ✅faelle-frei · `v_faelle_mit_aktuellem_termin` (CMM-50) · `faelle_kunde_view`/`faelle_sv_view` (Legacy-Kompat, 03.06.-Inzident).
**Code:** ~165 `from('faelle')` — Buckets: PURE_BRIDGE(→resolveClaimId), KUNDE_ID(→geschaedigter), WRITER, EMBED, ANCHOR, KEY_OTHER, EXISTENCE, OTHER.
**~27 Funktionen/Trigger:** faelle↔claims-Sync (`sync_faelle_claim_bridge`, `trg_fn_fill_claim_id_from_fall`, `kanzlei_faelle_sync_claim_fall`, `sync_claims_sv_id_to_faelle`, `link_lead_data_to_fall`) + `can_access_fall` + Crons (`cron_konsistenz_check`, `cron_vs_frist_reminder`, `cron_kanzlei_paket_pending_check`) + `delete_fall_komplett` + DSGVO + Benachrichtigungs-Trigger.

## Verifizierte Repoint-Fakten (value-preserving)
- `faelle.kunde_id` == `claims.geschaedigter_user_id` (0 diff)
- `faelle.id` == `faelle_claim_bridge.fall_id` (0 diff)
- `faelle.status` == `claims.operative_status` (1:1, CMM-74; Gap gebackfillt → 0)
- `faelle.created_at` ≠ `claims.created_at` (75-Zeilen-Skew → in bridge.fall_created_at konserviert)
- `gegner_anzahl_beteiligte`=Legacy-1, `gegner_fahrzeugtyp`/`organisation_id`/`dispatch_id`=leer → null (kein v_claim_full-Consumer)

## Phasen (jede = eigener PR, verifiziert, deploy-safe "Code/View vor Drop")
### P1b — restliche Views
`v_faelle_mit_aktuellem_termin` claim-basiert (CMM-50 hat vehicles schon); `faelle_kunde/sv_view` Consumer **ungekappt** prüfen (`.from()`+pg_depend, kein Trunc-Grep — Inzident 03.06.) → repoint claims-basiert ODER nach Consumer-Migration droppen.
### P2 — Code-4a nach Bucket
KUNDE_ID→geschaedigter, PURE_BRIDGE→resolveClaimId, dann EXISTENCE/KEY_OTHER/ANCHOR/EMBED/OTHER. **flow/termine zuletzt** (aar-956-Revier).
### P3 — WRITER-Sites
Pro Writer: vom Sync-Trigger eh nach claims gespiegelt? → Write streichen, sonst auf claims umlenken.
### P4 — Funktionen/Trigger
Sync-Maschinerie droppen sobald nichts mehr faelle schreibt/liest; `can_access_fall`→`can_access_claim`; Crons/DSGVO/`delete_fall_komplett` auf claims/bridge.
### P5 — DROP TABLE faelle + Smoke
Erst wenn P1–P4 auf **prod**. Volle Portal-Smoke (Public/Admin/Kunde/SV/Dispatch/Kanzlei) + Screenshots VOR Drop-Merge. `faelle_claim_bridge` bleibt (Route-Key-Entkopplung).

## Harte Regeln
- Consumer ungekappt prüfen (`.from('<obj>')` + `pg_depend`), NIE Trunc-Grep (Inzident 03.06. #2343).
- DDL via Plugin `apply_migration` (Regel 2), File == getrackte Version.
- Nach Korrektur-Push prüfen ob PR schon gemergt (Twin-Drift-Lehre 04.06.).
- Deploy-safe: Code/View-Repoint erreicht prod VOR dem zugehörigen Drop ("b dann a").
- Value-preserving: jeder Repoint vorher mit Live-Diff-Query verifiziert.
