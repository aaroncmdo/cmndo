# CMM-44 Phase 3 — `status`-SP: Strategie & PR-Split-Plan (2026-05-26)

**Status: PLAN zur Review — noch NICHT umgesetzt.** Entstanden aus der read-only Analyse am 2026-05-26
(nach Abschluss der SV-Leadpreis-Slice #1794). Der `status`-SP ist der groesste Phase-6-Hebel und das
hoechste Risiko der CMM-44-Vollmigration — daher dieser Plan vor dem Bau.

Kontext: Phase 3 = faelle-Writer/Reader auf claims umstellen (Claim-as-SSoT, faelle -> Phase-6-DROP).
Vorgaenger-Slices: Bankdaten #1789, SV-Leadpreis #1794. Roadmap-Quelle:
`handoff-cmm44-phase3-writer-migration-2026-05-26.md` §3+§5.

---

## 1 · Warum `status` fundamental anders ist (Befunde, live verifiziert 2026-05-26)

1. **`claims.status` ist STALE / unsynchronisiert.** Der kanonische Writer `transitionFallStatus`
   (`src/lib/faelle/state-machine.ts`) baut `update.status = newStatus` und routet via
   `splitOrKeepFaelleUpdate`. Da `status` NICHT in `CLAIM_OWNED_DUPLICATE_COLUMNS` ist, bleibt es im
   **faelle-Teil** -> status wird **nur auf faelle** geschrieben (state-machine.ts:155), NICHT auf claims
   (claims-Write Z.163 enthaelt nur die Duplikat-Spalten wie status_changed_at).
   Und es gibt **KEINEN status-Sync-Trigger** (pg_trigger-Inventur: nur `sync_faelle_sv_id_to_claims` /
   `sync_claims_sv_id_to_faelle` fuer sv_id + `trg_claims_set_phase` fuer phase; SP-A hat das 34-Spalten-
   Sync-Paar gedroppt). -> claims.status ist seit dem SP-A-Drop bei Claim-Erstellung eingefroren.
   **Konsequenz:** Eine reine "Reader -> claims.status"-Migration wuerde FALSCHE Status anzeigen. Erst
   muss claims.status korrekt befuellt + laufend gepflegt werden.

2. **Typ-Mismatch:** `faelle.status` = `fall_status` (**Enum**, USER-DEFINED), `claims.status` = `text`.
   **Beide NOT NULL.** Die App nutzt durchgaengig Enum-Semantik (`FALL_STATUS_TRANSITIONS` keyed auf
   Enum-Werte). Ein View-Repoint von `f.status` (enum) auf `c.status` (text) aendert den View-Spaltentyp
   -> `42P16 cannot change data type of view column` (vgl. numeric-Lektion SV-Leadpreis, nur haerter).

3. **Hoher Blast-Radius:**
   - Writer: kanonisch `transitionFallStatus` + mind. 5 DIRECT-Writer die faelle.status umgehen
     (`lib/kanzlei-wunsch/actions.ts`, `app/gutachter/team/actions.ts`, `app/api/sv-zuweisung/route.ts`,
     `app/admin/faelle/anlegen/actions.ts` = Fall-Erzeugung/INSERT, `lib/lexdrive/process-event.ts`
     ovFaelle-Pfad ~Z.744 `status: neuerStatus`) + VorOrtPanel (verifizieren) + ~6 Smoke/Seed-Scripts.
   - Reader: status wird in 100+ Files referenziert (viele auf ANDEREN Tabellen — tasks/termine/
     claim_payments/abrechnungen/auftraege/kanzlei_faelle.status; der faelle.status-Reader-Sweep ist
     trotzdem dutzende Files) + DB-Views.

4. **DB-Notification-Trigger auf faelle.status:** `on_gutachten_eingegangen`, `on_filmcheck_done`,
   `on_regulierung` feuern bei faelle-status-Aenderung (Benachrichtigungen). Diese MUESSEN weiter feuern.

---

## 2 · Kern-Konsequenz: DUAL-WRITE-Transition (nicht das exklusive additive Pattern)

Die additiven Slices (Bankdaten/SV-Leadpreis) haben den Write **exklusiv** auf claims gelegt UND die
Reader im selben PR migriert. Fuer `status` geht das NICHT in einem Schritt:

- `status` in `CLAIM_OWNED_DUPLICATE_COLUMNS` aufnehmen = exklusives claims-Routing -> faelle.status
  friert ein -> **bricht** (a) die 3 faelle-Notification-Trigger, (b) die Selbst-Validierung in
  `transitionFallStatus` (liest `fall.status` von faelle, Z.68), (c) alle noch-nicht-migrierten
  faelle.status-Reader.
- Zu viele Reader fuer einen einzigen PR.

-> **`status` braucht eine Dual-Write-Phase:** beide Spalten schreiben (faelle.status FUER die noch
nicht migrierten Reader + Trigger, claims.status um es live-korrekt zu machen), bis Reader + Trigger
migriert sind. Dann faelle-Write droppen (Phase 6). Das ist das klassische Large-Column-Migration-
Muster, NICHT das `splitOrKeepFaelleUpdate`-Exklusiv-Routing.

---

## 3 · Typ-Entscheidung (Aaron-Call) — Empfehlung: claims.status -> `fall_status` Enum

**Option A (EMPFOHLEN): claims.status auf `fall_status` Enum reconcilen** (`ALTER COLUMN status TYPE
fall_status USING status::fall_status`).
- Pro: View-Repoints `f.status` -> `c.status` sind typ-identisch -> **kein 42P16**. Enum-Typsicherheit
  bleibt. Konsistent mit faelle + App-Semantik. Korrekter Phase-6-Endzustand (claims wird SSoT).
- Cost: 1 ALTER COLUMN TYPE (Tabellen-Lock, ~60 Zeilen = trivial). Vorbedingung: alle vorhandenen
  claims.status-Werte muessen gueltige Enum-Member sein (verifizieren — sollte gelten, waren mal valide
  Status).

**Option B: claims.status als `text` lassen.**
- Con: View-Repoints brauchen ueberall `c.status::fall_status`-Casts (sonst 42P16), fragil; verliert
  Enum-Typsicherheit (claims.status koennte invalide Werte halten). Nicht empfohlen.

---

## 4 · PR-Split-Plan

### PR1 — Foundation (Dual-Write, Reader-Blast-Radius ≈ 0)
- **Migration:** (1) Backfill `claims.status = faelle.status` (one-shot, alle Zeilen — fixt die
  Staleness). (2) [Option A] `ALTER TABLE claims ALTER COLUMN status TYPE fall_status USING
  status::fall_status` (nach Werte-Validierung). NOT NULL bleibt.
- **Code:** `transitionFallStatus` nach dem faelle-Write ZUSAETZLICH `claims.status` schreiben (explizit,
  NICHT via Helper — sonst exklusiv). Alle DIRECT-Writer (kanzlei-wunsch, gutachter/team, sv-zuweisung,
  lexdrive ovFaelle, admin/faelle/anlegen INSERT, VorOrtPanel) dual-write claims.status. `status` NICHT
  in CLAIM_OWNED_DUPLICATE_COLUMNS aufnehmen (wuerde exklusiv routen).
- **KEINE Reader-Migration.** faelle.status bleibt fuehrend fuer Reads -> bestehende Reader + Trigger
  unveraendert.
- **Verify:** `status_divergent = 0` nach Backfill; ein Test-Uebergang bumpt faelle.status UND
  claims.status; Notification-Trigger feuern weiter.

### PR2 — Reader + View-Sweep
- Views (`fall_status`, `status`, `v_faelle_mit_aktuellem_termin`, …) `f.status` -> `c.status`
  repointen (typ-identisch bei Option A -> kein 42P16).
- DIRECT faelle.status-Reader (dutzende `.eq('status')` / `select(status)` auf faelle bzw. via View)
  auf claims/Embed/View umstellen. ggf. nach Portal sub-splitten.
- `transitionFallStatus`-Selbst-Validierung (Z.60-68) auf claims.status lesen.
- Portal-Smokes (Admin/SV/Kunde/Dispatch/Kanzlei).

### PR3 — Trigger-Migration + Cleanup
- Die 3 faelle-Notification-Trigger (`on_gutachten_eingegangen`/`on_filmcheck_done`/`on_regulierung`)
  entweder auf claims.status umziehen ODER bis Phase 6 auf faelle lassen (faelle.status wird bis dahin
  dual-geschrieben — Entscheidung im PR3-Kontext).
- Sicherstellen: kein faelle.status-Reader mehr.

### Phase 6
- faelle.status-Write entfernen + Spalte droppen (Teil des faelle DROP TABLE).

---

## 5 · Risiken & Gotchas

- **Enum-Wert-Drift:** vor `ALTER TYPE` pruefen, dass alle claims.status-Werte ∈ fall_status (stale,
  aber sollten valide sein). Sonst USING-Cast wirft.
- **Notification-Trigger:** faelle.status MUSS bis zur Trigger-Migration (PR3) weiter geschrieben werden.
- **Selbst-Validierung:** `transitionFallStatus` liest faelle.status fuer die Uebergangs-Pruefung —
  erst in PR2 auf claims umstellen (PR1 schreibt faelle weiter, also unkritisch).
- **Reader-Zahl:** PR2 ist gross; ggf. nach Portal in PR2a/b/c sub-splitten.
- **DB-Pool:** Migration in ruhigem Slot (statement-timeouts unter 8 Parallel-Sessions am 2026-05-26).
  `db push` ist atomar -> Re-Run sicher. NUR `db push`, nie MCP apply_migration (Regel 2).
- **Worktree-Setup:** frischer `git worktree add` braucht node_modules-Junction + Kopie `supabase/.temp/`
  fuer tsc + db push (siehe SV-Leadpreis-Handoff).

---

## 6 · Offene Verifikations-Schritte (bei ruhigem Pool nachholen, vor PR1)

1. `status_divergent`: `SELECT count(*) FROM faelle f JOIN claims c ON f.claim_id=c.id WHERE
   f.status::text IS DISTINCT FROM c.status::text` — Magnitude der Staleness (am 2026-05-26 timeout-
   geblockt).
2. View-Inventur: `SELECT DISTINCT view_name FROM information_schema.view_column_usage WHERE
   table_schema='public' AND table_name='faelle' AND column_name='status'` (+ analog claims.status).
3. Exhaustive DIRECT-Writer-Liste (nicht auf ein Grep-Pattern verlassen — lexdrive schreibt
   `status: neuerStatus`, andere Variablennamen moeglich; auch INSERTs = Fall-Erzeugung).
4. `SELECT DISTINCT status FROM claims` vs `enum_range(NULL::fall_status)` — alle claims.status-Werte
   gueltige Enum-Member? (Vorbedingung fuer ALTER TYPE / Option A.)

---

## 7 · Empfohlene Reihenfolge gesamt

SV-Leadpreis ✅ (#1794) -> **status-SP (dieser Plan: PR1 Dual-Write -> PR2 Reader/View -> PR3 Trigger)**
-> sv_id-Slice (bidir Sync-Trigger) -> Cardentity/Fahrzeug (offene Audits §3.1c / Cluster-H) -> Phase 6.
