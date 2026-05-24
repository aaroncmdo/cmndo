# CMM-44 Handoff — Reststrecke faelle→claims-Vollmigration bis Phase 6

**Stand:** 2026-05-24 · **Master:** CMM-44 · **Für:** die nächste Session, die ein CMM-44-Sub-Ticket übernimmt.

---

## 0 · TL;DR (das Wichtigste in 6 Sätzen)

1. **Endzustand:** `claims` = voller SSoT, **`faelle` wird KOMPLETT gedroppt** (`DROP TABLE faelle CASCADE`, SP-L) — NICHT „faelle bleibt operativ" (das war der überholte `claim-as-ssot-umbau.md`).
2. **Maßgeblicher Plan:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` (Phase 0–6). Bei Widerspruch gilt IMMER dieses Doc, nicht ein Linear-Ticket.
3. **Verlässliche Worklist:** `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` (~338 genuine Breaker). **NICHT** das erste Inventar `…reader-sweep-inventory.md` (~18 % False Positives — Embeds/Views/Helper als Breaker fehl-geflaggt).
4. **Stand:** Phase 0 ✅ · Phase 1 fast ✅ (nur Cardentity-Audit offen) · Phase 2 ✅ · Phase 3 teilweise · **Phase 4 = Hauptarbeit** · Phase 5/6 offen.
5. **Linear:** Master CMM-44 + Sub-Tickets **CMM-61..66** (plan-getreu, dependency-verlinkt, SP-L hart geblockt). Nimm eines davon.
6. **Größtes echtes Stück als Nächstes:** SP-C `kunde_id` (CMM-63).

---

## 1 · Doku — Lese-Reihenfolge

1. `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` — **der Master-Plan** (Ziel-Architektur §1, Phasen §4).
2. `docs/24.05.2026/cmm44-phase6-breaker-inventory-VALIDATED.md` — **die Worklist** (genuine Breaker nach Bucket).
3. `docs/23.05.2026/cmm44-phase6-plan-revalidierung.md` — der 3-Dimensionen-Revalidierungs-Report (was geprüft/offen, Schema-DB-Befunde).
4. `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` — 341-Spalten-Mapping + SP-A..L-Ausführungs-Reihenfolge.
5. Memory: `project_cmm_phase_24_finishing`, `project_cmm44_faelle_dekomposition`, `project_cmm44_spi_roadmap`.

---

## 2 · Verlässliche Worklist (de-noised) → Tickets

| Cluster | Genuine | Ticket | Prio | Hinweis |
|---|---:|---|---|---|
| `kunde_id` `.eq`-Ownership + Parteien | **~60+** | **CMM-63** (SP-C) | High | größter + höchstes Risiko (Zugriffskontrolle) |
| Timestamps `created_at`/`updated_at` + Operativ/Finanz-Rest | ~91 | **CMM-65** | High | honorar/provision/zahlungsweg faelle-native → claims |
| `vehicles` fahrzeug_* | 55 | **CMM-50** (SP-E) | High | via `vehicle_id` (oft nicht gesetzt), NICHT claims |
| Vorschäden/Cardentity | ~9 | **CMM-64** | Medium | blockedBy CMM-62 (Heimat-Entscheidung) |
| Cardentity-Audit (Phase-1-Rest) | — | **CMM-62** | Medium | gated Vorschäden-Heimat |
| faelle-basierte **Views** | 6 | **CMM-66** | High | Teil 1 (mandatsnummer) done; Teil 2 = Re-Base offen |
| `kanzlei_faelle`-Rest | **7** | **CMM-61** | Medium | u.a. `search:28` .or mandatsnummer; Writer alle schon fix |
| claims-Business / gutachten / gt / dyn-Writes / SOFT | ~21/2/5/5/4 | verstreut | — | im VALIDATED-Doc gelistet |
| **SP-L: DROP TABLE faelle CASCADE** | — | **CMM-49** | final | blockedBy CMM-61/63/65/50/64/66 |

---

## 3 · BEREITS ERLEDIGT — nicht nochmal anfassen

- **SP-A/A2/A3, SP-B, SP-D, SP-G/G2, SP-H, SP-I1–6, SP-J:** Schema + Backfill + Reader/Writer-Sweeps durch (auf staging). faelle 341→278 Spalten gedroppt, Backfills sauber (gap=0), kein Twin-Drift, kein realer Prod-Datenverlust.
- **kanzlei_faelle-Writer ALLE** via `upsertKanzleiFall` geroutet (kanzlei-paket/vs-timer/prozess/push-mandat/dokumente/filmcheck) — verifiziert. Die „Datenverlust-Writer-Urgenz" des ersten Inventars war ein Fehlalarm.
- **Phase 0** (CMM-53/54 Prod-Bugs) done. **Phase 2** (gutachter_termine.claim_id) done.
- **CMM-66 Teil 1:** `v_claim_full.mandatsnummer` → kf (PR #1638, Migration 20260524064500, verifiziert mismatch=0).

---

## 4 · Empfohlene Reihenfolge (Reststrecke)

1. **CMM-63 SP-C `kunde_id`** — `.eq('kunde_id', user.id)` portalweit (~60) → `claims.geschaedigter_user_id`. Zentral: `lib/claims/kunde-ownership.ts` + `app/kunde/layout.tsx`. **RLS/Ownership-Implikationen — vorsichtig + Portal-Smoke pro Rolle.** + Parteien (gegner→verursacher, halter).
2. **CMM-50 SP-E vehicles** — fahrzeug_* → `vehicles` via `vehicle_id` (zuerst vehicle_id zuverlässig setzen + backfillen).
3. **CMM-65** — Timestamps + honorar/provision/zahlungsweg → claims (information_schema prüfen welche schon da sind).
4. **CMM-62 Cardentity-Audit** → entsperrt **CMM-64 Vorschäden**.
5. **CMM-66 Teil 2** — Views auf claims re-basen (pro Domäne nachziehen wenn Slice durch).
6. **CMM-49 SP-L** — Sync-Trigger droppen + `DROP TABLE faelle CASCADE` (NUR wenn alle obigen durch + finaler grep `from('faelle')`=0 + verify-phase6-db.sql).

Parallelisierbar: CMM-50/CMM-62 unabhängig von CMM-63.

---

## 5 · Slice-Rezept (wie ein additiver Slice läuft)

Bewährtes Muster aus SP-A..J (jeder Slice 2 PRs):
- **PR1 — Schema:** `ADD COLUMN` auf Ziel-Sub-Table + Backfill (IS-NULL-guarded UPDATE) + betroffene **Views repointen** (Generator-Script `scripts/_spX-gen-views.mjs`: pg_get_viewdef → regex-swap `f.<col>`→`<sub>.<col>` → assert → CREATE OR REPLACE). Numeric-Precision-Casts in der View nicht vergessen.
- **PR2 — Reader/Writer-Sweep:** Writer via Peel/Upsert-Helper (`upsertKanzleiFall`/`peelKanzleiFaelleColumns`/`splitOrKeepFaelleUpdate`); Reader auf **Embed** (`sub(...)` bzw. `claims:claim_id(sub(...))`, Array-normalisieren) bzw. **View** (wenn `.gte/.order`-Filter nötig — Embeds sind nicht filterbar).
- **2-Stufen-Review PFLICHT** (additiver Sweep maskiert Reader-Misses — faelle behält Werte, Reader brechen erst für NEUE Fälle).
- **Migration nur via CLI** (Regel 2): `npx supabase db query --linked --file <migration>` + `npx supabase migration repair --status applied <ts>`. **NIE** Management-API-DDL.
- **information_schema live prüfen** vor jeder Migration (Memory-Snapshots sind 1-2 Tage stale).
- **Portal-Smoke** pro betroffener Rolle nach dem Slice (statischer Grep findet keine dynamischen `fall[feld]`-Writes).

---

## 6 · Kritische Gotchas + Lessons (diese Session gelernt — DIE WICHTIGSTEN)

1. **Statisches Grep-Inventar ist unzuverlässig.** Der erste 417-Lauf hatte ~18 % False Positives: Embeds (`kanzlei_faelle(...)`), View-Reads (`v_faelle_mit_aktuellem_termin`), Helper-Writes (`upsertKanzleiFall`), Kommentare, entfernte Spalten — alle als „Breaker" geflaggt. **IMMER gegen aktuellen Code re-validieren** (lies ±20 Zeilen Kontext), bevor du eine Stelle „fixt". Nutze das **VALIDATED**-Doc, nicht das erste Inventar.
2. **Stale Linear-Ticket ≠ autoritativer Plan.** Das CMM-44-Master-Ticket beschrieb bis 24.05. „faelle bleibt operativ" (aus dem überholten 27.04.-Plan) → führte zu falscher Scope-Annahme. Bei Widerspruch das Strategie-Doc gegenprüfen.
3. **Stacked-Squash:** Wird ein PR off staging squash-gemergt, ist die alte Branch NICHT mehr Ancestor. NICHT re-pushen → frische Branch off `origin/staging` + `git cherry-pick <commit>`. (Diese Session 2× passiert.)
4. **Worktree-Pfad-Falle:** Writes/Agenten mit absolutem Pfad landen leicht im **Haupt-Checkout** (= andere Branch einer anderen Session) statt im Worktree. Worktree-Pfad explizit verwenden; nach Agent-Läufen prüfen WO die Datei landete + ggf. in den Worktree kopieren + Haupt-Checkout aufräumen.
5. **DB-Flakiness (544 „Failed to create login role"):** Trifft CLI `db query --linked` UND MCP `execute_sql` (beide über den Pooler). Bei Outage: Aaron startet die DB neu. View-DDL server-seitig via `pg_get_viewdef` + `replace` (+ Guard) generieren statt 100-Zeilen-Views von Hand zu rekonstruieren.
6. **`next build` OOMt @4GB-Heap** (TS-Worker) → `NODE_OPTIONS=--max-old-space-size=8192 npm run build`.
7. **Phase 6 = `DROP TABLE faelle CASCADE`** (ganze Tabelle, kein per-Spalten-Drop). claims = voller SSoT.

---

## 7 · Offene PRs (warten auf Aaron-Merge)

- **#1613** — SP-I6 (kanzlei_id, SP-I komplett). Wartet seit 23.05.
- **#1636** — VALIDATED-Inventar + dieses Handoff.
- **#1638** — CMM-66 Teil 1 (v_claim_full.mandatsnummer Live-Fix).
- *(gemergt: #1631 Revalidierung + 13 Test-Fixes.)*
- **Bekannt rot, separat:** 5 `extract-colors`-Tests (brauchen fetch+sharp-Mocks, Logo-Pipeline v2) — kein Phase-6-Bezug.

---

## 8 · Harte Regeln (AGENTS.md — immer)

- **Regel 1:** PR gegen `staging`, NIE direkt auf `main`.
- **Regel 2:** DDL nur via supabase-CLI (migration new + db push, ODER db query --file + repair), NIE Management-API.
- **Regel 3:** kein unbegleiteter Stash am Session-Ende.
- **7-Punkte-Audit** im Commit-Body vor jedem Commit.
- Du bist **NICHT die Merge-Session** (außer explizit benannt) → PR + berichten, nicht selbst mergen.
- Vor Start: Branch + Task melden, andere aktive Sessions checken (Branch-Kollision).
