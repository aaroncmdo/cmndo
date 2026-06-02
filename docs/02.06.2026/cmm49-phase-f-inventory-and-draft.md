# CMM-49 Phase F — Live-Inventar + Drop-safe Removal-Draft (02.06.2026)

> **Status:** Inventar (live gegen `paizkjajbuxxksdoycev`, 02.06.2026) + **DRAFT**-Removal-Migration.
> **NICHT appliziert.** Jede DDL hier wird erst auf Aaron-Go via Supabase-Plugin (`apply_migration`) angewendet — siehe AGENTS.md Regel 2. Diese Datei ist die Vorlage für die Phasen F (Pre-DROP-Cleanup) und G (`DROP TABLE faelle CASCADE`) des Master-Plans (`docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md`).
>
> Vorgänger: `docs/02.06.2026/HANDOFF-cmm49-drop-session-eod.md`, `docs/01.06.2026/faelle-drop-runway-live-revalidation.md`.

---

## 0. Drop-Runway Refresh — Live-Stand 02.06.2026

De-driftet gegen die Runway-Revalidierung vom 01.06. Andere Sessions haben über Nacht gemerged.

| Metrik | 01.06. (Runway) | **02.06. (live)** | Delta |
|---|---|---|---|
| `faelle` Rows | 75 | **75** | — |
| `claims` Rows | 76 | **76** | — |
| Eingehende FKs → faelle | 47 | **47** | — |
| Ausgehende FKs von faelle | — | **12** | (neu erfasst) |
| Views die faelle referenzieren | 5 | **6** | +1 (siehe unten) |
| `.from('faelle')` in `src/` | 421 | **417** | −4 (Reader-Sweep #2195/#2200) |
| RLS-Policies die faelle referenzieren | ~29 | **26** (3 on-faelle + 23 cross-table) | präzisiert |

**Gemerged seit Handoff-EOD (alle 4 PRs auf staging):** #2195 (SLA-Reader-Sweep), #2200 (send-reminders-Cron), **#2210 (PC-4 RPCs drop-safe)**, #2204 (Phase-C-Plan). Zusätzlich #2220 (CMM-66 Teil-2 Views, sv_id-Repoint) → in Release-PR #2222 (staging→main).

**6 faelle-referenzierende Views (CMM-66 / PC-5 Scope, NICHT in meiner Lane — `kitta/cmm-66-view-rebase` + Release-Pipeline):**
`faelle_kunde_view`, `faelle_sv_view`, `v_claim_full`, `v_claim_listing`, `v_claim_phase`, `v_faelle_mit_aktuellem_termin`. — `v_claim_phase` existiert und liefert sub_phases (`vollmacht_offen`×61, `kanzlei_uebergabe`×12, `sa_offen`×2, `termin`×1), referenziert aber noch faelle.

---

## 1. Eingehende FKs → `faelle(id)` (47) — CASCADE-Drop, Spalten überleben

`DROP TABLE faelle CASCADE` entfernt **alle 47 FK-Constraints automatisch**. Die uuid-Spalten (`fall_id`, `konvertiert_zu_fall_id`, `matched_fall_id`, `referenz_fall_id`) **bleiben als plain uuid** erhalten — das ist der Drop-first-Hebel (~250 `fall_id`-Filter überleben, Boy-Scout post-drop). Phase F muss diese FKs **nicht** vorab droppen; sie gehen mit der CASCADE.

**ON DELETE CASCADE (24):** auftraege, fall_dokumente, fall_read_state, fall_summaries, forderungspositionen, kanzlei_faelle, ki_gespraeche, kunde_gutachten_requests, makler_fall_consent, nachrichten, notification_events, parteien, personenschaden_personen, pflichtdokumente, phase_transitions, qc_checkliste, regulierungs_klassifizierung, reklamationen, schadenspositionen, sla_tracking, tasks, termine, timeline, zahlungseingaenge, zahlungspositionen.

**ON DELETE SET NULL (11):** admin_termine, ai_usage_log, aircall_calls, calls, email_log, flow_links, kanzlei_admin_termine, leads (`konvertiert_zu_fall_id`), matelso_calls, sv_live_location, webhook_events.

**NO ACTION / default (10, faktisch RESTRICT):** abrechnung_positionen, gutachter_abrechnungen, gutachter_abrechnungspositionen, gutachter_finder_anfragen (`konvertiert_zu_fall_id`), gutachter_mitteilungen, gutachter_termine, gutschriften (`referenz_fall_id`), kanzlei_abrechnung_positionen, makler_provisionen, technische_probleme, whatsapp_inbound_messages (`matched_fall_id`).

> **Wichtig:** Die 10 NO-ACTION-FKs blockieren KEIN `DROP TABLE … CASCADE` (CASCADE droppt die Constraint, ON-DELETE-Verhalten ist irrelevant beim Table-Drop). Sie sind nur beim **row-level** Delete relevant — exakt warum die PC-4-RPC (`delete_fall_komplett`) jede Tabelle einzeln in der richtigen Reihenfolge abräumt.

## 2. Ausgehende FKs von `faelle` (12) — gehen mit der Tabelle

`faelle_claim_id_fkey → claims(id) ON DELETE RESTRICT` (⟵ der Grund, warum die Delete-RPC faelle VOR claims löscht), `faelle_kunde_id_fkey`, `faelle_dispatch_id`, `faelle_sv_id`, `faelle_lead_id`, `faelle_makler_id`, `faelle_organisation_id`, `faelle_kanzlei_abrechnung_id`, `faelle_eskalation_tag_{14,21,28}_ergebnis_von`, `faelle_eskaliert_an_admin_id`. — Kein Handlungsbedarf (droppen mit der Tabelle).

---

## 3. RLS-Policies (26 referenzieren faelle)

### 3a. ON `faelle` (3) — droppen automatisch mit der Tabelle
`faelle_staff_all_consolidated` (ALL), `faelle_kunde_sv_kanzlei_select_consolidated` (SELECT), `faelle_makler_read` (SELECT). Kein Handlungsbedarf.

### 3b. ⚠️ Cross-Table-Policies (23) — **BRECHEN beim DROP** → vor Phase G claims-basiert umschreiben

Diese Policies liegen auf **überlebenden** Tabellen und lösen Ownership über `faelle` auf (`faelle.kunde_id`, `faelle.sv_id` → sachverstaendige.profile_id, `faelle.service_typ`). Nach dem Drop referenziert der Policy-Ausdruck eine nicht mehr existente Tabelle → **die Policy wird ungültig, der Tabellenzugriff bricht für die betroffene Rolle**. Das ist der eigentliche RLS-Hard-Blocker (Inzident-Klasse: AAR-894, profiles-Self-Escalation — RLS-Änderungen brauchen vollen Multi-Portal-Smoke).

| Tabelle | Policy | cmd | faelle-Bezug → claims-Ziel |
|---|---|---|---|
| claim_mietwagen | cm_kunde_select | SELECT | `f.claim_id … WHERE f.kunde_id=uid` → `claims.geschaedigter_user_id=uid` |
| fall_dokumente | Kanzlei liest fall_dokumente | SELECT | `faelle.service_typ='komplett'` → `claims.service_typ` (via fall_dokumente.claim_id) |
| fall_dokumente | SV eigene Fall-Dokumente | ALL | `faelle.sv_id` → `claims.sv_id` |
| fall_dokumente | fall_dokumente_kunde_insert | INSERT | `f.kunde_id=uid` → `claims.geschaedigter_user_id` |
| fall_dokumente | fall_dokumente_kunde_read | SELECT | dito |
| ki_gespraeche | ki_gespraeche_kunde_insert | INSERT | `faelle.kunde_id=uid` → claims |
| leads | leads_kanzlei_kb_select_consolidated | SELECT | `faelle.lead_id … service_typ` → `claims.lead_id … service_typ` (KB-Zweig bereits claims) |
| leads | leads_makler_sv_select_consolidated | SELECT | `faelle JOIN sachverstaendige … f.lead_id` → claims.lead_id + claims.sv_id |
| leads | leads_staff_all_consolidated | ALL | `faelle f JOIN claims c … f.lead_id` → direkt `claims.lead_id` (faelle-Join entfällt) |
| nachrichten | nachrichten_insert_public_consol | INSERT | `faelle JOIN sachverstaendige` + `faelle.kunde_id` → claims (via nachrichten.claim_id) |
| nachrichten | nachrichten_select_public_consol | SELECT | dito |
| personenschaden_personen | personenschaden_personen_all_public_consol | ALL | `faelle.kunde_id` → claims (via claim_id) |
| pflichtdokumente | Kunden eigene Dokumente | SELECT | `faelle.kunde_id` → claims |
| pflichtdokumente | pflichtdokumente_select_authenticated_consol | SELECT | `faelle.kunde_id` + `faelle.sv_id` → claims |
| pflichtdokumente | pflichtdokumente_update_authenticated_consol | UPDATE | dito |
| phase_transitions | phase_transitions_own_fall | SELECT | `faelle f … kunde_id/sv_id/makler_id` → claims |
| qc_checkliste | Gutachter read own qc_checkliste | SELECT | `faelle.sv_id` → claims.sv_id |
| tasks | sv_adhoc_task_insert | INSERT | `faelle.sv_id` → claims.sv_id |
| tasks | tasks_select_authenticated_consol | SELECT | `faelle.kunde_id` → claims |
| timeline | Kanzlei liest timeline | SELECT | `faelle.service_typ='komplett'` → claims (via timeline.claim_id) |
| timeline | timeline_select_authenticated_consol | SELECT | `faelle.sv_id` + `faelle.kunde_id` → claims |
| vehicle_ownership_history | vehicle_ownership_history_select_public_consol | SELECT | `faelle f JOIN claims c … sv` → claims direkt (faelle-Join entfällt) |
| vehicles | vehicles_select_public_consol | SELECT | dito |

**Migrations-Pfad für claims-Ownership:** Kunde = `claims.geschaedigter_user_id` (CMM-63 Core done; Caveat: `faelle.kunde_id ≠ geschaedigter_user_id` für 1 Row — vor Cutover pro Policy gegen Daten prüfen). SV = `claims.sv_id` (Sync-Trigger hält es aktuell — siehe §4.1, post-drop ist claims SSoT). KB = `claims.kundenbetreuer_id`. service_typ = `claims.service_typ`. Alle Child-Tabellen haben `claim_id` (via `derive_claim_id_from_fall`-Trigger backfilled), also kann jede Policy `… IN (SELECT … FROM faelle WHERE …)` durch direkten `claim_id`-Vergleich oder `JOIN claims` ersetzt werden.

> `can_access_fall(uuid)` wird in **0 Policies** verwendet (geprüft) — die RLS-Brüche sind ausschließlich die 23 literal-faelle-Policies oben. (`can_access_fall` selbst bricht trotzdem — siehe §4.2, App-Consumer.)

---

## 4. Trigger + Funktionen die faelle anfassen

PostgreSQL trackt Tabellen-Referenzen **innerhalb von Funktionskörpern NICHT** als Katalog-Dependency. Heißt: `DROP TABLE faelle CASCADE` lässt diese Trigger/Funktionen **stehen** — sie brechen erst zur **Laufzeit**, wenn sie nach dem Drop feuern. Das ist die gefährlichste, unsichtbarste Phase-F-Klasse.

### 4.1 ⚠️ Trigger auf ÜBERLEBENDEN Tabellen die faelle lesen/schreiben (Hard-Blocker)

| Funktion | Trigger / Tabelle(n) | faelle-Zugriff | Fate |
|---|---|---|---|
| **`sync_claims_sv_id_to_faelle`** | `trg_sync_claims_sv_id_to_faelle` ON **claims** | `UPDATE faelle SET sv_id WHERE claim_id=NEW.id` bei sv_id-Change | **DROP** — sv_id-SSoT ist claims; obsolet. Bleibt es stehen, bricht JEDER claims-sv_id-Write post-drop. |
| **`derive_claim_id_from_fall`** | `trg_derive_claim_id` auf **~48 Tabellen** | `SELECT f.claim_id FROM public.faelle f WHERE f.id=NEW.fall_id` (Backfill claim_id aus fall_id) | **drop-safe-guarden** jetzt (entkoppelt von PC-6), **DROP** im Post-Drop-Cleanup. Bricht sonst jeden fall_id-only-Insert auf 48 Tabellen. |
| **`trg_fn_fill_claim_id_from_fall`** | `trg_phase_transitions_fill_claim_id` (phase_transitions), `trg_timeline_fill_claim_id` (timeline) | dito (Duplikat von oben) | dito |
| **`kanzlei_faelle_sync_claim_fall`** | `trg_kanzlei_faelle_sync` ON **kanzlei_faelle** | bidirektional `SELECT … FROM faelle` (claim_id↔fall_id) | drop-safe-guarden / one-way claim_id; post-drop ist die fall_id-Ableitung moot |

> **PC-6-Sequencing:** Die `derive_*`/`fill_*`-Trigger sind aktuell die Backfill-Mechanik für claim_id. Sie dürfen erst hart gedroppt werden, NACHDEM alle Writer claim_id-nativ schreiben (PC-6). Empfehlung: **jetzt drop-safe guarden** (per `to_regclass('public.faelle') IS NOT NULL`-Wrap, exakt das PC-4-Muster) → entkoppelt vom Drop-Timing, kein PC-6-Gate, no-op statt Crash. Harter DROP dann im Post-Drop-Cleanup.

### 4.2 Funktionen die faelle lesen/schreiben (App-/Cron-/RPC-Layer)

| Funktion | faelle-Zugriff | Bricht? | Fate |
|---|---|---|---|
| **`dsgvo_anonymize_user_data`** | `UPDATE public.faelle SET kunde_*` **ungeguarded** + 2 faelle-Subqueries | **JA — RAISEt** → DSGVO-Art.17-Erasure schlägt fehl | **REWRITE** (faelle-UPDATE entfernen; Subqueries auf claims/claim_parties via `kunde_id`/`geschaedigter_user_id`). **DSGVO-kritisch, nicht droppen.** |
| **`cron_vs_frist_reminder`** | `SELECT … FROM faelle JOIN claims` → notification_events.fall_id | JA (in EXCEPTION→log, fail-soft) | **REWRITE** → claim_id (claim_id ist bereits im Scope der CTE). |
| **`can_access_fall`** | `SELECT … FROM faelle JOIN claims` (Admin/Dispatch/KB-Access) | JA | App-Consumer auf **`can_access_claim`** umstellen, dann **DROP**. (Consumer greppen: `grep -rn can_access_fall src/`.) |
| **`delete_fall_komplett(uuid)`** 1-arg | `SELECT COUNT(*) FROM faelle` + `DELETE FROM faelle` **ungeguarded** | JA | **DROP** (PC-7) — die 2-arg-Variante ersetzt es vollständig. |
| `delete_gutachter_komplett(uuid)` | `UPDATE faelle SET sv_id=NULL` **WHEN-OTHERS-guarded** | nein (no-op post-drop) | drop-tolerant; **repointen** auf `claims.sv_id` für Korrektheit (sonst stale claims.sv_id beim SV-Delete). Niedrige Prio. |
| `delete_fall_komplett(uuid,uuid)` 2-arg | EXISTS-geguarded read + dynamic DELETE | **nein (drop-safe)** | **behalten** — in dieser Session empirisch verifiziert (siehe Smoke-Doc). |
| `delete_lead_komplett` | `SELECT … FROM faelle` | wahrscheinlich (Body ungeprüft) | per-Body prüfen + drop-safe guarden / repointen. |

### 4.3 Orphan / Dead-Code (nur Cleanup)
- **`trg_fn_sync_kanzlei_paket_to_faelle`** — `UPDATE faelle SET aktuelle_phase` aber **KEIN Trigger attached** (orphan). Feuert nie → bricht nie. **DROP fn** (Cleanliness). *Hinweis: schreibt `faelle.aktuelle_phase` — falls je reaktiviert, gehört es in die b″/CMM-74-Phase-Engine-Lane, nicht hierher.*
- **`sync_faelle_sv_id_to_claims`** — Trigger `trg_sync_faelle_sv_id_to_claims` ON faelle (droppt mit Tabelle); fn danach orphan. **DROP fn** (Cleanliness).

### 4.4 False-Positives (fassen die faelle-TABELLE NICHT an — `%faelle%`-ILIKE-Artefakt)
`increment_offene_faelle` (UPDATEt `sachverstaendige.offene_faelle`-**Spalte**), sowie die `trg_filmcheck/gutachten/regulierung_benachrichtigung` (ON faelle → droppen mit Tabelle) und alle Funktionen die nur `kanzlei_faelle` referenzieren. Kein Handlungsbedarf. *(Heuristik-Lektion: `~ '\bfaelle\b'` ist in Postgres falsch — Word-Boundary ist `\y`, nicht `\b`; `\m faelle \M` nutzen. Klassifikation hier per gelesenem Body, nicht per ILIKE.)*

---

## 5. DRAFT — Phase-F Pre-DROP Removal-Migration

> ⚠️ **NICHT appliziert. Aaron-gated.** Reihenfolge + Gates beachten. Anwenden ausschließlich via `apply_migration` (Regel 2), danach File als `supabase/migrations/<recorded-version>_cmm49_phase_f_pre_drop.sql` committen (Twin-Drift-Check Schritt 3+4).
>
> **Vorbedingungen (müssen VOR dieser Migration grün sein):**
> 1. Reader-Sweep komplett: 0 `.from('faelle')`-**Reads** (Writer/PC-6 separat).
> 2. CMM-66: 6 faelle-Views faelle-frei (Release-Pipeline #2222).
> 3. 23 Cross-Table-RLS-Policies claims-basiert umgeschrieben (§3b) + Multi-Portal-RLS-Smoke grün.
> 4. §4.2-Funktionen rewritten/repointed (dsgvo, cron_vs_frist, can_access → can_access_claim).

```sql
-- ============================================================================
-- CMM-49 Phase F — Pre-DROP Cleanup (DRAFT 02.06.2026 — via Plugin, Aaron-Go)
-- ============================================================================

-- (A) Toter sv_id-Sync (trg auf SURVIVING claims → bricht claims-Writes post-drop)
DROP TRIGGER IF EXISTS trg_sync_claims_sv_id_to_faelle ON public.claims;
DROP FUNCTION IF EXISTS public.sync_claims_sv_id_to_faelle();
-- Spiegel-fn (Trigger droppt mit faelle): danach orphan
DROP FUNCTION IF EXISTS public.sync_faelle_sv_id_to_claims();

-- (B) claim_id-Backfill-Bridge DROP-SAFE machen (statt hart droppen → kein PC-6-Gate).
--     Wrappt den faelle-Read in einen to_regclass-Guard: post-drop no-op statt Crash.
CREATE OR REPLACE FUNCTION public.derive_claim_id_from_fall()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $fn$
BEGIN
  IF NEW.fall_id IS NOT NULL
     AND (NEW.claim_id IS NULL OR (TG_OP='UPDATE' AND NEW.fall_id IS DISTINCT FROM OLD.fall_id))
     AND to_regclass('public.faelle') IS NOT NULL THEN            -- ← drop-safe guard
    SELECT f.claim_id INTO NEW.claim_id FROM public.faelle f WHERE f.id = NEW.fall_id;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.trg_fn_fill_claim_id_from_fall()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL
     AND to_regclass('public.faelle') IS NOT NULL THEN            -- ← drop-safe guard
    SELECT f.claim_id INTO NEW.claim_id FROM public.faelle f WHERE f.id = NEW.fall_id;
  END IF;
  RETURN NEW;
END $fn$;

CREATE OR REPLACE FUNCTION public.kanzlei_faelle_sync_claim_fall()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'pg_catalog','public' AS $fn$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL
     AND to_regclass('public.faelle') IS NOT NULL THEN
    SELECT claim_id INTO NEW.claim_id FROM public.faelle WHERE id = NEW.fall_id;
  END IF;
  IF NEW.fall_id IS NULL AND NEW.claim_id IS NOT NULL
     AND to_regclass('public.faelle') IS NOT NULL THEN
    SELECT id INTO NEW.fall_id FROM public.faelle WHERE claim_id = NEW.claim_id LIMIT 1;
  END IF;
  RETURN NEW;
END $fn$;

-- (C) Orphan Dead-Code
DROP FUNCTION IF EXISTS public.trg_fn_sync_kanzlei_paket_to_faelle();

-- (D) Legacy 1-arg Delete-RPC (PC-7) — 2-arg ist drop-safe verifiziert
DROP FUNCTION IF EXISTS public.delete_fall_komplett(uuid);

-- (E) §4.2-Rewrites: dsgvo_anonymize_user_data / cron_vs_frist_reminder / can_access_fall
--     → siehe §4.2; je eigener CREATE OR REPLACE mit faelle→claims/claim_parties.
--     (Hier nicht ausformuliert — brauchen Body-Review + Consumer-Grep + eigener Smoke.)

-- (F) Die 23 Cross-Table-RLS-Policies (§3b) als CREATE-OR-REPLACE-Block — je Policy
--     DROP POLICY + CREATE POLICY mit claims-basiertem Ausdruck. Separat, RLS-Smoke-gated.

-- ── Phase G (SEPARATE Migration, eigener Aaron-Go + voller Portal-Smoke) ──
-- DROP TABLE public.faelle CASCADE;   -- droppt 47 eingehende FKs, 3 on-faelle-Policies,
--                                     -- 12 ausgehende FKs, alle faelle-Trigger automatisch.
-- + Legacy-Spalten-Cleanup: leads.konvertiert_zu_fall_id, gutachter_finder_anfragen.konvertiert_zu_fall_id, …
```

### Post-DROP Cleanup (nach Phase G, eigene Migration)
- Harter DROP der drop-safe-geguardeten Bridge-Trigger/Funktionen aus (B), sobald bestätigt 0 fall_id-only-Writes.
- `delete_gutachter_komplett` faelle-UPDATE-Block entfernen.
- Boy-Scout: ~250 `.eq('fall_id')` Sub-Entity-Filter + ~90 `/faelle/${id}`-Links (PC-2/PC-3, Cleanliness).

---

## 6. Zahlen-Summary (für CMM-49-Master)

- **47** eingehende FKs (CASCADE-Drop) · **12** ausgehende · **6** faelle-Views (CMM-66-Lane).
- **26** RLS-Policies referenzieren faelle: **3** auto-drop + **23** Cross-Table **müssen vor Phase G claims-basiert umgeschrieben** werden (RLS-Hard-Blocker, Multi-Portal-Smoke-pflichtig).
- **Funktionen-Layer Hard-Blocker:** 1× sv_id-Sync-Trigger (claims, DROP) + ~50× `derive/fill`-Backfill-Trigger (drop-safe-guarden) + `dsgvo_anonymize` (REWRITE, DSGVO-kritisch) + `cron_vs_frist_reminder` + `can_access_fall` + 1-arg-Delete-RPC.
- **Drop-safe verifiziert:** `delete_fall_komplett(uuid,uuid)` 2-arg (PC-4, #2210) — siehe Smoke-Doc.
- **Nicht in dieser Lane** (koordinieren): CMM-66-Views, b″/CMM-74 (`faelle.aktuelle_phase`/state-machine), PC-1 (Fallakte-Route), embed-Crons.
