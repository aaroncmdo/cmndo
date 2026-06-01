# CMM-49 — `DROP TABLE faelle` Endspiel: Bridge-View-Strategie

**Datum:** 2026-05-31 · **Master:** CMM-44 (claims-as-SSoT) · **Ziel-Ticket:** CMM-49 (`DROP TABLE faelle`)
> ⛔ **ÜBERHOLT / VERWORFEN (Aaron, 31.05.).** Diese Bridge-Strategie wurde zugunsten des **Komplett-Removal** verworfen: `faelle` soll restlos weg (kein bleibender Kompat-View), `fall_id` stirbt mit. **Verbindlich ist stattdessen:** `docs/superpowers/plans/2026-05-31-cmm49-faelle-komplett-removal-master-plan.md`. Dieses Dokument nur noch als Abwägungs-Historie aufbewahren.

**Status:** ~~DESIGN~~ → VERWORFEN. Ersetzt durch den Komplett-Removal-Master-Plan.
**Baut auf:** `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (6-Dimensionen-Audit + 30.05.-Revalidierung — **das autoritative Inventar**, hier nicht dupliziert) · diese Session: B1/B2/B4 + CMM-64 PR3 erledigt.

---

## 0 · Warum dieser Spec

Der 29.05.-Audit hat die faelle-Drop-Blocker vollständig vermessen und implizit **Voll-Repoint** angenommen: alle ~338 GENUINE `.from('faelle')`-Reader + ~40 Writer auf claims migrieren, dann die 6 Views repointen, dann droppen (Audit Phase 4.3 = „Reader-Sweeps pro Portal, ~2-3 Wochen"). Dieser Spec wählt einen **anderen Weg für die Reader** — eine **Kompatibilitäts-View `faelle`** — und beschreibt, wie das die Audit-Phasen 4/5/6 verändert. Writer-Migration, View-Repoint, Trigger/Funktionen/Policies bleiben Pflicht (Inventar siehe Audit §3.2–§3.6).

## 1 · Ausgangslage (gemessen, diese Session)

**Schon erledigt Richtung Drop:**
- **B4 FK-Re-Key** (#2105): 42/47 Kind-Tabellen haben jetzt `claim_id` + `trg_derive_claim_id`-Trigger. *Die FK-Seite der §7.1-Architektur ist damit additiv vorbereitet.*
- **B2 RLS** (#2108): `can_access_claim()` claim-nativ; `can_access_fall` = **0 Policy-Consumer**; faelle-RLS 100% claim_id-basiert.
- **B1 vehicles-Backfill** (#2112, merged): vehicles aus faelle-FIN befüllt (1 Row — Rest ohne valide FIN).
- **CMM-64 PR3** (#2114): v_claim_full (5) + v_faelle_mit_aktuellem_termin (12) vorschaden/cardentity-Reads faelle-entkoppelt (EXCEPT-0/0).
- vollmacht_datum-Bug (#2110, merged).

**Gemessene Consumer-Fläche (heute):**
| Schicht | Menge | Quelle |
|---|---:|---|
| `.from('faelle')`-Reader | ~338 GENUINE (417 statisch) | Audit §R.4 |
| faelle-Writer (update/insert/delete) | ~40 Sites + Helper `splitOrKeepFaelleUpdate` | Audit §3.6 + diese Session |
| Views FROM/JOIN faelle | 5 (v_claim_timeline schon frei) | Audit §R.5 |
| Trigger ON faelle | 7 (4 funktional) | Audit §R.2 |
| Cross-Table-Funktionen/Crons lesen/schreiben faelle | 22 Fn (19 SECDEF) + Crons | Audit §R.2 |
| RLS-Policies mit faelle-Ref | 29 in 17 Tabellen | Audit §R.2 |
| Kind-Tabellen mit `fall_id`-FK | ~13 (auftraege/kanzlei_faelle/pt/timeline haben claim_id) | Audit §3.4 + B4 |

## 2 · Strategie: Bridge-View + Writer-Migration

### 2.1 Die Entscheidung
**Reader:** statt ~338 Sites einzeln auf claims zu migrieren, wird `faelle` nach dem Table-Drop als **VIEW** über `claims` (+ Sub-Tables) neu angelegt. Die Reader bleiben **unverändert** und lesen die View.
**Writer:** die View ist read-only → die ~40 Writer werden explizit auf `claims`/Sub-Tables migriert (kein `INSTEAD OF`-Trigger-Shim — der wäre fragil + ein stiller Billing/Status-Verlust-Risiko).

### 2.2 Was die Bridge spart vs. kostet
| | Voll-Repoint (Audit-Plan) | Bridge (dieser Spec) |
|---|---|---|
| ~338 Reader migrieren | **ja** (Phase 4.3, Wochen, Regressions-Risiko in Webhooks/Crons/Billing) | **nein** — lesen die View |
| Spalten-Homing | ja | **ja** (View kann nur mappen, was eine Heimat hat — unvermeidlich) |
| ~40 Writer migrieren | ja | ja |
| 6 Views repointen | ja | ja (oder über Bridge — §4, 🔶) |
| Trigger/Funktionen/Policies | ja | ja |
| Endzustand | faelle weg, kein Kompat-Layer | faelle bleibt als View-Name (Tech-Debt) |
| Neue Risiken | — | PostgREST-Embeds (§2.4), Nested-View-Perf, legacy_fall_id |

**Netto:** Die Bridge eliminiert den größten + riskantesten Brocken (Reader-Churn über Webhooks/Crons/Billing), zum Preis eines permanenten Kompat-Layers + dreier handhabbarer Risiken. Bei ~338 Readern in Kern-Pfaden ist das der bessere Hebel.

### 2.3 🔶 ENTSCHEIDUNG Q2 — `fall_id`-Erhaltung (= Audit §7.1 FK-Architektur)
Reader filtern auf `faelle.id` (`.eq('id', fallId)`); `faelle.id ≠ claims.id` bei 73/74. Die Bridge braucht eine `id`-Spalte mit den **alten faelle.id-Werten**.
- **Empfehlung A:** `claims.legacy_fall_id uuid` additiv + Backfill aus `faelle.id`. Bridge: `SELECT c.legacy_fall_id AS id, c.id AS claim_id, … FROM claims c`. Die ~13 Kind-`fall_id`-Spalten bleiben als Legacy-UUID (referenzieren `legacy_fall_id`). **Kein Route-Switch, kein Reader-Anfassen.** `fall_id` lebt als claims-Spalte weiter.
- **Alternative B:** Voll claim_id-only — Kind-`fall_id` droppen (Re-Key ist da, B4) + `/faelle/[id]`-Route auf claim.id (CMM-28) + alle fall_id-Reader. Saubrer, aber großer Zusatz-Scope, der den Bridge-Vorteil teilweise auffrisst.
- *Empfehlung: A* (passt zur Bridge-Logik; B kann später inkrementell nachziehen).

### 2.4 🔶 Bekanntes Bridge-Risiko — PostgREST-Embeds
Mehrere Reader nutzen Resource-Embedding durch faelle: `.from('faelle').select('claims:claim_id(...)')`. PostgREST-Embeds brauchen eine **erkennbare FK-Relation** — eine View hat keine. Optionen: (a) PostgREST **computed relationships** für die Bridge definieren, (b) die betroffenen Embed-Reader (Audit zählt ~18 „FP-Embed", real-relevant Teilmenge) doch migrieren, (c) Embed-Daten in die Bridge-View-Spalten flach mappen. → Vor Bridge-Bau: Embed-Reader exakt zählen + Pfad wählen. **Das ist der schärfste Bridge-Vorbehalt** — wenn es viele Embed-Reader sind, schrumpft der Bridge-Vorteil.

## 3 · Bridge-Architektur

```sql
-- Nach Homing + Writer-Migration + Drop:
CREATE VIEW public.faelle
  WITH (security_invoker = true)   -- claims/Sub-Table-RLS greift für die Reader
AS
SELECT
  c.legacy_fall_id            AS id,          -- §2.3 Q2
  c.id                        AS claim_id,
  c.lead_id, c.status, c.sv_id, c.created_at, -- claims-native (CMM-60 etc.)
  cp_g.adresse_*              AS kunde_*,      -- claim_parties (CMM-63)
  COALESCE(veh.*, NULL)       AS fahrzeug_*,   -- vehicles (CMM-50)
  cp_gegner.* / claims.*      AS gegner_*,     -- 🔶 Homing §6
  c.organisation_id?, c.dispatch_id?          -- 🔶 Ownership §6
  …                                           -- jede heute gelesene Spalte
FROM public.claims c
  LEFT JOIN public.vehicles veh ON veh.id = c.vehicle_id
  LEFT JOIN LATERAL (… claim_parties geschaedigter …) cp_g ON true
  …;
```

- **`security_invoker = true`** ist Pflicht (sonst läuft die View als Owner = RLS-Bypass). Sentinel-Test: anon/Rollen-Read auf `faelle` muss dasselbe liefern wie heute (Audit §R.7 Anon-RPC-Sentinel-Pattern).
- **Read-only.** Alle Schreibpfade gehen über die Writer-Migration (§5).
- **Spalten-Vollständigkeit:** Die View MUSS jede Spalte exposen, die irgendein Reader heute selektiert (sonst TS/Runtime-Fehler). Quelle = der GENUINE-Reader-Spalten-Schnitt (Audit §R.4 + ein gezielter Spalten-Scan vor Bau).

## 4 · 🔶 ENTSCHEIDUNG Q1 — Die 6 internen Views

v_claim_full, v_faelle_mit_aktuellem_termin, faelle_kunde_view, faelle_sv_view, v_claim_listing (v_claim_timeline ist schon frei).
- **Empfehlung A:** **direkt auf claims repointen** (PR3-Pfad fortsetzen, EXCEPT-0/0 pro View). Sie gehen NICHT über die Bridge. Vorteil: keine Nested-View-Perf (`v_claim_full` würde sonst claims → faelle-Bridge → claims selbst-joinen), saubere claims-Views. Aufwand: das Spalten-Homing (§6) ist hierfür ohnehin nötig.
- **Alternative B:** auch sie über die Bridge lesen lassen — weniger Migrations-Arbeit, aber Nested-View-Perf + zirkuläre Semantik.
- *Empfehlung: A für die schweren (v_claim_full/vfat — schon im Gange) + die 2 kunde/sv-Views; die Bridge bedient die ~338 App-Reader.*

## 5 · Writer-Migration (Audit §3.6 ist das Inventar)

1. **Unconditional-Touches sofort streichen** (1 schneller PR): `core.ts:79,115`, `eskalation-actions.ts:66,108` schreiben faelle auch wenn das Objekt nur `{updated_at}` ist → ersatzlos (claims.updated_at / `touch_claim_recency`).
2. **Genesis-Inserts invertieren** (1 PR): `lib/leads/convert-lead-to-claim.ts` + `app/admin/faelle/anlegen/actions.ts` → claim-first, kein faelle-INSERT. *Hard-Dependency: ohne faelle-Tabelle gibt es keinen faelle-INSERT mehr — die Bridge ist read-only.*
3. **Status-SSoT** (1 PR): `lib/faelle/state-machine.ts` → `claims.status` (hängt an Lifecycle-Klärung §6/AAR-939).
4. **`splitOrKeepFaelleUpdate` retirement** (cluster-weise, mehrere PRs): pro Spalten-Cluster Caller auf claims/Sub-Table umstellen, Set-Eintrag streichen; bei leerem Set Helper löschen. ~10 Caller (state-machine, lexdrive/process-event, stammdaten, eskalation, kanzlei-paket, billing, abrechnungen).
5. **Billing-Writer** (revert/reissue/process-case-billing, admin/abrechnungen): auf claims/claim_payments (SP-J).
6. **OCR-Writer** (ocr-trigger/gutachten/fahrzeugschein, OcrAutoFillModal): Fahrzeug → vehicles, Halter → claim_parties, gutachten → gutachten-Sub-Table.
7. **Test/Seed-Writer** (seed-test-data, lifecycle-seed, seed-testdata, create-test-fall, cmm48-smoke): auf claims-Insert oder löschen.

## 6 · Spalten-Homing (Voraussetzung für Bridge-Mapping UND View-Repoint)

Per Audit §R.4 sind viele Cluster **schon erledigt/in-flight**. Offen + entscheidungsbedürftig:

| Domäne | Heimat-Stand | 🔶 |
|---|---|---|
| `kunde_id` | claim_parties (CMM-63 SP-C1 done; 1 Divergenz reconcilen) | klein |
| `kunde_lat`/`kunde_lng` | echter Gap (kein claim_parties-Pendant) → additiv claims oder claim_parties? | **ja** |
| `gegner_*` (name/vers/kennz/anzahl/typ) | SP-C2 offen: claim_parties(rolle=unfallgegner) **vs** claims-Spalten | **ja — Aaron** |
| `halter_*` | SP-C3 offen: claim_parties(rolle=halter) / vehicles.current_owner | **ja — Aaron** |
| `organisation_id`/`dispatch_id` | Ownership, „CMM-65-Scope?" — faelle-only heute | **ja — Aaron** |
| `fall_status` | f.status ≠ c.status (duales Lifecycle) — **AAR-939-Domäne** | **ja — cross-session** |
| `vehicles`-Cluster (fahrzeug/fin) | SP-E pending (55 Reader) | in-flight |
| Vorschäden | CMM-64 (PR3 View-Teil done; vehicle_vorschaeden/claims) | weitgehend done |
| business-rest (ust_id/bank_name/firma_name/zahlung_erwartet_am) | teils redundant (source_channel→leads), teils Heimat offen | mittel |

> **Hard-Dependency:** `fall_status` (Lifecycle) gehört AAR-939. Solange duales Lifecycle existiert, kann weder der Status-Writer (§5.3) noch die Bridge-`status`-Spalte sauber gemappt werden. **Cross-Session-Koordination nötig.**

## 7 · DB-intern (Inventar: Audit §3.2 / §R.2 / §3.3 / §3.4)
- **Trigger ON faelle (7):** 4 funktional (`on_filmcheck_done`, `on_gutachten_eingegangen`, `on_regulierung`, `trg_sa_bestaetigt_termin`) → auf `claims` AFTER UPDATE replizieren **vor** Drop (sonst Funktionsverlust). 3 trivial → fallen mit Drop. Reverse-sync (`trg_sync_faelle_sv_id_to_claims`) → weg (claims=SSoT).
- **Cross-Table-Funktionen/Crons (22 Fn):** claim-zentrisch umschreiben. **Priorität:** anon-RPCs (`apply_gutachten_ocr`, `can_access_fall`), DSGVO (`dsgvo_anonymize_user_data` — Löschung bricht sonst), delete-Helper, 3 Crons (`cron_konsistenz_check`/`cron_vs_frist_reminder`/`cron_kanzlei_paket_pending_check`), Sync-Trigger-Funktionen.
- **RLS (29 Policies in 17 Tabellen):** faelle-Ref in qual/with_check auf claims/Sub-Tables umschreiben. Bridge-View-Reader hängen über `security_invoker` an claims-RLS (B2 ✅). **Phase-6-Hardgate.**
- **Kind-`fall_id`-FK (13):** bei Empfehlung A (§2.3) bleiben als Legacy; bei B droppen.

## 8 · PR-Dekomposition (Sequenz)

**Voraussetzung:** Q1 + Q2 (§2.3/§4) + Homing-Entscheidungen (§6) + AAR-939-Lifecycle-Koordination geklärt.

1. **Homing-PRs** (parallelisierbar, je 1 PR): gegner, ownership (org/dispatch), kunde_lat/lng, business-rest, halter (SP-C3), vehicles (SP-E) — jeweils additiv auf die entschiedene Heimat + Backfill + EXCEPT-0/0-fähig.
2. **View-Repoint-PRs** (Q1=A): v_claim_full Rest, v_faelle_mit_aktuellem_termin Rest, faelle_kunde_view+faelle_sv_view, v_claim_listing — je EXCEPT-0/0 (PR3-Pattern: `replace()`-Transform + Self-Assert + Guard + reloptions-Recheck).
3. **Writer-Migrations-PRs** (§5): Unconditional → Genesis → Status → splitOrKeepFaelleUpdate-Cluster → Billing → OCR → Test.
4. **DB-intern-PRs** (§7): Trigger-Replikation auf claims, Funktionen/Crons claim-zentrisch, 29 RLS-Policies, `leads_staff_all_consolidated`-JOIN.
5. **legacy_fall_id-PR** (Q2=A): `claims.legacy_fall_id` + Backfill.
6. **Drop-Bundle (CMM-49, Aaron-gated):** `DROP TABLE faelle CASCADE` → `CREATE VIEW faelle (security_invoker) AS …` → `generate_typescript_types`. Smoke alle Portale. **Erst wenn 2–5 grün + verifiziert.**

## 9 · Verifikation
- **Pro View-Repoint:** EXCEPT-0/0-Guard (Output byte-identisch) + reloptions-Recheck + 0× f.-Ref-Self-Assert (PR3-Pattern, bewährt).
- **Pro Writer-Migration:** Portal-Smoke + Screenshot (Memory `feedback_smoke_screenshot_pflicht`).
- **Bridge:** anon/Rollen-Sentinel (RLS-Äquivalenz), Spalten-Vollständigkeits-Scan (jeder Reader-Select auflösbar), Embed-Pfad-Test (§2.4), Perf-Plan-Check (EXPLAIN auf die Hot-Reader).
- **DSGVO-Fn** vor Drop scharf testen (Löschung darf nicht brechen).
- **Notification-Baseline** vor Trigger-Replikation aufnehmen (on_filmcheck/gutachten/regulierung feuern lassen).

## 10 · Risiken
- **PostgREST-Embeds** durch die Bridge (§2.4) — schärfster Vorbehalt; vor Bau quantifizieren.
- **Nested-View-Perf**, falls interne Views über die Bridge lesen (Q1=B vermeiden).
- **AAR-939-Lifecycle-Kopplung** (`fall_status`) — cross-session, blockt Status-Writer + Bridge-status-Spalte.
- **Geteilte DB / parallele Sessions** — Live-Re-Messung vor jeder Migration (Memory `feedback_information_schema_check`).
- **Tech-Debt:** `faelle` lebt als View-Name weiter — künftige Devs müssen wissen, dass es kein Table mehr ist (Spalten-COMMENT + View-COMMENT).

## 11 · Quellen
- **Autoritatives Inventar:** `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` (+ 30.05.-Revalidierung §R.1–§R.8, + Phase-4.1-Done).
- Master-Rahmen: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md`.
- 31.05.-Stand: `docs/31.05.2026/cmm-claim-ssot-session-31.05.md` (CMM-62/CMM-64-Entscheidung, v_claim_full-Gap-Map).
- Diese Session: PRs #2105 (FK-Re-Key), #2108 (RLS), #2112 (vehicles), #2114 (CMM-64 PR3), #2110 (vollmacht).
- Memory: `project_cmm_phase_24_finishing`, `project_cmm64_vorschaeden_pr1`.
