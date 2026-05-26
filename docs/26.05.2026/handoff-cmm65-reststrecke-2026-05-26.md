# CMM-65 / Claims-as-SSoT — Reststrecke-Handoff (2026-05-26)

**Für die nächste Session.** Einstiegspunkt für die Fortsetzung der Claim-as-SSoT-Migration (CMM-44) nach dem Writer-Sweep.
**Kanonischer Live-Status:** Memory `project_cmm65_timestamp_sweep.md`. **Detail-Report dieser Session:** `docs/26.05.2026/handoff-cmm65-writersweep-realtime-2026-05-26.md` (in PR #1741).

---

## TL;DR — was gerade gemerged wurde

**PR #1741 → staging (squash-merged 2026-05-26 08:03).** Der `faelle.updated_at`-**Writer-Sweep** ist fertig + die `faelle`-Realtime-Subscription ist auf `claims` umgestellt (Aaron-Entscheidung „Voll inkl. Subscription"). **Kein DDL** — claims war schon in `supabase_realtime` mit `REPLICA IDENTITY FULL`. tsc + voller build grün.

Damit ist **Part A (Reads + Writers, behavior-preserving, kein DDL) KOMPLETT.** Offen sind nur noch die DDL-Risikoklasse (Part B) + die View-Repoints (CMM-66).

| Phase | Stand |
|---|---|
| Reads (`faelle.created_at`) → claims | ✅ 6 PRs (Session 1-4) |
| Writers (`faelle.updated_at`) → claims | ✅ PR #1741 (16 Sites: 5 DROP, 11 MOVE) |
| Realtime-Subscription faelle → claims | ✅ PR #1741 (FallRealtimeRefresh + Feldmodus) |
| **CMM-66** View-Repoints | ⬜ offen (siehe §2) |
| **Part B** Finanz-ADDs (DDL) | ⬜ offen (siehe §3) |
| **CMM-61** kanzlei_faelle provision/Vollmacht | ⬜ offen |
| **Phase 6** `DROP TABLE faelle CASCADE` (CMM-49/SP-L) | ⬜ blockiert bis Part B + CMM-66 |

---

## 0 · ⚠️ ZUERST: Browser-Realtime-Smoke auf staging (offener Verify-Punkt aus PR #1741)

Der einzige nicht-empirisch-auf-Browser-Ebene bestätigte Teil: liefert die neue **claims**-Realtime-Subscription den Live-Refresh auf allen 3 Fall-Portalen?

**DB-Ebene ist live verifiziert** (claims publiziert + `REPLICA IDENTITY FULL`; 54/55 Kunde-Fälle treffen die simple `claims.geschaedigter_user_id = auth.uid()`-Policy, Rest via `claim_parties`). **Browser-Ebene noch offen.**

**Smoke (vor dem nächsten staging→main-Release):**
1. Fall-Seite öffnen (je **Kunde** `/kunde/faelle/[id]`, SV `/gutachter/fall/[id]`, Admin `/faelle/[id]`).
2. In einer 2. Session/Tab ein Termin-Event auf denselben Fall auslösen (`terminAnnehmen` / `terminBuchen` / Verlegung) → schreibt jetzt `claims.updated_at`.
3. Erwartung: die offene Seite refresht **ohne** manuellen Reload (debounced ~500ms).
4. **Kunde ist der kritische Fall** (sein einziger Termin-Refresh-Leg war vorher `faelle`).

**Bei Fehlschlag (Fallback, leicht):** in `components/fall/FallRealtimeRefresh.tsx` den `claims`-Leg wieder als `faelle`-Leg führen **und** in `lib/claims/touch-recency.ts` zusätzlich `faelle.update({updated_at})` schreiben (Dual-Write). Das war Option A aus der ursprünglichen Entscheidung.

---

## 1 · Was die nächste Session über den Code-Stand wissen muss

- **Live-Trigger-Realität (vor jeder weiteren Annahme erneut prüfen — Snapshots veralten):** der alte 40-Spalten `trg_sync_faelle_to_claims` ist **WEG**. Live nur noch: `trg_claims_updated_at` (BEFORE UPDATE all-cols), `update_faelle_updated_at` (BEFORE UPDATE all-cols → expliziter `updated_at`-Payload IMMER redundant), `trg_sync_faelle_sv_id_to_claims` (AFTER UPDATE OF sv_id, nur bei DISTINCT), `trg_sync_claims_sv_id_to_faelle` (Rückrichtung). **Kein allgemeiner faelle→claims-Datensync mehr.**
- **Recency-Helper:** `lib/claims/touch-recency.ts` (`touchClaimRecency(client, claimId)` / `touchClaimRecencyByFall(client, fallId)`) — non-critical, bumpt `claims.updated_at`. Für neue „Fall touchen"-Bedarfe diesen Helper nutzen, **nicht** `faelle.update({updated_at})`.
- **Realtime liegt jetzt auf claims:** `FallRealtimeRefresh` hat einen `claimId`-Prop; Caller übergeben `fall.claim_id` (bzw. `claimId`-Prop in FallakteShell). Feldmodus `SvFallakteView` analog (claim_id im `FeldmodusFallakteFall`-Payload).

---

## 2 · CMM-66 — View-Repoints (DDL, nur via supabase-CLI; `information_schema` live davor)

Diese Views exponieren noch `faelle.updated_at`/`.created_at` und sind die letzten Reader-Kopplungen:

| View | Spalte | Konsument | Quelle heute |
|---|---|---|---|
| `v_claim_full` | `fall_updated_at` | `pflichtdokumente-reminder`-Cron (Idle-Gating `< 24h`) | `f.updated_at` |
| `v_faelle_mit_aktuellem_termin` | `updated_at` | makler-Akten-Order (`lib/makler/queries.ts`) | `f.updated_at` |
| `v_faelle_mit_aktuellem_termin` | `created_at` | mehrere created_at-Reads (z.B. `kunde/onboarding/page`, `reissue-abrechnung`, `cron/abrechnung-erstellen`) | (siehe alter Handoff #1727 §3) |
| `v_claim_listing` | `updated_at` | claim-Listing-Order | **bereits `c.` (claims)** — kein Repoint nötig |

**⚠️ CAVEAT (Pflichtlektüre vor dem Repoint):** `claims.updated_at` ist während der laufenden SP-Migration **backfill-geclobbert** (live aktuell ~1 distinct value, weil jede SP-Backfill-`UPDATE` es via moddatetime neu setzt). Ein **naiver** Repoint `fall_updated_at → claims.updated_at` tauscht „faelle-stale für moved-writer" gegen „claims-clobbered für alle" (→ Reminder feuert nie / Order kollabiert). **Optionen:**
1. `GREATEST(f.updated_at, c.updated_at)` als Interim (fängt beide, clobber bleibt aber bei echten Backfills).
2. **Besser:** dedizierter, backfill-resistenter Aktivitäts-Timestamp (eigenes Ticket) — z.B. `claims.last_activity_at`, nur von echten User-Aktionen gebumpt, nicht von Schema-Backfills. Das ist die saubere Lösung und sollte vor Phase-6 entschieden werden.

Bis CMM-66: der Reminder sieht die moved-writer-Events (Termin/Briefing/Doc/Mandat/WA) nicht mehr im Idle-Gating → ggf. minimal verfrühte Doc-Reminder (deduped + phase-gated, daher tolerierbar als Übergang).

---

## 3 · Part B (DDL) + CMM-61

- **Part B** (claims-Finanz-ADDs, via supabase-CLI-Migration): `claims` ADD `marketing_provision` + `marketing_quelle` (+ Backfill aus leads/faelle) + `zahlungsweg` (all-null) + die zugehörigen Top-Level-Finanz-Reads auf claims umstellen.
- **CMM-61:** `kanzlei_faelle` provision/honorar + Vollmacht-Übergabe.
- Danach ist **Phase 6** (`DROP TABLE faelle CASCADE`, CMM-49/SP-L) entsperrt — Post-Drop-Smoke aller Portale Pflicht.

---

## 4 · Verify-Rezept (state empirisch re-checken)

Pool-Timeouts sind transient (Parallel-Sessions). Supabase-MCP `execute_sql` funktioniert für Introspektion; `curl -4` + service-role für Daten-Probes (node fetch/undici hängt). Nützliche Queries:
- **Trigger live:** `pg_get_triggerdef` für `faelle`/`claims` (Klassifizierung DROP/MOVE hängt daran).
- **Realtime-Infra:** `pg_publication_tables WHERE pubname='supabase_realtime'` + `relreplident` (`f` = FULL).
- **View-Quelle:** `regexp_match(pg_get_viewdef('public.<view>'::regclass), '([a-z_]+)\.updated_at')` → Alias (`f`=faelle, `c`=claims).
- **RLS-Realtime-Tauglichkeit Kunde:** Anteil Fälle mit `claims.geschaedigter_user_id = faelle.kunde_id` (simple-equality-Policy = realtime-erprobt).

---

## 5 · Env / Konventionen
- **Worktree** pro Slice off `origin/staging` (`node scripts/new-session-worktree.mjs <slug> staging`); node_modules-Junction → main, `.env.local` kopieren.
- **Build:** `NODE_OPTIONS=--max-old-space-size=8192 npm run build`, `rm -rf .next` davor, **Build-Exit in Logfile schreiben + `BUILD_EXIT=`-Zeile prüfen** (Task-Notification zeigt den maskierten echo-Exit). `/gutachter-partner`-SSG kann bei gesättigtem Pool flaken → CI-`build` ist das Gate.
- **Merge:** NICHT die Merge-Session — PR `--base staging`; `sync-watcher` merged non-draft staging-PRs bei grünem build. Squash → `merge-base --is-ancestor` ist nach Merge `false` (Content trotzdem auf staging; immer File-Inhalt prüfen, nicht nur PR-Status).
- **Projekt-ID Supabase:** `paizkjajbuxxksdoycev` (Claimondo-v2, ACTIVE_HEALTHY).
