# Claimondo Datenmodell — North-Star (die eine Referenz)

> **Zweck:** EINE verbindliche Ziel-Datenstruktur, gegen die alle Sessions arbeiten. Stoppt das Session-übergreifende Hin-und-Her. Entscheidungen werden **hier einmal** getroffen, nicht pro Session neu. **Status:** Aaron-approved 31.05. (North-Star + 4 Tracks + D1/D2/D3). Diese Datei = die vertiefte, konkrete Ebene.
> **Gegroundet auf Live-PROD** `paizkjajbuxxksdoycev` (31.05.): claims=173 Spalten/75 Rows · claim_parties=54/72 · vehicles=50 · leads=202 · faelle=278/74 (stirbt). Inventar: `docs/29.05.2026/cmm44-faelle-drop-blocker-audit.md` + DB-Lifecycle-Audit `docs/31.05.2026/db-lifecycle-audit/` (PR #2124).

---

## 0 · Leitprinzip
**Ein Claim-Aggregat · getippte Sub-Entities · Zustand abgeleitet · keine Parallel-Vokabulare · eine Konvention.**
Heute: 2 zentrale Entities (faelle 278 + claims 173), 8 Lifecycle-Vokabulare, 2 Schreib-Engines, Akkretions-Redundanz (5 Reminder / 6 Notification / 3 Call / 4 Kalender). Ziel: `faelle` weg, `claims` schlank, alles andere in seine natürliche Heimat.

## 1 · Die Entity-Landkarte (Ziel)
```
                 ┌─────────── claims (schlanker Kern ~80) ───────────┐
   leads ───────►│ Vorfall · Identität · Ownership · Lifecycle-Status │
 (Trichter,      └───┬───────────┬───────────┬──────────┬────────────┘
  1 Status)          │           │           │          │
            claim_parties    vehicles    Sub-Entities  Lifecycle
            (rolle-getippt)  (+ involve-  (Workflow-    (claims.status
            geschädigter/    ments)       Artefakte)    + sub-status →
            gegner/halter/                              v_claim_phase
            zeuge/kanzlei                                = abgeleitet)
```
- **`claims`** = der Vorfall + Identität + Ownership + **EIN** Lifecycle-Status. Schlank.
- **`claim_parties`** = ALLE Personen (rolle-getippt). Schon 54-spaltig + injury-fähig → absorbiert gegner/halter/personenschaden.
- **`vehicles`** (+ `claim_vehicle_involvements`) = ALLE Fahrzeugdaten. Schon 50-spaltig.
- **`leads`** = Trichter vor dem Claim, **eine** Phase.
- **Sub-Entities** (bleiben, = das echte Modell): gutachten · auftraege · gutachter_termine · kanzlei_faelle · claim_payments · pflichtdokumente · claim_mietwagen · nachrichten · notification_events/-deliveries · mitteilungen · reminders · calls.

## 2 · `claims` — die Dekomposition der God-Table (173 → ~80 Kern)
**Kern bleibt** (Vorfall + Identität + Ownership + Lifecycle + Flags + Signaturen):

| Cluster | Spalten (Auszug) |
|---|---|
| Identität | id, claim_nummer, lead_id, created_at/_by/_via, fallakte_angelegt_am |
| **Lifecycle** | `status` (→ Lifecycle/Terminal nach D2-Split), **`work_state`** (NEU, D2: dispatch_done/in_bearbeitung raus aus status), status_changed_at, ist_aktiv, deaktiviert_*, abgeschlossen_am, verjaehrt_am, endzustand_*, geschlossen_grund, eskaliert_* |
| Ownership | geschaedigter_user_id, sv_id, kundenbetreuer_id(+fallback/zugewiesen), makler_id, **dispatch_id**, **organisation_id** (beide NEU aus faelle, Track-2 §A2), vehicle_id, gegnerisches_vehicle_id |
| Vorfall | schadentag/-zeit, entdeckt_am, schadenort_*(7), hergang_kunde/_sv_text, schadenart, fall_typ, unfall_konstellation, fahrerflucht, auslandskennzeichen, polizei_*(3), anzahl_beteiligte_total, halter_ungleich_fahrer, kunden_konstellation, unfallskizze_*(5), bkat_unfallart, schadens_ursache, schadens_hoehe_netto, fahrzeugschaden_beschreibung, fahrzeug_fahrbereit, werkstatt_seit_datum, sachschaden_beschreibung, spezifikation |
| Schaden-Flags | hat_personenschaden/-mietwagen/-nutzungsausfall/-sachschaden/-abschleppung |
| Signaturen/Consent | abtretung_pdf, vollmacht_pdf, abtretung/vollmacht_signiert_am, sa_unterschrieben(_am), sa_pdf_url, sa_unterschrift_url, datenschutz_akzeptiert(_am) |
| Business | gewerbe_flag, vorsteuerabzugsberechtigt, betreuungspaket, service_typ, szenario, prioritaet, sprache, bevorzugter_kanal, onboarding_complete, brn, finanzierung_*/leasinggeber_* (Finanz-Kontext, claim-level) |
| Notizen/Review | notizen, interne_notizen, google_review_*, no_show-Counter (4) |

**Zieht UM** in Subsysteme (claims ent-god-table-isieren — netto-neu, Track 3 / teils Track 2):

| Spalten | Heimat |
|---|---|
| vollmacht_status, vollmacht_pruefung_*, vollmacht_geprueft_*, zb1_status, unfallmitteilung_status, polizeibericht_status, dokumente_vollstaendig_*, dokumente_reminder_* | **pflichtdokumente** + `v_claim_doc_status` |
| gegner_versicherung_id, gegner_versicherungsnummer, gegner_aktenzeichen, gegner_bekannt, kunde_email | **claim_parties** (unfallgegner / geschädigter) |
| mietwagen_seit_datum/limit_*/rechnung_*/argumentations_puffer/vermieter | **claim_mietwagen** (Sub-Table existiert) |
| kanzlei_wunsch*, kanzlei_uebergeben_am, kanzlei_ansprechpartner_*, kanzlei_honorar, kanzlei_provision_*, kanzlei_abrechnung_id, vs_ablehnungs_grund | **kanzlei_faelle** |
| regulierungs_betrag, guthaben_verrechnet_netto, schlussabrechnung_am, auszahlung_*, sv_nachzahlung_netto, abrechnung_id, marketing_provision*, zahlungsweg, lead_preis_*, iban/bic/kontoinhaber/bankdaten_hinterlegt_am | **claim_payments / abrechnungen / Provisions-Tische** |
| hat_vorschaeden, vorschaden_geprueft/_erkannt, vorschaeden_beschreibung, vorschaden_mit_vs_abgerechnet | **vehicle_vorschaeden / vehicles** (CMM-64) |

> **Wichtig:** CMM-49 ent-`faelle`t nur, **ent-`claims`t nie**. Die God-Table-Dekomposition ist **netto-neu (Track 3)** — nicht Teil des faelle-Drops, aber Teil des sauberen End-States.

## 3 · `claim_parties` — die Partei-SSoT (schon 54-spaltig, richtig geformt)
Eine Tabelle, **rolle-getippt** (`rolle` ∈ geschädigter / unfallgegner / halter / zeuge / kanzlei_kontakt). Hat bereits: Person (anrede…nachname/firma/geburtsdatum), Kontakt (telefon/mobil/email), Adresse, ist_halter/ist_fahrer, Führerschein, kennzeichen, vehicle_id, versicherung_* (id/klartext/nummer/aktenzeichen), **hat_personenschaden/verletzungsart/krankenhaus/arbeitsunfaehig_* (Injury schon da!)**, beziehung_zum_halter, airdrop, anonymisiert.

**Absorbiert** → tötet:
- `faelle.gegner_*` (name/versicherung/kennzeichen) → Row `rolle=unfallgegner` (versicherung-Felder existieren).
- `faelle.halter_*` + `claims.gegner_*`-Snapshot → Rows `rolle=halter` / unfallgegner.
- `personenschaden_personen` (0 Rows) → injury-Felder existieren bereits → fold-in, Tabelle weg.
- `parteien` (0 Rows, toter Enum-Shell) → ersatzlos weg (killt `partei_rolle`+`vertrag_typ`-Enums gratis).
Arbeit = Backfill gegner/halter-Rows + Reader-Repoint (CMM-49 §A1/§A3 = CMM-63 SP-C2 / CMM-67 SP-C3).

## 4 · `vehicles` (+ involvements) — Fahrzeug-SSoT (schon 50-spaltig)
Hat fin/kennzeichen/hersteller/modell + alle Tech-Specs + cardentity_report + cardentity_letzter_pull. **Absorbiert** `faelle.fahrzeug_*/fin/hsn/tsn/erstzulassung/lackfarbe`. `vehicle_vorschaeden` (1:N) = Vorschäden-Historie. N:M via `claim_vehicle_involvements`. (CMM-50/68 — Schema/Write/Backfill schon weitgehend live; nur 1 FIN befüllt = ok.)

## 5 · `leads` — auch eine God-Table (202 Spalten), aber niedrigere Priorität
Trichter VOR dem Claim. **Dual-Status (D3-Entscheidung): `qualifizierungs_phase` (text) = einzige Quelle**, `leads.status` (`lead_status`-Enum) deprecaten. Achtung: Enum-Drop = mehr DDL. Die 202-Spalten-Dekomposition (viel davon Pre-Claim-Snapshot, der beim Convert nach claims/claim_parties/vehicles fließt) = **Track 3, post-Launch** — blockt den faelle-Drop nicht.

## 6 · Lifecycle — EIN gespeicherter Status je Ebene + abgeleitete Phase
**Das Kernproblem heute:** 8 Vokabulare, 2 Engines, `faelle.status` (19-Enum) ⊥ `claims.status` (12-CHECK), disjunkt auf 74/74.

**Ziel-Modell (verifiziert):**
- **Gespeichert (2 Ebenen):**
  - `claims.status` = **Lifecycle/Terminal-Achse** (nach D2-Split: reguliert_vollstaendig / abgelehnt_final / storniert / klage_rechtsstreit / verjaehrt / an_externe_kanzlei / termin_durchgefuehrt / in_kommunikation_vs …). Der Dispatch-Flag (`dispatch_done`/`in_bearbeitung`, heute 100% der Rows) → **NEU `claims.work_state`** (D2). Pre-Launch (75 Rows) = billigster Schnitt-Zeitpunkt.
  - `leads.qualifizierungs_phase` = Lead-Trichter (D3, einzige Quelle).
- **Sub-Entity-Status (BLEIBEN — sind die Ableitungs-Inputs, NICHT redundant):** `auftraege.status`, `gutachten.status`, `kanzlei_faelle.status`, `repairs.status`. Hier lebt die **operative Granularität**.
- **Abgeleitet (nie gespeichert):** `mainPhase × subPhase` via `getClaimLifecycle()` ↔ `v_claim_phase` (Bit-Parity-Gate). **Schon faelle-frei ✅** (liest claims + kanzlei_faelle + leads + auftraege — NICHT faelle).
- **EINE Schreib-Engine:** `transitionFallStatus` (= operative Engine: SLA/Billing/Notifications/Tasks) wird auf claims/Sub-Entities umgehängt; die zweite Welt (endzustand/kanzlei-wunsch direkt auf claims.status) damit vereint. `checkFallAutoPhase` (nur 2 fire-and-forget Caller) retiren, Task-Trigger auf Sub-Entity-Writer umhängen.

**HARD-GATE vor faelle-Drop — die 5 operativen Zustände re-beheimaten (D1: erhalten):**
| Enum-Zustand | Heimat (D1) |
|---|---|
| `vs-kuerzt` (treibt LIVE Kürzungs-SLA, state-machine.ts:322) + vs_kuerzung_grund | **kanzlei_faelle** (VS-Domäne) |
| `filmcheck` / `qc-pruefung` | **auftraege** (filmcheck_ok/_am existieren dort) |
| `nachbesichtigung-laeuft` | **auftraege.typ='nachbesichtigung'** / gutachter_termine |
| `anschlussschreiben` | **kanzlei_faelle.anschlussschreiben_am** (existiert) |
+ `v_claim_phase`-Ableitung um diese Sub-Status erweitern · **Webhook-Writer** (LexDrive/VS schreiben vs-kuerzt direkt) mit abdecken · fraktionale `enumsortorder` (1.5/8.625…) = implizite Sortierung → vor Drop `ORDER BY status` greppen + in subPhase-Sortmap portieren.

**Stirbt:** `faelle.status` (19-Enum) · `FALL_STATUS_TRANSITIONS` (19-Adjazenz) · `AKTUELLE_PHASE_LABELS` (tot) · `SUBPHASE_VISIBILITY`+`PHASE_META` (test-only) · `PHASE_VISIBLE_SECTIONS` (→ abgeleitete Phase, letzter Live-fall.status-Consumer) · `FALL_STATUS_LABELS` (auf Union der Live-Werte prunen).

## 7 · Sub-Entity-Konsolidierungen (netto-neu, Track 3)
| Heute | Ziel |
|---|---|
| 5 Reminder-Tische (abrechnung/kanzlei_abrechnung/sv_payment = identische sent-logs; termin/task = Retry-Queues) | **1 polymorphe `reminders(entity_type, entity_id, typ, gesendet_am, details jsonb)`** + die 2 Retry-Queues behalten |
| 6 Notification/Message-Tische (`benachrichtigungen`:2598, `mitteilungen`:237, `gutachter_mitteilungen`:0=**SV-Glocke leer!**, notification_events/-deliveries=Outbox, nachrichten=Chat) | In-App-Bell-SSoT = **`mitteilungen`**; gutachter_mitteilungen reinfalten; benachrichtigungen-Backfill. Outbox+Chat bleiben. |
| 3 Call-Tische (`calls`=SSoT, aircall_calls/matelso_calls=verwaiste Landing-Zones, 2 parallele Ingest-Pfade) | **`calls` + provider + raw_payload jsonb**; toten Webhook-Pfad killen |
| 4 Kalender (`gutachter_termine`:18=kanonisch, `termine`:0=live-Writer fall_id-keyed §E-Breaker, admin_termine:9, kanzlei_admin_termine:0) + 14 Reminder-Flags auf gutachter_termine | **`gutachter_termine`** (trägt claim_id); 14 Flags → `termin_reminders`-Rows |
| 11 tote Tabellen (8 Community/Org-Shells + werkstaetten + gutachten_fotos; vehicle_ownership_history an CMM-50 parken) | DROP |
| `cron_jobs_audit` (24.491 Rows, unbounded, größtes DB-Objekt) | Retention-TTL (30 Tage) |

## 8 · Konventionen (ratifiziert)
- **`text` + `CHECK(col = ANY(ARRAY[...]))`, KEINE neuen Postgres-Enums** (16 Enum-Spalten/~12 Typen heute; ENUM→CHECK-Konversion priorisiert `user_role`=RLS-sensitiv; State/Rolle-Enums sterben teils mit den Table-Drops). CHECK auf die 92 ungeprüften Status-Spalten — **Lifecycle-Feeder zuerst** (auftraege/gutachten/kanzlei_faelle/repairs.status). `ADD CONSTRAINT … NOT VALID` → `VALIDATE` (kein Rewrite).
- **Timestamps `created_at`/`updated_at` (en)** — 31 DE-Tische + 10 mixed per Boy-Scout de-mixen. (`benachrichtigungen` created_at+erstellt_am = redundanter Mirror, einen droppen — kein Bug.)
- **FK überall** (97/405 *_id-Spalten ohne FK → ~10 interne nachziehen; 83 NO-ACTION vor faelle-CASCADE + für DSGVO-Anonymisierung auditieren).
- **RLS claim-scoped via `can_access_claim`** (faelle-frei, schon gebaut #2108). Index-Prune (534/682 ungenutzt) bewusst, **nach** faelle-Drop.

## 9 · Was stirbt (Kill-Liste)
`faelle` (komplett) · `fall_id` (claim_id überall, Route-Switch) · `faelle.status`-Enum + 19-Adjazenz + Label-Akkretion · `parteien` + `personenschaden_personen` (0 Rows) · 11 tote Tische · die Dual-Engine · die 4 redundanten Tabellen-Familien (→ je 1) · `claims`-God-Table-Aspekt-Spalten (in Subsysteme) · `leads.status`-Enum.

## 10 · Die 4 Tracks (Programm-Struktur) + gelockte Entscheidungen
| Track | Inhalt | Status |
|---|---|---|
| **0 · Security/DSGVO** (sofort, parallel) | personenschaden `ALL public`, /api/consent, content_translations, leadpreise, plz_geo, 3 SECDEF-Views | eigene Session (Audit-§7-A läuft via 3b879acd) |
| **1 · Lifecycle-Freeze** (Keystone) | §6 oben: work_state-Split (D2), 5 operative re-beheimaten (D1), Dual-Engine→eine, Label-Akkretion weg, Lead-Doppel→eine (D3) | CMM, nach diesem North-Star |
| **2 · faelle-Drop** = Master-Plan #2118 | §A Heimat → §B Views → §C Reader → §D Writer → §E fall_id-Tod → §F DB-intern → §G DROP | hängt an Track 1 + Track 0 |
| **3 · Struktur-Cleanup** (opportunistisch, post-Launch) | §2 claims-Dekomposition, §7 Konsolidierungen, §8 Konventionen, Index-Prune | netto-neu, eigene Tickets |

**Gelockte Entscheidungen (Aaron 31.05.):**
- **D1** operative Zustände **erhalten → auf Sub-Entities re-beheimaten** (§6 Hard-Gate).
- **D2** `claims.status` **work_state rausspalten** → status = reine Lifecycle/Terminal-Achse.
- **D3** `qualifizierungs_phase` = einzige Lead-Quelle, `lead_status`-Enum deprecaten.

**Noch offen (Track-3-/Sicherheits-Entscheidungen, blocken den Drop NICHT):** personenschaden/leadpreise/consent DSGVO-Schärfe · ENUM→CHECK-Scope (nur State/Rolle oder auch Package/Kategorie?) · cron_jobs_audit-Retention-Dauer · community_leaderboard-Cron dormant?

---
**Nächster Schritt:** aus diesem North-Star den **Track-1-Plan** (Lifecycle-Freeze) schreiben (writing-plans) + Track-2 (#2118) darunter einordnen → dann Phase für Phase bauen. Track 0 läuft parallel (eigene Session). Track 3 post-Launch.
