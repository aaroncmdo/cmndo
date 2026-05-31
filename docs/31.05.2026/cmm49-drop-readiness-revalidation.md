# CMM-49 — Drop-Readiness-Revalidierung (faelle → claims SSoT)

**Datum:** 2026-05-31 · **Branch:** `kitta/cmm-49-faelle-drop-runway`
**Auftrag (Aaron):** Vor dem `DROP TABLE faelle` jeden Prozessschritt der Strecke tief revalidieren + Bugs/Ungereimtheiten reparieren.
**Methode:** 6 parallele, streng read-only Audit-Agenten, live gegen Prod `paizkjajbuxxksdoycev` (31.05.) + Code-Sweep über `src/`. Keine Mutation.
**Bezugsbasis:** Master-Strategie `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` + Phase-6-Revalidierung `docs/23.05.2026/cmm44-phase6-plan-revalidierung.md` (417-Breaker-Stand).

---

## 0 · Verdikt

**NICHT drop-ready — aber die Datenmigration ist substanziell fertig; es bremsen 4 konkrete, endliche Blocker + 2 echte Bugs.**

Korrigierte Kern-Prämisse: **`faelle` ist KEINE synchrone Sicherheits-Kopie mehr.** Nur `sv_id` wird noch bidirektional gesynct (`trg_sync_faelle_sv_id_to_claims` ↔ `trg_sync_claims_sv_id_to_faelle`). Der historische 40-Spalten-Sync (PR #491 / Phase 1.5) ist **weg**. 13 geteilte Spalten sind gedriftet — durchweg „claims neuer, faelle stale". Empirischer Propagationstest (rolled-back): `sv_id` propagiert beidseitig; `sa_unterschrieben` propagiert **nicht** (claims=true, faelle blieb false). → faelle als Fallback ist unzuverlässig; das spricht *für* den Drop, sobald die Blocker weg sind.

---

## 1 · Was sauber / fertig ist (verifiziert)

| Slice / Aspekt | Befund |
|---|---|
| **SP-A3 `claim_nummer`** | 75/75 gesetzt, unique, 0 NULL. `fall_nummer` aus beiden Tabellen weg. ✅ |
| **SP-B (64 claim-globale)** | 81 geteilte Spalten 0 Mismatch (kanzlei_*/marketing_*/mietwagen_*/vollmacht_*/auszahlung_*/schadens_* …). ✅ |
| **SP-G/G2 `gutachten`** | Backfill komplett, 0 Daten-Drift (faelle nur stale-behind). ✅ |
| **SP-H `auftraege`** | sauber; faelle-Residuum = NOT-NULL-Defaults (filmcheck_ok/techn.Stellungnahme). ✅ |
| **SP-I1–I6 `kanzlei_faelle`** | 27 geteilte Spalten 0 Drift, Backfill komplett (mandatsnr/AS/regulierung/VS/Rüge/eskalation/kanzlei_id). ✅ |
| **SP-J `claim_payments` + Bank** | 0 Mismatch, 0 Verlust (live 0 IBAN-Daten). ✅ |
| **SP-C `kunde_id`-Ownership** | SSoT = `claim_parties(geschaedigter).user_id`, **0 Mismatch auf echten Daten**; RLS auf claims referenziert faelle **nicht**. Zugriffskontrolle drop-sicher. ✅ |
| **`gutachter_termine.claim_id`** | gap=0 (alle fall_id-Rows haben claim_id). ✅ |
| **8 stille-Datenverlust-Writer (23.05 §2)** | **ALLE 8 gefixt** — kanzlei-paket/vs-timer/prozess/filmcheck/push-mandat/stripe-webhook/dokumente → jetzt `kanzlei_faelle`/`claims`/`auftraege`. (ocr-trigger `halter_geburtsdatum` schreibt noch faelle direkt, aber Spalte ist NICHT relocatet → kein Verlust, nur Drop-Breaker.) ✅ |

**Fazit:** Deine Einschätzung „das haben wir doch schon komplett gemacht" stimmt für die **Spalten-Daten-Slices + Ownership + die Datenverlust-Writer**. Was bleibt, ist **strukturell** (Views/RLS/FK/Restspalten), nicht Daten-Migration.

---

## 2 · Hard Drop-Blocker

### B1 — `vehicles` NICHT migriert (SP-E Cutover offen) 🔴
`vehicles` = **0 Rows**, `claims.vehicle_id` auf **0** Claims gesetzt. Die `fahrzeug_*`-Daten leben weiter **nur** auf faelle. `v_claim_full` + `v_faelle_mit_aktuellem_termin` rendern Fahrzeug via `COALESCE(veh.*, f.*)` → **heute 100% aus faelle**. Drop ⇒ alle Fahrzeug-Anzeigen nullen aus + 1 Fall mit echten fahrzeug-Daten verloren. = der bekannte **CMM-50-Backfill/Cutover** („entsperrt CMM-49").

### B2 — RLS-Abdeckung verliert sich beim CASCADE 🔴
5 SELECT-Policies + Helper `can_access_fall` hängen noch an `faelle`. `DROP CASCADE` droppt sie still →
- **KUNDE** verliert Read auf `auftraege`, `gutachter_termine`, `kanzlei_faelle`
- **SV** verliert `kanzlei_faelle`
- **KANZLEI** verliert `gutachter_termine` + `kanzlei_faelle`
- **KUNDENBETREUER** verliert `gutachter_termine` (über `can_access_fall`)

Failure-Mode = **Aussperrung/leere Portale** (keine Über-Exposition). Fix mechanisch: claim_id existiert auf allen 3 Sub-Tables; Helper `is_claim_user_party`/`is_sv_for_claim` sind faelle-frei. **Policies + Helper auf claim_id umschreiben, dann RLS-Smoke pro Rolle.**

### B3 — Views: 9 faelle-only Spalten ohne Heimat + 3 faelle-getriebene Views 🔴
`v_claim_full` liest 9 Spalten ohne Ziel: `fahrzeug_typ`, `gegner_anzahl_beteiligte`, `gegner_fahrzeugtyp`, `organisation_id`, `dispatch_id`, `vorschaden_anzahl`, `vorschaden_letzter_datum`, `vorschaden_typ_b_bericht`, `cardentity_abfrage_am`.
3 Views fahren `FROM faelle` (→ **0 Rows nach Drop** ohne Re-Base): `v_faelle_mit_aktuellem_termin`, `faelle_kunde_view`, `faelle_sv_view` (letztere hat kein faelle-only-Payload — nur Re-Base nötig).
Repoint-ready: `v_claim_phase` (faelle-frei), `v_claim_listing` (nur kosmetischer `fall_id`-Alias).

### B4 — 37 operative FK-Tische nur `fall_id` (kein claim_id) 🔴
`DROP TABLE faelle CASCADE` würde die FK-Constraints droppen → Kind-Rows (nachrichten/tasks/timeline-Kinder/parteien/…) verlieren ihre Verknüpfung. Re-Key (claim_id ADD + Backfill + FK + Ableitungs-Trigger) nötig — **additiv/reversibel**, Plan: `docs/superpowers/plans/2026-05-31-cmm49-fk-rekey-runway.md`. 6 Tische haben claim_id schon (FK hängt noch an faelle), 4 sind Legacy-Pointer (`konvertiert_zu_fall_id` etc.).

### Rest-Spalten ohne Heimat (gehören zu B3, eigene Mini-Slices)
`auszahlung_kunde_betrag/_eingegangen_am`, `bank_name`, `fin_vin`, `zahlung_erwartet_am`, `mietwagen_kanzlei_informiert`, `halter_*` (nur `leads`-Twin), `vorschaden_typ_a_ergebnis/_typ_b_pdf_url`. → CMM-64 PR3 (vorschaden/cardentity), CMM-65 (organisation_id/dispatch_id), CMM-67 (halter), gegner_*→claim_parties/claims, Rest→claims.

---

## 3 · Echte Bugs (unabhängig vom Drop — JETZT fixwürdig)

### P1 — `vollmacht_datum`-Write ins Leere (customer-facing, still) 🟠
`src/app/flow/[token]/actions.ts:1429` (`confirmVollmacht`) macht `admin.from('faelle').update({ vollmacht_datum })` — **die Spalte existiert NICHT auf `faelle`** (nur auf `leads`). Ungetypter admin-Client, **kein Error-Guard** → jede Kunden-Vollmacht-Bestätigung wirft eine still verschluckte „column does not exist". Der kanonische `vollmacht_signiert_am`→claims (:1432) persistiert korrekt, aber das **billing-relevante** `vollmacht_datum` (gelesen in `admin/finance/(hub)/page.tsx` + `lib/finance/abrechnungen-generator.ts` aus **`leads.vollmacht_datum`**) wird **nirgends** geschrieben. Stale `database.types.ts` hat es maskiert. **Fix-Richtung offen** (→ `leads.vollmacht_datum` schreiben, wo die Consumer lesen — oder `claims.vollmacht_datum` anlegen + Consumer repointen).

### P2 — 4 tote Benachrichtigungs-Trigger auf faelle = stille Regression + Landmine 🟠
`on_filmcheck_done`, `on_gutachten_eingegangen`, `on_regulierung`, `trg_sa_bestaetigt_termin` feuern auf faelle-UPDATE — aber ihre Trigger-Spalten sind längst auf `auftraege`/`gutachten`/`kanzlei_faelle`/`claims` umgezogen → **feuern faktisch nicht mehr** (Admin-„eingegangen"-Notifications + SA→Termin-Auto-Confirm sind **jetzt schon weg**, unabhängig vom Drop). Zusätzlich referenzieren ihre Funktionskörper **gedroppte Spalten** (`fall_nummer`, `regulierung_betrag`, `gutachter_termin_status`) → Runtime-Landmine (`column does not exist`), falls je der Branch auf einem faelle-UPDATE getroffen wird. **Entscheidung nötig:** auf den neuen SSoT-Tables neu bauen (gewollt?) oder mit faelle droppen.

### P3 — `gutachter/termine/[id]/actions.ts:388` `polizei_aktenzeichen` 🟡
Legacy-Fall-Else-Branch (kein claim_id) schreibt eine nicht-existente faelle-Spalte → Error für claim-lose Rows. claims-Pfad (:383) korrekt. Stale Kommentar behauptet Sync-Trigger (in SP-A gedroppt).

### P4 — `parteien` Dead-Reads (6 Sites) 🟡
Tabelle 0 Rows, noch in 6 Code-Stellen gelesen (`get-by-token`, `email/google/flows` ×3, `pdf/kanzlei-paket`, `gutachter/fall/[id]`) → silently null. Repoint auf `claim_parties(gegner)`/`vs_korrespondenz`.

### P5 — ~14 residual `faelle.kunde_id`-Access-Reads + ~9 incidental 🟡
Down von 61×. Degradieren nach Drop zu „nicht-owned/leer" (kein Security-Leck, RLS hält). Follow-up-Sweep auf `getOwnedClaimIds`/`assertKundeOwnsClaim` (Helper existieren).

### Drift-Restbefunde (KEIN Fix — Drop löst korrekt auf)
`status`/`service_typ`/`sa_unterschrieben`(+`_am`)/`abtretung_*`/`sv_zugewiesen_am`/`updated_at`: claims = SSoT/korrekt, faelle stale → **nicht** faelle→claims backfillen (würde gute Daten überschreiben). `created_at`/`status_changed_at`: Sub-Sekunden-Skew, kosmetisch. `vorschaden`-Flags: claims NULL vs faelle false-Default, kein Signal. `claims.lead_id` (2 Seed/Test-Rows `bbbb…`): Backfill-Gap, nur Testdaten.

---

## 4 · Code-Breaker-Gesamtstand
~419 `from('faelle')`-Vorkommen (≈ Baseline 417) — **aber Writes systematisch entschärft** über `src/lib/faelle/claim-duplicate-columns.ts` (`splitOrKeepFaelleUpdate` + `peelAuftraege/Kanzlei`): bei vorhandenem claim_id wird jede migrierte Spalte off-faelle geroutet; ohne claim_id (Legacy) bleibt alles als bewusster Fallback auf faelle. 44 Write-Sites / 35 Files, davon die meisten korrekt gesplittet; gefährlich nur P1 (vollmacht_datum) + P3 + `VorOrtPanel.tsx:62` (dynamischer faelle-Write, noch faelle-native, künftiger Breaker).

---

## 5 · Empfohlene Reihenfolge bis zum Drop

1. **Restspalten beheimaten** (B3-Rest): CMM-64 PR3 (vorschaden/cardentity), CMM-65 (organisation_id/dispatch_id), CMM-67 (halter), gegner_*/auszahlung_kunde_*/fin_vin/mietwagen → claims/Sub-Table.
2. **`vehicles`-Cutover (B1)** — Backfill `vehicles` + `claims.vehicle_id` aus faelle.fahrzeug_*.
3. **6 Views re-basen** `FROM claims` (nach 1+2).
4. **RLS umschreiben (B2)** — 5 Policies + `can_access_fall` auf claim_id; RLS-Smoke pro Rolle.
5. **FK-Re-Key (B4)** — 37 Tische additiv (Plan liegt).
6. **Bugs:** P1 (vollmacht), P2 (Trigger neu bauen/droppen), P3, P4, P5.
7. **Phase 5+6:** Sync-Trigger (sv_id ×2) + die 4 toten Trigger droppen → `DROP TABLE faelle CASCADE` → voller Portal-Smoke. **(harter Aaron-Gate)**

**Kollision:** Schritt 1 (CMM-67 halter, Stammdaten) + die Code-Sweeps berühren die 4 aktiven AAR-939-Sessions → koordinieren. Schritte 4 (RLS) + 5 (FK-Re-Key) sind **unabhängig + kollisionsarm** → von hier aus sicher ownbar.

---

## 6 · Quellen
6 Audit-Agenten (read-only, 31.05.): claims-direkte Slices · Sub-Table-Slices · claim_parties/kunde_id · Sync-Trigger-Integrität · Code-Breaker · Views+RLS. Live gegen `paizkjajbuxxksdoycev`. Memory: `project_cmm_phase_24_finishing`, `project_cmm50_vehicles_scoping`, `feedback_information_schema_check`.
