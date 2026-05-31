# DB-Lifecycle-Audit & Challenge — Claimondo (Stand 2026-05-31)

> **Auftrag (Aaron):** Die gesamte Datenbank gegen unser Lifecycle-Modell auditen und challengen — was kann optimiert oder vereinfacht werden?
> **Methode:** Read-only gegen Live-PROD (`paizkjajbuxxksdoycev`) + Code-Sweep über die `staging`-Basis. 6 parallele Audit-Dimensionen, jede Findung **adversarial gegengeprüft** (Zahlen re-queryt, file:line nachgelesen). Multi-Agent-Workflow (12 Agenten, ~1,2 Mio Token) + manuelle Synthese.
> **Branch / Worktree:** `kitta/db-lifecycle-audit` (isoliert). **Keine Schema-Änderung** — reines Audit.
> **Scope-Abgrenzung:** CMM-49 (`DROP TABLE faelle`-Strecke, Master-Plan #2118) ist die *gelockte* Migrations-Sequenz. Dieses Audit geht **breiter** (ganzes Schema) und **tiefer beim Modell** (der `§A7`/`§D3`-„duales Lifecycle"-Punkt, der dort noch 🔴 offen ist). Jede Findung ist mit `coveredByCMM49 = yes/partial/no` markiert, damit „schon geplant" von „netto-neu" sauber getrennt ist.
> **Detailberichte:** `./dimensions/D1..D6.md` (die verifizierten Roh-Dimensionen).

---

## 0 · Executive Summary

**Schema-Masse (live):** 149 Tabellen · 14 Views · 3.806 Spalten · 109 Funktionen · 115 Trigger · 16 Enum-Spalten/~12 Enum-Typen · **549 Migrationen** · RLS 149/149. Zentral-Entität: `faelle` = **278 Spalten** (74 Rows), `claims` = **173 Spalten** (75 Rows).

Das Schema ist gesund, aber es trägt die Narben von ~7 Wochen Hochgeschwindigkeits-Iteration: **549 Migrationen** auf 149 Tabellen. Die zwei dominierenden Muster sind **(a) Lifecycle-Fragmentierung** — die „Wo steht ein Fall" ist über *mindestens 8 parallele Vokabulare* und *zwei konkurrierende Schreib-Engines* verteilt, von denen keine aus der anderen ableitbar ist — und **(b) Akkretions-Redundanz** — Tabellen-Familien (5 Reminder-, 6 Notification-, 3 Call-, 4 Kalender-, 17 Billing-Tische), die durch wiederholtes „neu bauen statt erweitern" entstanden sind.

**Die 3 wichtigsten Erkenntnisse:**

1. **Das Lifecycle-Modell ist nicht „claims vs. faelle" — es ist eine 8-fach gespaltene Repräsentation.** `claims.status` (12 CHECK-Werte, live nur `dispatch_done`/`in_bearbeitung`) und `faelle.status` (19-Wert-Enum, live `sv-termin`/`ersterfassung`/`gutachten-eingegangen`) sind **disjunkt** (nur `storniert` geteilt) und werden von **zwei unabhängigen Engines** geschrieben. Ein Fall kann `gutachten-eingegangen` (faelle) sein, während sein Claim `dispatch_done` (claims) ist. Das ist exakt der `§A7`/`§D3`-„Modell-Freeze"-Punkt — und dieses Audit liefert die **Entscheidungsvorlage** dafür (§3).

2. **Echtes Info-Verlust-Risiko beim faelle-Drop.** Die 19 operativen Enum-Zustände (`vs-kuerzt`, `nachbesichtigung-laeuft`, `filmcheck`, `qc-pruefung`, `anschlussschreiben`) haben **keine Heimat** in den 12 `claims.status`-Werten und sind **nicht** in den 18 abgeleiteten `subPhase`-Codes abgebildet. Mind. einer (`vs-kuerzt`) treibt eine **live SLA** (`state-machine.ts:322`). Der Drop darf nicht passieren, bevor diese Zustände re-beheimatet sind — sonst ist es eine stille Regression. (Zusätzlich: das Enum trägt **fraktionale `enumsortorder`**-Werte = eine implizite Phasen-Reihenfolge, die ebenfalls verloren geht.)

3. **Viel netto-neue Vereinfachung jenseits von CMM-49** — die meisten Aufräum-Hebel berühren `faelle` gar nicht: 11 tote Tabellen droppen, 5→1 Reminder-Tische, 6→1 Notification-Bell, 9 SECURITY-DEFINER-Views fixen (3 sofort, faelle-frei), `cron_jobs_audit`-Retention (größtes Objekt der DB), 534/682 ungenutzte Indizes, 92/194 ungeprüfte Status-Spalten, und die `claims`-173-Spalten-Dekomposition (CMM-49 ent-`faelle`t nur, ent-`claims`t nie).

**Sofort-Quick-Wins (netto-neu, faelle-unabhängig, niedriges Risiko):** 3 faelle-freie Views auf `security_invoker` (clears 3 von 9 ERROR-Advisories) · `cron_jobs_audit`-Retention-TTL · 3 Duplikat-Indizes droppen · `AKTUELLE_PHASE_LABELS` (toter 16-Code-Block) löschen · `/api/consent` Rate-Limit · `plz_geo`-Duplikat-Policy droppen.

---

## 1 · Methode & Vertrauensgrad

- **Live-Quelle:** PROD `paizkjajbuxxksdoycev`, nur `SELECT`/`information_schema`/`pg_catalog`. Keine Mutation.
- **Wichtiger Daten-Caveat:** `pg_stat_user_tables.n_live_tup` ist hier **unbrauchbar** (Autovacuum-Stats stale — `cron_jobs_audit` meldet 559 statt real 24.491; `faelle` meldet 0 statt 74). **Alle Row-Counts in diesem Dokument sind echtes `count(*)`**, nicht die Stat-Spalte. (Das ist selbst eine Findung — siehe §6.)
- **Verifikation:** Jede Finder-Findung wurde von einem zweiten Agenten gegengeprüft (Zahl re-queryt, file:line nachgelesen, Verdikt `confirmed/adjusted/overstated/refuted`). Korrekturen sind im Text vermerkt.
- **Vertrauensgrad:** Hoch für Live-SQL-Zahlen und zitierte file:line. Mittel für vollständige Code-Consumer-Zählungen (Grep-basiert, breit aber nicht erschöpfend).

---

## 2 · Das Lifecycle-Modell — Bestandsaufnahme

### 2.1 Die 8 parallelen Repräsentationen (verifiziert)

| # | Repräsentation | Ort | Werte (live) | Status | Quelle |
|---|---|---|---|---|---|
| 1 | **`claims.status`** | claims-Spalte (CHECK, 12 Werte) | `dispatch_done`:72, `in_bearbeitung`:3 | **SSoT-Kandidat** (Writer-Ziel: endzustand/kanzlei-wunsch) | DB |
| 2 | **`faelle.status`** | faelle-Spalte (Enum `fall_status`, 19 Werte) | `sv-termin`:61, `ersterfassung`:12, `gutachten-eingegangen`:1 | **Legacy**, stirbt mit faelle | `state-machine.ts:17` `FALL_STATUS_TRANSITIONS` |
| 3 | **Abgeleitete Phase** `ClaimMainPhase×SubPhase` (4×18) | `lifecycle.ts:getClaimLifecycle` + SQL-Spiegel `v_claim_phase` | erfassung/vollmacht_offen:61, begutachtung/kanzlei_uebergabe:12, erfassung/sa_offen:2 | **Ziel-Modell** (faelle-frei ✅) | Code + View |
| 4 | **`PHASE_VISIBLE_SECTIONS`** (~30 Codes) | `phase-config.ts:54` | n/a (UI-Sektionen) | **redundant**, keyed auf sterbende `fall.status` | sole Consumer `FallContext.tsx:87` |
| 5 | **`FALL_STATUS_LABELS`** (~40 Codes) | `statusLabels.ts:7` | n/a | live (FallStatusBadge), **größte akkretierte Label-Tüte** (Enum + Notion-Matrix + Welle-7 gemischt) | Code |
| 6 | **`AKTUELLE_PHASE_LABELS`** (16 Codes) | `statusLabels.ts:79` | — | **VOLLSTÄNDIG TOT** (Spalte `faelle.aktuelle_phase` + Trigger `map_claim_phase_to_faelle_phase` weg, 0 Code-Consumer) | Code |
| 7 | **`SUBPHASE_VISIBILITY`** (52×5-Rollen-Matrix) | `subphase-visibility.ts:9` | — | **Test-only Dead-Weight** (Host-File live, Konstante nur vom eigenen Test importiert) | Code |
| 8 | **Lead-Doppelvokabular** | `leads.status` (Enum, 6 live) **vs** `leads.qualifizierungs_phase` (text, 9 live) | status: `flow-gesendet`:130/`disqualifiziert`:96/… ; phase: `flow-versendet`:130/`disqualifiziert`:69/`abgeschlossen`:64/… | **widersprüchlich** (96≠69, 72≠8≠64) | DB; nur `qualifizierungs_phase` wird von `autoPhase.ts:14` gepflegt |

> Hinweis: Sub-Entity-Status (`auftraege.status`, `kanzlei_faelle.status`, `gutachten.status`, `repairs.status`) sind **keine** redundanten Vokabulare — sie sind die **Inputs**, aus denen `v_claim_phase` die Phase ableitet, und müssen bleiben.

### 2.2 Die zwei Schreib-Engines (der Kern-Drift)

- **Engine A (Legacy):** `transitionFallStatus()` (`state-machine.ts`) — validiert über die 19-Wert-Adjazenz `FALL_STATUS_TRANSITIONS`, schreibt `faelle.status`, splittet Duplikat-Spalten via `splitOrKeepFaelleUpdate` auf claims — **schreibt aber nie `claims.status`**.
- **Engine B (Ziel):** `endzustand-actions.ts` / kanzlei-wunsch — schreibt die 12 `claims.status`-Werte direkt.
- **Folge (live verifiziert):** 74/74 Rows haben unterschiedlichen `status` zwischen faelle und claims; 43/74 unterschiedliches `status_changed_at`. Die Vokabulare sind disjunkt außer `storniert`.
- **`autoPhase.checkFallAutoPhase`** treibt Engine A weiter (liest `v_faelle_mit_aktuellem_termin`, rechnet 19-Enum-Ziel, ruft `transitionFallStatus`) — **aber nur 2 Caller**, beide fire-and-forget (`filmcheck.ts:107`, `kanzlei-paket.ts:400`). Also schmal, nicht breit verdrahtet → günstig zu retiren.

---

## 3 · CHALLENGE: Wie man das Lifecycle-Modell auf EINE Quelle kollabiert (Entscheidungsvorlage für den Modell-Freeze)

Das ist die Kernfrage des Audits und der noch offene `§A7`/`§D3`-Punkt. Antwort in drei Teilen:

### 3.1 Das Info-Verlust-Problem zuerst lösen (HARD GATE vor dem Drop)

Die 19-Enum-Werte kodieren **operative Granularität, die das 4×18-Modell heute nicht trägt:**

| Enum-Zustand (faelle) | Heutige Konsequenz | Heimat im Ziel-Modell? |
|---|---|---|
| `vs-kuerzt` | **live SLA** `kanzlei_kuerzung_antwort` (3 WT, `state-machine.ts:322`) + `vs_kuerzung_grund` | ❌ kein `subPhase` |
| `nachbesichtigung-laeuft` | Side-Quest-Sichtbarkeit | teilw. (`auftraege.typ='nachbesichtigung'`) |
| `filmcheck` / `qc-pruefung` | QC-Gating | ❌ |
| `anschlussschreiben` | `anschlussschreiben_am`-Timestamp | ❌ (lebt auf `kanzlei_faelle`) |
| `besichtigung` / `begutachtung-laeuft` | Begutachtungs-Detailphase | teilw. via `auftraege.status` |

**Empfehlung:** Vor `§D3`/`§A7` jeden der 19 Zustände explizit re-beheimaten (auf `kanzlei_faelle.status` / `gutachten.status` / `auftraege` / claims-Flag) **oder** bewusst als „nicht mehr abgebildet" abnehmen. Wichtig: diese Zustände werden auch von **Webhook-Pfaden** (LexDrive/VS, `vs_kuerzt` Direktschreibung) gesetzt, nicht nur von der State-Machine — die Re-Beheimatung muss die Webhook-Writer mit abdecken. **+ Fraktionale `enumsortorder`** (1.5/1.75/8.625…) = eine implizite monotone Phasen-Reihenfolge; falls eine Query `ORDER BY status` macht, vor Drop greppen und in eine subPhase-Sortmap portieren.

### 3.2 Ziel-End-State (verifiziert, korrigiert)

> **2 gespeicherte Lifecycle-Status-Felder + N Sub-Entity-Status (bleiben) + Phase rein abgeleitet.**

- **Gespeichert:** `claims.status` (Claim-Level-Terminal/VS-Override) + `leads.qualifizierungs_phase` (Lead-Trichter). Die Sub-Entity-Status (`auftraege.status`, `kanzlei_faelle.status`, `gutachten.status`) **bleiben** — sie sind die Ableitungs-Inputs, nicht redundant.
- **Abgeleitet (nie gespeichert):** mainPhase/subPhase via `getClaimLifecycle` ↔ `v_claim_phase` (Parity-Gate). Bereits faelle-frei ✅.
- **Zu eliminieren:** `faelle.status` (mit faelle) · `AKTUELLE_PHASE_LABELS` (tot) · `SUBPHASE_VISIBILITY`-Konstante (test-only) · `PHASE_VISIBLE_SECTIONS` (auf abgeleitete Phase umstellen) · Lead-Doppel (`lead_status`-Enum zugunsten `qualifizierungs_phase` ODER umgekehrt — eine Quelle).

### 3.3 Konkrete netto-neue Schritte (jenseits CMM-49)

| Schritt | Was | Aufwand | coveredByCMM49 |
|---|---|---|---|
| L1 | `dispatch_done`/`in_bearbeitung`-Semantik in `lifecycle.ts` dokumentieren (sie sind 100% der Live-Rows, aber im Phasenmodell unsichtbar — by design) | xs | no |
| L2 | `getVisibleSections` (phase-config.ts) auf `ClaimMainPhase/SubPhase` umstellen statt auf `fall.status` → letzter Live-UI-Consumer von `fall.status` weg | m | no (entsperrt §E) |
| L3 | `AKTUELLE_PHASE_LABELS` löschen (16-Zeilen toter Block) | xs | partial |
| L4 | `SUBPHASE_VISIBILITY` + `PHASE_META` + zugehörigen Test löschen; `buildClaimPhasePipeline`/`substateLabelForRolle` behalten | m | no |
| L5 | `checkFallAutoPhase` retiren; Task-Trigger (`triggerQcTask`/`triggerKanzleiPaketTask`) auf die Sub-Entity-Writer umhängen | m | partial (§D3) |
| L6 | `v_claim_phase`-Parity gegen `auftraege.status`-Enum-Wachstum härten (CHECK/Test: jeder `auftraege.status` ∈ `ClaimSubPhase`) | s | no |
| L7 | Lead-Doppelvokabular auflösen (eine Quelle); Achtung: `lead_status` ist ein Postgres-ENUM → Drop = mehr DDL als Text-Spalte | m | no |
| L8 | 19→subPhase-Mapping + SLA/Webhook-Re-Beheimatung (der Hard-Gate aus §3.1) | l | partial (§A7/§D3) |

---

## 4 · Schema-weite Vereinfachung (netto-neu, faelle-unabhängig)

### 4.1 Tote / Stub-Tabellen

**11 wirklich verwaiste Tabellen** (0 Rows **und** 0 echte `.from()`-Refs, Grep airtight): `communities`, `community_memberships`, `sv_community`, `sv_buero`, `sv_buero_memberships`, `sv_organisation`, `sv_organisation_memberships`, `sv_organisation_laeufer_reports`, `werkstaetten`, `vehicle_ownership_history`, `gutachten_fotos`.
→ **DROP-Kandidaten** (MEDIUM, null Blast-Radius). Ausnahme: `vehicle_ownership_history` an CMM-50 gated (parken).
→ Die 8 `sv_buero*`/`sv_organisation*`/`communit*`-Tische sind das **verwaiste normalisierte Design** der Community/Org-Feature; die **live** Feature läuft flach auf `organisationen` + `community_leaderboard` + Cron. `community_leaderboard` hat aber **0 Rows** → Cron evtl. dormant (prüfen: VPS-Crontab, nicht vercel.json).

**`cron_jobs_audit`: 24.491 Rows, unbounded** — mit Abstand größtes Objekt der DB (2,8 MB Tabelle + 3,2 MB Indizes; `idx_cron_audit_job_started`=2.112 kB + pkey=1.104 kB sind die zwei größten Indizes überhaupt). → **Retention-TTL** (z.B. tägl. Cron `DELETE … WHERE started_at < now() - interval '30 days'`). Größter Einzel-Speicher-Win, faelle-unabhängig.

### 4.2 Redundanz-Cluster (überlappende Tabellen-Familien)

| Cluster | Befund | Empfehlung |
|---|---|---|
| **5 Reminder-Tische** | `abrechnung_reminders`/`kanzlei_abrechnung_reminders`/`sv_payment_reminders` sind **strukturell identische** „sent-logs" (nur Parent-FK + Timestamp-Name unterscheiden; `gesendet_am` vs `versendet_am`-Drift). `termin_reminders`/`task_reminders` sind echte Retry-Queues. | 3 triviale → eine polymorphe `reminders(entity_type, entity_id, reminder_typ, gesendet_am, details jsonb)` + partieller Unique-Index. Retry-Queues behalten. |
| **Call-Tische** | `calls` ist SSoT (read+write aus 6 Files inkl. `aircall/webhook`). `aircall_calls`+`matelso_calls` = verwaiste Landing-Zones. **Zwei parallele Aircall-Ingest-Pfade** (`aircall/webhook→calls` vs `webhooks/aircall/inbound→aircall_calls`) — einer ist tot. | `calls` + `provider`+`raw_payload jsonb` als einzige Quelle; toten Webhook-Handler löschen (vorher prüfen: welche URL postet Aircall real?). |
| **6 Notification/Message-Tische** | Kein einheitliches „wer sieht die Glocke"-Modell: `benachrichtigungen`:2598, `mitteilungen`:237, `gutachter_mitteilungen`:**0 (SV-Glocke rendert in PROD leer!)**, `nachrichten`:7 (Chat, behalten), `notification_events`:57 + `_deliveries`:115 (Outbox, behalten). | `mitteilungen` (ausdrucksstärkste Shape) = In-App-Bell-SSoT; `gutachter_mitteilungen` (0) reinfalten; `benachrichtigungen` (2598) Backfill planen. |
| **Billing-Positionen** | **Nur 2 von 4** mergebar: `abrechnung_positionen` + `kanzlei_abrechnung_positionen` teilen `position_nr`. `gutachter_abrechnungspositionen` (lead-pricing) + `embed_abrechnung_positionen` (anfrage/termin, `einzelpreis_eur`) sind genuin anders. | **Keine** 4-Tische-Fusion. Höherwertiger Win: `zahlungseingaenge`/`zahlungspositionen`→`claim_payments` (siehe unten). |
| **Parteien** | `parteien`:0 Rows, von 4–7 Live-Sites für Rolle `gegner`/`kanzlei` gelesen → **leeres Rendering heute** (Admin-Kanzlei-Board, SV-Fall-Detail-Partei-Panel, Kanzlei-PDF-Versicherer-Feld blank). **Aber:** `claim_parties` (72 Rows) hat **nur `geschaedigter`, null `gegner`/`kanzlei`** → ein Repoint würde auch leer rendern. Das ist CMM-49 §A (gegner/halter beheimaten), kein Reader-Swap. | Als §A-**Blocker** führen (nicht §C-Reader-Sweep). `parteien` selbst (0 Rows) droppbar nach Reader-Fix; Drop killt `partei_rolle`+`vertrag_typ`-Enums gratis. |
| **4 Kalender-Tische** | `gutachter_termine`:18 (kanonisch), `termine`:0 (live Writer, fall_id-keyed → §E-Breaker), `admin_termine`:9, `kanzlei_admin_termine`:0. | Auf `gutachter_termine` (trägt `claim_id`) konsolidieren. `gutachter_termine` trägt zudem **14 Reminder-Flag-Spalten** (`erinnerung_*_gesendet`/`reminder_*_sent_at`) — gehören in `termin_reminders`-Rows. |
| **`personenschaden_personen`** | 0 Rows, überlappt `claim_parties`-Verletzungsspalten (`hat_personenschaden`/`verletzungsart`/…). | In `claim_parties` (Rolle) falten oder 1:N-Split explizit begründen. |

> **Cross-cutting:** 5 Tische sind **0 Rows ABER live beschrieben** (`zahlungseingaenge`, `aircall_calls`, `matelso_calls`, `gutachter_mitteilungen`, `personenschaden_personen`). Ein „Coverage=0 = tot"-Heuristik wäre falsch — jeder Drop muss auf **Writer-Entfernung** gaten, nicht auf Row-Count. Mehrere dieser fall_id-keyed Writer **brechen still bei §E** (fall_id-Tod): `termine`, `zahlungseingaenge`/`zahlungspositionen`, `regulierungs_klassifizierung`, `reklamationen`, `personenschaden_personen` → in CMM-49 §D Writer-Migration-Scope sicherstellen.

### 4.3 Hygiene & Konsistenz

- **92 von 194** `status`/`typ`/`phase`/`rolle`-TEXT-Spalten haben **keinen CHECK** — inkl. der Lifecycle-Feeder `auftraege.status`, `gutachten.status`, `kanzlei_faelle.status`, `repairs.status`. → Policy ratifizieren: „`text` + `CHECK(col = ANY(ARRAY[...]))`", `ADD CONSTRAINT … NOT VALID` dann `VALIDATE` (kein Table-Rewrite). Feeder zuerst.
- **ENUM-vs-CHECK-Inkonsistenz:** 16 ENUM-Spalten/~12 Enum-Typen (nicht 5) vs. CHECK-Strings überall sonst. Policy: **keine neuen Postgres-ENUMs** (schwer zu ALTERn). Konversions-Surface größer als gedacht; `user_role` = RLS-sensitive Priorität; `fall_status`/`parteien.*` sterben eh mit den Table-Drops.
- **Naming-Split:** `created_at`×92 / `updated_at`×53 vs. `erstellt_am`×27 / `aktualisiert_am`×4 / `geaendert_am`×1; **31 Tische mit deutschen** Timestamps, 10 mixed-convention. → Freeze + Boy-Scout-De-Mix. (`benachrichtigungen` hat `created_at` **und** `erstellt_am` auf allen 2598 Rows — redundanter Mirror, **kein** Bug; einen droppen.)
- **FK-Lücken:** 97/405 `*_id`-Spalten ohne FK (24%). ON-DELETE: CASCADE 128 / SET NULL 106 / NO ACTION 83 / RESTRICT 9. → ~10 interne Spalten FK nachziehen (`NOT VALID`→`VALIDATE`); die 83 NO-ACTION vor dem faelle-CASCADE + für `dsgvo_anonymize_user_data` auditieren.
- **`claims`-173-Spalten-God-Table:** 7 Aspekt-`_status`-Spalten (`vollmacht_status`, `vollmacht_pruefung_status`, `zb1_status`, `unfallmitteilung_status`, `polizeibericht_status`, `marketing_provision_status`, `kanzlei_provision_status`) überlappen die Live-Subsysteme `pflichtdokumente` (20 Spalten) / `claim_parties` (72 Rows) / Provisions-Tische. → Doku-Status in `pflichtdokumente` + `v_claim_doc_status` falten; Provisions-Status auf `makler_provisionen.status`/`provisionen_maik.status`. **CMM-49 ent-`faelle`t nur, ent-`claims`t nie** — das ist netto-neu.
- **Latenter Bug:** `polizeibericht_status` existiert **nur** auf claims, steht aber in `claim-duplicate-columns.ts:44` → ein faelle-UPDATE darauf würde „column does not exist" werfen (oder ist guarded). Greppen.

---

## 5 · Performance

PROD hat ~75 Claims — die meisten Advisories sind **strukturell** (beißen at-scale), nicht akut. Sequenz: billige Struktur-Wins jetzt, Bulk-Index-Prune **nach** faelle-Drop.

- **534/682 Indizes ungenutzt (78%).** Index-Footprint > Tabellen-Footprint auf write-hot Tischen: `leads` 208 kB Tab / 424 kB Idx, `gutachter_termine` 8 kB / 216 kB (**~27×**, 18 Rows), `gutachter_finder_anfragen` 328 kB / 648 kB, `claim_parties` 32 kB / 216 kB. → **Bewusst** prunen (Unique/Constraint behalten, jeden Kandidaten greppen). faelle' 19 Indizes sterben eh.
- **302 `multiple_permissive_policies`** — der Advisor untertreibt: **5 Tische mit 4-tiefen SELECT-Stacks** (`fall_dokumente`, `gutachter_termine`, `leads`, `pflichtdokumente`, `timeline`), getrieben von der geteilten `staff_fall_scoped` ALL-Policy, die auf *jeden* Befehl ODERt. Jede Row wird gegen das OR aller gestackten Prädikate getestet (mehrere mit `EXISTS(... profiles ...)`-Subselects). → **`staff_fall_scoped` einmal konsolidieren** senkt die +1-Tiefe auf allen 5 gleichzeitig; idealerweise im selben Pass wie CMM-49 §F (das die Prädikate eh von `fall_id`→`claim_id` umschreibt — sonst Doppelarbeit).
- **5 `auth_rls_initplan`** (bare `auth.*()` per-Row): `anfragen`(×2), `embed_abrechnung_positionen`, `embed_sites`, `matelso_calls`. → `(SELECT auth.uid())` wrappen, mechanisch.
- **5 unindexte FKs** (2 auf dem faelle-DROP-CASCADE-/Re-Key-Pfad: `embed_abrechnung_positionen.termin_id`, `claims.kanzlei_abrechnung_id`). → Covering-Indizes.
- **3 echte Duplikat-Indizes** droppen: `content_translations_lookup_idx`, `idx_fall_read_state_user`, `idx_ocr_runs_gutachten`.
- **`v_claim_full`**: 12-`jsonb_agg`-Mega-View auf dem Einzel-Claim-Read-Pfad (26 Consumer inkl. 6 Crons). Spalten-Whitelist prunt Output, nicht die In-View-Aggregate. → In Scalar-Core-View + On-Demand-Sub-Fetches splitten; in §B-Re-Base falten (nicht nur faelle→claims-Swap, sonst überlebt der Read-Pfad-Cost den Drop).
- **Sauber:** Kein Dead-Tuple-Bloat (max 39), keine Tabelle ohne PK.

---

## 6 · Security & RLS

- **9 SECURITY-DEFINER-Views (ERROR-Advisory)** umgehen Base-Table-RLS ohne Self-Filter:
  - `faelle_sv_view`+`faelle_kunde_view` → **sterben in §E** (nichts tun).
  - `v_claim_listing`/`v_claim_phase`/`v_claim_full`/`v_faelle_mit_aktuellem_termin` → §B-Re-Base **+ `security_invoker=on`** im selben Migration.
  - **`v_claim_timeline`/`v_claim_sv`/`v_gutachten_werte` sind faelle-frei → `security_invoker=on` SOFORT** (netto-neuer Quick-Win, clears 3 von 9 ERRORs, faelle-unabhängig).
- **CMM-49 B2 (faelle-CASCADE-RLS-Verlust) re-derived:** **24 Policies / ~14–17 Tische** referenzieren faelle; CASCADE-Drop entzieht still SV/Kunde/Kanzlei/Makler-Read-Pfade. **Mechanischer Fix:** `can_access_fall`→`can_access_claim` (Twin existiert bereits, auth=true). **Prerequisite:** `claim_id`-Backfill vollständig auf `fall_dokumente`/`pflichtdokumente`/`timeline`/`tasks`/`personenschaden_personen`/`claim_mietwagen`/`ki_gespraeche`/`vehicle_ownership_history`/`vehicles` — sonst stiller Lockout. (`coveredByCMM49: yes`, aber verifiziert.)
- **🔴 `personenschaden_personen` hat `ALL public`-Policy** (faelle-gated) → volle read+write für `public` auf **Personenschaden-Daten** (DSGVO special-category-nah). Bei §C-Re-Base auf `claims`/`claim_parties` mit `is_claim_user_party()`-Gate umschreiben + klären, ob `ALL public` je beabsichtigt war. Ebenso `fall_dokumente "SV eigene Fall-Dokumente"` = `ALL public` (SV-Doku-**Write**-Pfad, nicht nur Read).
- **`/api/consent`**: unauthentifiziert (`/api` ist `publicPaths`-Prefix, `middleware.ts:161/241`), **unthrottled**, Service-Role-INSERT → DSGVO-Log als Spam/DoS-Verstärker. `consent_records`:65 Rows; anon hält volle DML-Grants (INSERT/UPDATE/DELETE/TRUNCATE). → Rate-Limit (`check_gfa_rate_limit`-RPC existiert), Inputs validieren, überflüssige Grants droppen (nur INSERT genutzt).
- **`content_translations`**: RLS an, **0 Policies**, aber anon/authenticated halten volle DML-Grants → Default-Deny-Lockout + over-broad Grants. Vor portal-i18n-Launch fixen (`SELECT USING(true)` + Write-Grants revoken).
- **`apply_gutachten_ocr` + `derive_claim_id_from_fall`** anon-EXECUTE, aber **alle Caller nutzen Service-Role** → Revoke ist Zero-Risk-Hygiene (LOW). `convert_embed_anfrage_zu_lead` ist eine **No-Arg-Trigger-Funktion** → kann keine IDs annehmen, Revoke rein defensiv.
- **`leadpreise_tabelle`** von **jeder** authenticated Rolle lesbar (SV/Makler/Kunde sehen Lead-CPL-Pricing) → prüfen, ob beabsichtigt (sonst `is_staff()`).
- **`plz_geo`** Duplikat-Policy (`plz_geo_read` + `plz_geo_read_authenticated`) → eine droppen (clears 1 Advisory).
- **Sauber:** `func_search_path_mutable` = 0. RLS 149/149 aktiviert.

---

## 7 · Priorisierte Roadmap

### A · Netto-neue Quick-Wins (faelle-unabhängig, jetzt, niedriges Risiko)
| # | Aktion | Aufwand | Dim |
|---|---|---|---|
| A1 | 3 faelle-freie Views (`v_claim_timeline`/`v_claim_sv`/`v_gutachten_werte`) → `security_invoker=on` (clears 3/9 ERRORs) | s | D6 |
| A2 | `cron_jobs_audit`-Retention-TTL (größtes DB-Objekt) | s | D5 |
| A3 | 3 Duplikat-Indizes droppen | xs | D5 |
| A4 | `AKTUELLE_PHASE_LABELS` löschen (tot) | xs | D1 |
| A5 | `/api/consent` Rate-Limit + Input-Validierung + Grant-Cleanup | s | D6 |
| A6 | `plz_geo`-Duplikat-Policy droppen | xs | D6 |
| A7 | 5 `auth_rls_initplan`-Policies `(select auth.uid())`-wrappen | xs | D5 |
| A8 | `content_translations` Grants/Policy fixen (vor i18n-Launch) | xs | D6 |

### B · Netto-neue Vereinfachung (mittelgroß, eigene Tickets)
| # | Aktion | Aufwand | Dim |
|---|---|---|---|
| B1 | 11 tote Tabellen droppen (8 Community/Org-Shells + werkstaetten + gutachten_fotos; vehicle_ownership_history parken) | m | D2 |
| B2 | 5→1 Reminder-Tische (polymorphe `reminders`) | m | D3 |
| B3 | 6→1 In-App-Bell (`mitteilungen` SSoT) | l | D3 |
| B4 | Call-Tische konsolidieren + toten Aircall-Webhook-Pfad killen | l | D3 |
| B5 | 4→1 Kalender (`gutachter_termine`) + 14 Reminder-Flags → `termin_reminders` | m | D2/D3 |
| B6 | `claims`-Dekomposition (Aspekt-Status → `pflichtdokumente`/Provisions-Tische) | l | D4 |
| B7 | CHECK-Constraints auf 92 ungeprüfte Status-Spalten (Feeder zuerst) | l | D4 |
| B8 | Index-Prune (write-hot Tische bewusst) | m | D5 |

### C · In CMM-49-Phasen einklinken (nicht doppeln — koordinieren)
| # | Aktion | CMM-49-Phase |
|---|---|---|
| C1 | `getVisibleSections`/`PHASE_VISIBLE_SECTIONS` auf abgeleitete Phase (entsperrt fall_status-Tod) | §E |
| C2 | `staff_fall_scoped`-Konsolidierung im fall_id→claim_id-RLS-Rewrite | §F |
| C3 | `v_claim_full`-Split im View-Re-Base (nicht nur Spalten-Swap) | §B |
| C4 | `parteien` gegner/kanzlei als §A-**Blocker** (nicht §C-Reader) | §A |
| C5 | `personenschaden_personen` `ALL public` → claim-gescoped beim Re-Base | §C |
| C6 | 0-Row-aber-live-Writer-Tische in Writer-Migration-Scope ziehen | §D |

### D · Modell-Freeze-Entscheidungen (Aaron-gated, §3) — **die Kernvorlage**
Siehe §3.3 (L1–L8). Kern: 19-Enum-Granularität re-beheimaten **vor** §D3/Drop (Hard-Gate), Lead-Doppel auflösen, autoPhase retiren, Parity gegen Sub-Entity-Enum-Wachstum härten.

---

## 8 · Offene Entscheidungen für Aaron

1. **Lifecycle (Kern):** Sollen die granularen Operativ-Zustände (`vs-kuerzt`, `nachbesichtigung-laeuft`, `filmcheck`, `qc-pruefung`, `anschlussschreiben`) post-Drop erhalten bleiben? Die live Kürzungs-SLA sagt **ja** für `vs-kuerzt`. Wenn ja → `§D3` muss sie auf Sub-Entities re-beheimaten, nicht mit faelle sterben lassen.
2. **`claims.status` dual-purpose** (Dispatch-Flag `dispatch_done`/`in_bearbeitung` + Lifecycle-Terminal) lassen+dokumentieren, oder `claims.work_state` rausspalten? 100% der Live-Rows sitzen auf der Dispatch-Hälfte.
3. **Lead-Doppel:** `lead_status`-Enum *oder* `qualifizierungs_phase`-Text als einzige Quelle? (Enum-Drop = mehr DDL.)
4. **`personenschaden_personen` `ALL public`** auf Personenschaden-Daten — je beabsichtigt? (DSGVO.)
5. **`leadpreise_tabelle`** für alle authenticated Rollen lesbar — beabsichtigt oder staff-only?
6. **ENUM→CHECK-Policy** ratifizieren — und Scope: nur State/Rolle-Enums oder auch Package/Kategorie-Enums (`betreuungspaket`/`bkat_unfallart`/`sv_paket_typ`/…)?
7. **`cron_jobs_audit`-Retention:** Compliance-Grund für >30 Tage Cron-Telemetrie, oder unbounded = Versehen?
8. **`community_leaderboard`-Cron** (0 Rows produziert) — scheduled/dormant? (VPS-Crontab prüfen.)

---

## 9 · Koordination (parallele Sessions)

- **`§A7`/`§D3`-Lifecycle** ist cross-session (monika-embed, embed-b, dispatch). Die `embed-b-wa-inbound`-Session hat einen **Lane-Split bestätigt**: `fall_status`-Ablöse (`state-machine.ts`/`v_claim_phase`/19-Wert-Auflösung) = **CMM-49 „nach Modell-Freeze"**. → **Dieses Audit (§3) ist die Freeze-Vorlage**, keine konkurrierende Strecke.
- Dieses Audit ist **read-only/Doc** → kollidiert mit keiner aktiven Code-Session. Branch `kitta/db-lifecycle-audit` isoliert.
- Quelle der gelockten Migrations-Sequenz: `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md` (#2118).

---

## 10 · Anhang — verifizierte Dimensionsberichte
`./dimensions/D1-lifecycle-drift.md` · `D2-dead-stub-tables.md` · `D3-redundancy-clusters.md` · `D4-schema-hygiene.md` · `D5-performance.md` · `D6-security-rls.md`
(Jeweils Finder-Findung + adversariales Verdikt mit re-queryten Zahlen und file:line.)
