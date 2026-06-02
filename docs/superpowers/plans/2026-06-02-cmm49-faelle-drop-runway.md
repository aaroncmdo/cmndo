# CMM-49 `faelle`-Drop-Runway — Master-Plan & Koordination

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (oder subagent-driven-development) **pro Batch**. Dieser Master-Plan ist ein **Runway + Batch-Katalog + Koordinations-Protokoll** — jeder Batch bekommt seinen eigenen detaillierten Sub-Plan/PR. Nur der **Pilot (§4)** ist hier voll ausspezifiziert.

**Goal:** `DROP TABLE public.faelle` — ohne Prod-Bruch, ohne Datenverlust, koordiniert über die vielen parallelen faelle-Sessions.

**Architecture:** `claims` ist SSoT. `faelle` wird entkernt: (1) faelle-eigene Daten-Spalten → claims/vehicles, (2) alle Code-Reader der `faelle`-Tabelle → claims/`v_claim_full`/`v_faelle_mit_aktuellem_termin`, (3) 45 Kind-FKs `fall_id` → `claim_id`, (4) RLS final + DROP. `claims.operative_status` ist seit CMM-74 b″ der Operativ-Cursor (faelle.status eingefroren).

**Tech Stack:** Next.js 16 Server-Actions/Routes, Supabase (Plugin-Migrationen, Regel 2), Postgres 17, TS, vitest.

**Status-Quelle der Wahrheit:** Die **Batch-Tabelle in §2** (Owner + Status pro Batch). Wer einen Batch nimmt, trägt sich dort ein (PR gegen diesen Plan oder via Aaron). Keine zwei Sessions am selben Batch.

---

## §0 — Audit-Evidenz (live, 02.06.2026, Projekt `paizkjajbuxxksdoycev`)

Korrigiert die Memory-Schätzung („41/47 FK") mit Live-Zahlen:

- **45 FKs** referenzieren `faelle.id`. Davon haben **41 bereits `claim_id`** (Spalte existiert; CMM-49-Batches a/b/c). Nur **4 fehlt `claim_id`** — und das sind alles **nullable Konversions-/Match-Refs** (keine harten Kinder):
  - `gutachter_finder_anfragen.konvertiert_zu_fall_id` (~2342, NO ACTION)
  - `leads.konvertiert_zu_fall_id` (~325, SET NULL)
  - `whatsapp_inbound_messages.matched_fall_id` (NO ACTION)
  - `gutschriften.referenz_fall_id` (NO ACTION)
- **Der echte Hauptblocker: ~401 Code-Call-Sites** lesen noch `from('faelle')` (nach dem b″-status-Sweep). Verteilung: `app/api` 44 · `app/gutachter` 26 · `app/kunde` 16 · `app/admin` 15 · `app/faelle` 14 · `lib/termine` 10 · `lib/actions` 9 · `lib/claims` 8 · Rest verstreut.
- **~30 faelle-eigene Daten-Spalten** sind noch SSoT (Views ziehen sie per `COALESCE(claims/vehicles…, f.*)`): `gegner_*`, `halter_*`, `fin_*`/`hsn`/`tsn`/`erstzulassung`/`kilometerstand`/`lackfarbe_code` (Fahrzeug-Herkunft → vehicles), `ust_id`/`leasinggeber_name`/`bank_name`/`firma_name`, `organisation_id`/`dispatch_id`, `source_channel`/`source_domain`, `kunde_lat`/`kunde_lng`, `zahlung_*`/`auszahlung_kunde_*`, `mietwagen_kanzlei_informiert*`, `halter_geburtsdatum`, `ist_fahrzeughalter`, `konvertiert_am`.

**Take-away:** Die FKs sind **nicht** der harte Teil (41/45 ready). Der harte Teil sind **401 Reader** + **~30 Daten-Spalten**.

---

## §1 — Runway (4 Phasen)

| Phase | Inhalt | Gate davor | Größe |
|---|---|---|---|
| **P1 — Daten-Spalten** | ~30 faelle-eigene Spalten → claims/vehicles: Spalte adden (falls fehlt) + Backfill + Writer-Repoint + `COALESCE`-Fallback aus Views ziehen + faelle-Spalte droppen. CMM-44-Stil. | b″ (#2257) gemergt | mittel |
| **P2 — Reader-Repoint** | ~401 `from('faelle')`-Reads → claims/`v_claim_full`/`v_faelle_mit_aktuellem_termin`. Batchweise je Domain. | — (parallel zu P1) | **groß** |
| **P3 — FK-Cutover** | 45 Kind-FKs `fall_id`→`claim_id`: 41 ready (Reader umhängen + `fall_id` droppen), 4 nullable Refs (umhängen/droppen). | P2 für die jeweilige Tabelle fertig | klein–mittel |
| **P4 — Endgame** | RLS final auf claim_id + `DROP TABLE faelle` + **Post-Drop-Smoke (4 Portale, Screenshot-Pflicht)**. | P1+P2+P3 = 0 Reader, 0 FK, 0 Spalten-Bedarf | klein, hartes Gate |

**Reihenfolge:** P1 & P2 parallelisierbar (verschiedene Sessions, verschiedene Domains). P3 pro Tabelle erst wenn deren Reader (P2) weg sind. P4 ganz zuletzt, ein einziges Mal, durch eine benannte Session.

---

## §2 — Batch-Katalog (claimable) — **hier eintragen wer was nimmt**

> **Regel:** Ein Batch = ein PR = ein Owner. Status: `frei` / `WIP @session` / `PR #n` / `merged`. Vor Start: Zeile auf `WIP` setzen + in §3-Koordination prüfen.

### P3 — FK-Tabellen (haben `claim_id`, brauchen nur Reader-Umhängen + fall_id-Drop)
Gruppiert nach Domain (Kollisions-Sicht zu aktiven Sessions in Klammern):

| Batch | Tabellen | Owner | Status |
|---|---|---|---|
| FK-ai-dead | `ki_gespraeche` ✅ (Mig `20260602125054`, §4.0) · `ai_usage_log` | @cmm49-drop-readiness | ki_gespraeche **done** · ai_usage_log frei |
| **FK-pilot-2** | `fall_summaries` (AI, Reader-Pattern, §4.1) | frei | frei (nächster) |
| FK-finance | `gutschriften`*, `forderungspositionen`, `zahlungseingaenge`, `zahlungspositionen`, `abrechnung_positionen`, `gutachter_abrechnungen`, `gutachter_abrechnungspositionen`, `kanzlei_abrechnung_positionen` | frei | frei |
| FK-comms | `email_log`, `calls`, `aircall_calls`, `matelso_calls`, `whatsapp_inbound_messages`* | frei (⚠ wa-baileys-Session) | frei |
| FK-fall-core | `timeline`, `tasks`, `notification_events`, `phase_transitions`, `pflichtdokumente`, `fall_dokumente`, `qc_checkliste`, `reklamationen`, `schadenspositionen`, `parteien`, `technische_probleme`, `regulierungs_klassifizierung` | frei | frei |
| FK-termine | `gutachter_termine`, `admin_termine`, `termine`, `kanzlei_admin_termine` | frei (⚠ termin-engine-Session) | frei |
| FK-sv-kunde | `sv_live_location`*, `fall_read_state`*, `personenschaden_personen`, `gutachter_mitteilungen`, `kunde_gutachten_requests`, `makler_fall_consent`, `makler_provisionen` | frei (⚠ aar-939/chat-Sessions) | frei |
| FK-kanzlei | `kanzlei_faelle`, `sla_tracking`, `flow_links` | frei | frei |
| FK-conversion | 4 nullable Refs: `leads`*, `gutachter_finder_anfragen`* (+ wa/gutschriften s.o.) | frei (⚠ aar-939/lead-Sessions) | frei |

`*` = noch KEIN `claim_id` (4 Konversions-/Match-Refs, s. §0).

### P2 — Reader-Domains (~401 `from('faelle')`-Reads)
| Batch | Bereich | ~Files | Owner | Status |
|---|---|---|---|---|
| RD-api | `app/api/**` | 44 | frei | frei |
| RD-gutachter | `app/gutachter/**` | 26 | frei (⚠ termin-engine) | frei |
| RD-kunde | `app/kunde/**` | 16 | frei (⚠ aar-939) | frei |
| RD-admin | `app/admin/**` | 15 | frei | frei |
| RD-faelle | `app/faelle/[id]/**` | 14 | frei | frei |
| RD-lib | `lib/**` (termine/actions/claims/…) | ~40 | frei | frei |

### P1 — Daten-Spalten-Cluster
| Batch | Spalten | Ziel | Owner | Status |
|---|---|---|---|---|
| DS-gegner | `gegner_*` (name/versicherung/kennzeichen/anzahl_beteiligte/fahrzeugtyp/aktenzeichen) | claims | frei | frei |
| DS-halter | `halter_*` (vorname/nachname/strasse/plz/stadt/telefon/email/name/geburtsdatum), `ist_fahrzeughalter` | claims | frei | frei |
| DS-vehicle | `fin_*`/`hsn`/`tsn`/`erstzulassung`/`kilometerstand`/`lackfarbe_code`/`fahrzeug_*`/`kennzeichen` (Fallback) | vehicles | frei (⚠ cmm-50) | frei |
| DS-origin | `source_channel`/`source_domain`/`organisation_id`/`dispatch_id`/`konvertiert_am`/`firma_name`/`ust_id`/`leasinggeber_name`/`bank_name` | claims | frei | frei |
| DS-pay | `zahlung_*`/`auszahlung_kunde_*`/`mietwagen_kanzlei_informiert*`/`kunde_lat`/`kunde_lng` | claims/claim_payments | frei | frei |

---

## §3 — Koordinations-Protokoll (PFLICHT — damit nichts durcheinanderkommt)

1. **Batch claimen:** §2-Zeile auf `WIP @<session>` setzen, bevor du Code/DDL anfasst. Nie zwei Sessions im selben Batch.
2. **`state-machine.ts` = Prod-Breaker-Single-Toucher.** Wer ihn anfasst: 939-Lane-Re-Check + Heads-up via Aaron (siehe CMM-74 b″). Aktuell schreibt er **kein** faelle.status mehr.
3. **Geteilte Views erhalten:** `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view` lesen `status` seit b″ aus `COALESCE(c.operative_status::fall_status, f.status)` (Mig `20260602115133`). Wer diese Views `CREATE OR REPLACE`t, **MUSS** den `operative_status`-Repoint + die `claims`/`vehicles`-COALESCE-Quellen erhalten — sonst Regression.
4. **Migrationen via Plugin (Regel 2):** `apply_migration` → `list_migrations` → File `supabase/migrations/<recorded>_<name>.sql` exakt nach recorded Version benennen (kein Twin-Drift).
5. **Reihenfolge-Constraint:** Eine faelle-Spalte/`fall_id` erst droppen, wenn **0 Live-Reader** dafür (per `grep -rn "from('faelle')" + "fall_id"` + View-Check). Reader-Repoint (P2) **vor** FK-Drop (P3) **vor** Spalten-Drop.
6. **Smoke + Doc pro Batch:** vitest gegen Staging (Muster §5) + Smoke-MD in `docs/<DD.MM.YYYY>/`. Nach jedem Spalten-/FK-Drop: betroffene Portal-Smoke.
7. **PR gegen `staging`**, nie main. Kein Auto-Merge (außer der benannten Merge-Session).
8. **Aktive-Session-Kollisionen (Stand 02.06.):** aar-939 (monika/GFA/leads/sv-tracking ×mehrere), termin-engine, cmm-71-makler, dispatch-config, chat-inbox, whatsapp-baileys, embed-b-cascade. Batches mit ⚠ in §2 erst nach Abstimmung mit der jeweiligen Lane.
9. **Moving Target — KEIN neuer `fall_id`-FK (KEY-Finding Pilot):** Die FK-Zahl auf faelle ist dynamisch — sie STIEG am 02.06. von 45 auf **46**, während der Pilot einen entfernte (parallele Sessions legten neue fall_id-FK-Tabellen an, z.B. `aar939_embed_tracking_webhook_monitoring`). **Neue Tabellen/Spalten MÜSSEN `claim_id uuid REFERENCES claims(id)` referenzieren, NIE `fall_id`** — sonst konvergiert der Runway nie. Bei P4-Endgame: finaler FK-Re-Count, nicht der 45/46-Snapshot.

---

## §4 — Pilot

### §4.0 — Pilot-0 AUSGEFÜHRT ✅ (02.06.): `ki_gespraeche` (FK-Cutover-Muster live verifiziert)
0-Rows/0-Code-Refs-Tabelle. `fall_id` gedroppt inkl. RLS-Repoint (`ki_gespraeche_kunde_insert` → `is_claim_user_party(claim_id)`) + `trg_derive_claim_id`-Drop. **Migration `20260602125054`**. Hat das vollständige §5-Cutover-Muster (RLS + Trigger + Column) live bewiesen — darum als Pilot-0 statt der ursprünglich geplanten `fall_summaries` (die wegen Reader-claimId-Threading + API-Param-Kopplung der bessere ZWEITE Pilot ist).

### §4.1 — Nächster Pilot (Reader-Pattern): `fall_summaries` fall_id → claim_id (voll spezifiziert)

**Warum Pilot:** isoliert (AI-Summary-Domain, keine aktive Session), demonstriert **beide** Hälften (Reader-Repoint + FK-Cutover) bei nur 5 Reader-Files. Etabliert das Template für §5.

**Tabelle:** `fall_summaries` — hat bereits `claim_id` (FK), `fall_id` (FK, on_delete=CASCADE). 1:1 fall↔claim (`faelle.claim_id` NOT NULL, jeder Fall hat genau einen Claim).

**Reader/Writer-Files (Live-Audit):**
- `src/lib/copilot/briefing.ts`
- `src/lib/faq-bot/analyse.ts`
- `src/app/faelle/[id]/ai-actions.ts`
- `src/app/api/fall-summaries/route.ts`
- `src/components/admin/FaqBotAnalyseCard.tsx`

### Task P-1: Backfill `claim_id` verifizieren/füllen (Plugin-Migration)
- [ ] **Step 1:** READ-Check (execute_sql): `SELECT count(*) AS unbackfilled FROM fall_summaries s JOIN faelle f ON f.id=s.fall_id WHERE s.claim_id IS NULL;`
- [ ] **Step 2:** Falls `unbackfilled > 0` → `apply_migration` name `cmm49_fall_summaries_backfill_claim_id`:
  ```sql
  UPDATE public.fall_summaries s SET claim_id = f.claim_id
    FROM public.faelle f WHERE s.fall_id = f.id AND s.claim_id IS NULL;
  ```
- [ ] **Step 3:** `list_migrations` → recorded Version; File committen.
- [ ] **Step 4:** Verify (READ): `unbackfilled = 0`.

### Task P-2: Reader/Writer auf `claim_id` repointen (pro File, tsc-gated)
**Pattern (§5):** Caller hat `fallId` → `claimId` aus `faelle.claim_id` auflösen (oder direkt aus dem Claim-Kontext, falls vorhanden). Query `.eq('fall_id', fallId)` → `.eq('claim_id', claimId)`. Insert `{ fall_id }` → `{ claim_id }`.
- [ ] **Step 1–5:** Pro File: Datei lesen → fall_id-Zugriffe identifizieren → claimId auflösen → repointen → `npx tsc --noEmit` grün → weiter. (Exakte before/after pro File bei Ausführung; alle 5 Files in EINEM Commit, da klein + zusammengehörig.)
- [ ] **Step 6:** Verify: `grep -rn "from('fall_summaries')" src | grep fall_id` → 0 Treffer.
- [ ] **Step 7:** Commit `feat(CMM-49): fall_summaries-Reader fall_id -> claim_id`.

### Task P-3: `fall_id` droppen (Plugin-Migration, NACH P-2)
- [ ] **Step 1:** Re-Verify 0 Reader (Step P-2.6) **+** kein anderer Live-Reader (`grep` repo-weit).
- [ ] **Step 2:** `apply_migration` name `cmm49_fall_summaries_drop_fall_id`:
  ```sql
  ALTER TABLE public.fall_summaries DROP COLUMN fall_id;
  ```
  (droppt die Spalte inkl. `fall_summaries_fall_id_fkey`).
- [ ] **Step 3:** `list_migrations` → recorded Version; File committen.
- [ ] **Step 4:** Verify (READ): Spalte weg, `claim_id` befüllt, FK `fall_summaries_claim_id_fkey` intakt.

### Task P-4: Smoke + Doc
- [ ] **Step 1:** vitest gegen Staging (§5-Muster): seed claim+fall+fall_summaries-Row mit claim_id → AI-Summary-Reader (briefing/analyse) liefert die Row → cleanup `delete_fall_komplett`.
- [ ] **Step 2:** `npx tsc --noEmit` grün (voller build OOMt im Worktree → tsc-Gate).
- [ ] **Step 3:** Smoke-Doc `docs/02.06.2026/cmm49-fall-summaries-cutover-smoke.md`.
- [ ] **Step 4:** PR `--base staging`, 7-Punkte-Audit im Body. §2-Zeile auf `PR #n`.

---

## §5 — Pattern-Referenz: `fall_id` → `claim_id` Cutover (für ALLE P3-Batches) — **im Pilot verifiziert**

1. **Backfill:** `UPDATE <tbl> t SET claim_id = f.claim_id FROM faelle f WHERE t.fall_id = f.id AND t.claim_id IS NULL;` (nur wenn claim_id schon existiert; sonst zuerst `ADD COLUMN claim_id uuid REFERENCES claims(id)`).
2. **Reader/Writer repointen:** `claimId` auflösen (drop-final bevorzugt: der claim-tragende Caller liefert claimId; interim `faelle.claim_id`-Lookup ist erlaubt, MUSS aber vor P4 raus). `.eq('fall_id', x)` → `.eq('claim_id', claimId)`; Inserts analog. **Nested-FK** mit `Array.isArray(x) ? x[0] : x` normalisieren.
3. **Verify 0 Reader:** `grep -rn "from('<tbl>')" src | grep fall_id` = 0.
4. **Dependents von `fall_id` lösen (PFLICHT vor Column-Drop — sonst `ERROR 2BP01: cannot drop column ... other objects depend on it`):**
   - **a. RLS-Policies auf fall_id** finden + auf claim_id repointen: `SELECT polname, pg_get_expr(polqual,polrelid), pg_get_expr(polwithcheck,polrelid) FROM pg_policy WHERE polrelid='public.<tbl>'::regclass;` (+ Rolle via `unnest(polroles::oid[])`). Kunde-Scope → `claim_id IS NOT NULL AND is_claim_user_party(claim_id)`; Staff-Scope → `can_access_claim(claim_id)` (beide an `authenticated` GRANTed). `DROP POLICY` + `CREATE POLICY` mit exakter Rolle. **Achtung:** `faelle.kunde_id` ≠ `claims.geschaedigter_user_id` (1 Mismatch live) → kanonischen Helper nutzen, NICHT die Spalte inlinen.
   - **b. `trg_derive_claim_id`** (Funktion `derive_claim_id_from_fall`, BEFORE INS/UPD OF fall_id) auf der Tabelle droppen: `DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.<tbl>;` (Funktion bleibt — von ~40 Triggern geteilt).
   - **c.** ggf. weitere Dependents (Indizes auf fall_id, andere Trigger) prüfen.
5. **Drop:** `ALTER TABLE <tbl> DROP COLUMN fall_id;` (Plugin). Bei nullable Refs (`konvertiert_zu_fall_id` etc.): erst auf claim_id-Variante umhängen oder Spalte droppen, je nach Semantik.
6. **Smoke** (vitest gegen Staging, seed→assert→`delete_fall_komplett`-cleanup; clients sind untyped → column-Filter type-safe; `guard_claims_created_by` ist service_role-permissiv; minimal-seed = `claims.schadentag` + `faelle.claim_id`). Bei 0-Row/0-Ref-Tabellen: Verifikation = Spalte/FK/Trigger weg + Policy claim-based + tsc grün.

---

## Self-Review

- **Spec-Coverage:** P1 (Daten-Spalten §0/§2-DS), P2 (401 Reader §2-RD), P3 (45 FKs §2-FK), P4 (RLS+DROP+Smoke §1) — alle Audit-Befunde haben eine Phase/Batch. ✅
- **Placeholder-Scan:** Der Master-Plan ist bewusst ein Runway+Katalog (Sub-Pläne pro Batch, per writing-plans Scope-Check). Der **Pilot (§4) ist konkret** (exakte Files, Migrations-DDL, grep-Verifikation). Per-File before/after im Pilot bei Ausführung — kein vages „handle X", das Recipe (§5) ist konkret.
- **Type-Konsistenz:** `claim_id` (uuid, FK claims.id) durchgängig; `operative_status::fall_status` Cast wie b″.
- **Koordination:** §3 deckt die Multi-Session-Realität (claimen, Views erhalten, Reihenfolge, ⚠-Kollisionen).
- **Offen:** P4-Endgame (DROP) durch EINE benannte Session, erst wenn §2 vollständig `merged`.
