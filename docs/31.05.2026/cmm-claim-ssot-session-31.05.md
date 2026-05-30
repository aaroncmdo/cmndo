# Claim-SSoT-Strecke — Session 31.05.2026 (CMM-62 Entscheidung + CMM-66 Teil 2 Start)

**Branch:** `kitta/cmm-66-view-rebase` (Worktree, von `origin/staging`)
**Vorgänger-Handoff:** `docs/30.05.2026/claim-ssot-strecke-stand.md` (CMM-50.3b-Session)
**Methode:** Live-Re-Messung gegen Prod-Schema `paizkjajbuxxksdoycev` (eine geteilte DB, kein separater Staging-DB-Slot) + 1 additiver View-Repoint + Aaron-Entscheidung CMM-62.

---

## ⏭ START HERE — nächste Session

1. **Orientieren (Pflicht):** dieses Doc + Memory `project_cmm_phase_24_finishing` lesen. Zahlen unten **live re-messen** (Schema veraltet <1 Tag; parallele AAR-939-Sessions). **Eigener Worktree** von `origin/staging` (`node scripts/new-session-worktree.mjs <slug> staging`).
2. **CMM-64 bauen** (Spec §4 unten — Design entschieden, vehicle-zentrisch): `vehicle_vorschaeden` 1:N + cardentity→vehicles + geprueft/erkannt→claims + Code-Repoint (`api/cardentity/typ-a|typ-b`, `enrich-fahrzeug`) + RLS + 39-File-Reader-Sweep + **Build-Gate (npm ci)**. 0 Daten → kein Backfill. Entsperrt 2 weitere v_claim_full-Repoints.
3. **Danach** weitere v_claim_full-Repoints (Gap-Map §1): nach CMM-64 die vorschaden/cardentity-Reads; org_id/dispatch_id (Ownership mit Aaron klären, CMM-65-Scope?); gegner_* (claim_parties-Ableitung vs claims-Spalten); kunde_id (CMM-63-Reconcile der 1 Divergenz).
4. **NICHT ohne Aaron:** FK-Architektur (41 `fall_id`-Tabellen re-key vs. schlanke Bridge) → blockt `fall_id`-Entfernung + v_claim_listing. Lifecycle/`fall_status` (AAR-939-Sessions).

**⚠️ Caveat DB-ahead-of-staging:** `v_claim_full` liest in der **Live-DB** bereits `c.sv_id` (Migration appliziert), aber die Migration-Datei liegt nur auf **PR #2082 (unmerged)** → DB ist ggü. staging-Code leicht ahead (benign, output-identisch — gleiche Konstellation wie der `v_claim_phase`-Terminal-Rename `gutachten_abgeschlossen→termin_durchgefuehrt` von Session monika-billing). **Bei künftigem View-Replace immer den Live-Def-`replace()`-Transform** nutzen (`pg_get_viewdef` + gezielter `replace`, kein Hand-Transkript) — der übernimmt fremde Live-Änderungen automatisch.

---

## 0 · Live-Re-Messung (31.05., gegen Vorgänger-Stand)

| Metrik | 30.05. (Handoff) | 31.05. (live) | Δ |
|---|---|---|---|
| faelle Spalten / Rows | 278 / 74 | **278 / 74** | — |
| claims Spalten / Rows | 169 / — | **169 / 75** | +1 Row = AAR-939 lead-only-Claim (kein Fall) |
| faelle ohne claim_id | — | **0** | saubere 1:1-Bridge |
| `vorschaeden`-Tabelle | existiert nicht | **existiert nicht** | bestätigt |

**Sync-Gleichheit (entscheidet Repoint-Sicherheit):** `f.sv_id == c.sv_id` über alle 74 (mismatch=0). `f.status::text` ≠ `c.status` bei **allen 74** (Lifecycle dual). `f.created_at` ≠ `c.created_at` bei 72. `f.kunde_id` ≠ `c.geschaedigter_user_id` bei **1** (both-set). `f.source_channel` == `leads.source_channel` (via claim.lead_id) bei **allen** (mismatch=0 → redundant).

---

## 1 · CMM-66 Teil 2 (Phase 4.2) — START: `v_claim_full.sv_id` → claims ✅

**Migration `20260530222551_cmm66_2_v_claim_full_sv_id_repoint`** (applied + getrackt + File committet).

- **Was:** In `v_claim_full` liest die Spalte `sv_id` jetzt aus `c.sv_id` (claims, SSoT seit CMM-60) statt `f.sv_id` (faelle).
- **Pattern:** Server-seitiger `replace()`-Transform der Live-Viewdef im `DO`-Block (Vorlage CMM-50.3b `20260530205453`) — robust gegen parallele Viewdef-Änderungen anderer Sessions; nur das `f.sv_id`-Token wird getauscht, ~95 übrige Spalten unberührt.
- **Sicherheit:** Self-Assert (altes Pattern weg + exakt 1× `c.sv_id`) + **Output-Hash-EXCEPT-0/0-Guard** (old==new, sonst atomarer Rollback). Pre-Apply-Beweis: `svid_mismatch=0`.
- **Verifiziert:** `f.sv_id`-Pos=0, `c.sv_id`-Pos>0, 75 Rows unverändert, `view_sv_id_nonnull=64==claims_sv_id_nonnull=64`, `view_vs_faelle_svid_mismatch=0`. **reloptions (`security_invoker`) unverändert** (CREATE OR REPLACE bewahrt reloptions — bewiesen über `v_claim_listing`, das `cmm44_phase41` per CREATE OR REPLACE neu baute und `security_invoker=false` behielt).

### v_claim_full — Gap-Map der verbleibenden `f.*`-Reads (für nächste Session)

`v_claim_full` ist nach diesem Repoint **noch nicht** faelle-frei. Verbleibende faelle-Reads + Disposition:

| f.*-Read | Status / Heimat | Aktion (Reihenfolge) |
|---|---|---|
| `f.id AS fall_id` | **Bridge** (einzige faelle.id↔claim-Quelle) | Erst nach FK-Architektur-Entscheidung (Aaron §7.1) + Re-Key entfernbar. Consumer `src/app/faelle/page.tsx` liest fall_id auch aus v_claim_listing. |
| `f.status AS fall_status` | mismatch=74 — fall_status-Enum (3 Phasen) ≠ claims.status. Lifecycle dual (AAR-939). | Erst wenn Lifecycle vereinheitlicht (AAR-939). NICHT alleine. |
| `f.created_at AS fall_created_at` | mismatch=72 — eigene Semantik (Fall- vs Claim-Anlage). | Produkt-Entscheidung ob auf c.created_at mappbar. |
| `COALESCE(veh.*, f.kennzeichen/_hersteller/_modell/_typ)` | Vehicle-Fallback (CMM-50). | f.*-Fallback entfällt erst nach vehicles-Voll-Backfill / CMM-50-Cutover. |
| `f.gegner_anzahl_beteiligte`, `f.gegner_fahrzeugtyp` | faelle+leads, **nicht** auf claims (claims hat andere gegner_*-Spalten). | Design: aus `claim_parties` (rolle=unfallgegner) ableiten ODER 2 Spalten additiv auf claims. Dann EXCEPT-0/0-Repoint. |
| `f.organisation_id` | faelle-only. | Ownership-Klärung (evtl. CMM-65-Scope) → additiv claims → Repoint. |
| `f.dispatch_id` | faelle-only. | Ownership-Klärung (evtl. CMM-65-Scope) → additiv claims → Repoint. |
| `f.kunde_id` | both-set-diff=1 vs c.geschaedigter_user_id. | CMM-63-Ownership-Reconcile der 1 Divergenz → dann claims.kunde_id ODER Repoint auf geschaedigter_user_id. |
| `f.hat_vorschaeden`, `f.vorschaden_anzahl`, `f.vorschaden_letzter_datum`, `f.vorschaden_typ_b_bericht` | 0-Daten. **CMM-64 (vehicle-zentrisch, s.u.)**. | Nach CMM-64: Repoint auf `vehicle_vorschaeden` via `claims.vehicle_id` (LATERAL). |
| `f.cardentity_abfrage_am` | 0-Daten. **CMM-64**. | Nach CMM-64: Repoint auf `vehicles` via `claims.vehicle_id`. |

**Reihenfolge-Logik:** Jeder weitere EXCEPT-0/0-Repoint braucht ZUERST eine Heimat für die Spalte. Heute war nur `sv_id` „ready" (CMM-60 done + mismatch=0). Der Rest hängt an CMM-64 / Ownership-Entscheidungen / Lifecycle / FK-Architektur.

---

## 2 · v_claim_listing — unverändert (bewusst)

Einzige faelle-Read: `f.id AS fall_id`. Consumer `src/app/faelle/page.tsx` selektiert `fall_id` explizit → **konsumiert**, kann nicht ohne Caller-Anfassung weg. fall_id = Bridge → hängt an der FK-Architektur-Entscheidung (Aaron §7.1). `sv_id` liest v_claim_listing bereits aus `c.sv_id` (cmm44_phase41). → kein Change diese Session.

---

## 3 · Diff-Mapping der „5 echten-Daten-faelle-only-Domänen" (Auftrag §3)

**Kernbefund: fast keine neuen claims-Spalten nötig — das Meiste ist schon migriert oder redundant.**

| Domäne | Coverage | Lebt kanonisch wo? | Schluss |
|---|---|---|---|
| `mandatsnummer` | 12/74 | **kanzlei_faelle** (v_claim_full liest schon `kf.mandatsnummer`) | ✅ migriert (CMM-66 Teil 1). faelle-Spalte = Drop-Kandidat. |
| `besichtigungsort_*` | 1/74 | **gutachter_termine** (v_claim_full liest `spd_termin.besichtigungsort_*`) | ✅ migriert. Drop-Kandidat. |
| `sv_briefing_text` | — | **auftraege** | ✅ migriert. Drop-Kandidat. |
| `kunde_email` | — | **claims** | ✅ migriert. |
| `kunde_telefon/_vorname/_nachname/_adresse`-Cluster | 72/74 | **claim_parties** (rolle=geschaedigter; `v_faelle_mit_aktuellem_termin` liest schon `cp_g.*`) | ✅ redundant. Kein ADD. faelle-Spalten = Drop-Kandidaten nach Reader-Sweep. |
| `source_channel` | 70/74 | **leads** (via claim.lead_id; mismatch=0) | ✅ redundant. Kein ADD. |
| `fin_vin` | 1/74 | **vehicles.fin** (Spalte existiert; `v_faelle_mit_aktuellem_termin` COALESCEt schon `veh.fin`) | 1 Row noch nicht auf vehicles (`finvin_vs_vehicle_diff=1`). Mini-Backfill bei CMM-50-Cutover. |
| `kunde_id` | 70/74 | faelle + leads; ≈ claims.geschaedigter_user_id (1 Divergenz) | GAP — CMM-63-Reconcile (s. Gap-Map). |

**Folgerung:** Der ursprünglich angenommene „5-Domänen-additiv-auf-claims"-Block schrumpft real auf: `kunde_id` (1 Divergenz, CMM-63) + `kunde_lat`/`kunde_lng` (geocodierte Kunde-Position, faelle-only, kein claim_parties-Pendant — kleiner echter Gap). Alles andere = redundant/migriert.

---

## 4 · CMM-62 — ENTSCHEIDUNG (Aaron, 31.05.): Vehicle-zentrisch

**Live-Befund:** Vorschäden- (9 Spalten) + Cardentity-Cluster (3 Spalten) auf faelle = **0/74 Daten**. Feature gemockt (`api/cardentity/typ-a|typ-b` = Mock-Routen, "In production this will call the real CarDentity API") + gated. `enrich-fahrzeug.ts` dual-schreibt Fahrzeugdaten bereits nach `vehicles` (CMM-50.0). Cardentity ist FIN-/fahrzeugbasiert, `cardentity_letzter_pull` liegt schon auf `vehicles`.

**Entscheidung → spezifiziert CMM-64:**
- `cardentity_abfrage_am`, `cardentity_report` (+ `cardentity_enriched_at`) → **`vehicles`** (zu `cardentity_letzter_pull`).
- `vorschaden_*` (hat_vorschaeden, anzahl, letzter_datum, typ_a_ergebnis, typ_b_bericht, typ_b_pdf_url, beschreibung) → **neue 1:N-Tabelle `vehicle_vorschaeden`** (`vehicle_id`-FK, `abfrage_am`-Snapshot — point-in-time je Cardentity-Abfrage).
- claim-Prozess-State `vorschaden_geprueft` / `vorschaden_erkannt` → optional additiv auf **`claims`** (ist „wurde für DIESEN Claim geprüft", nicht fahrzeug-intrinsisch).

### CMM-64 Build-Spec (nächste/eigene Session — NICHT diese Session gebaut)
1. **Schema (additiv):** `vehicle_vorschaeden` anlegen (id, vehicle_id FK→vehicles, abfrage_am, hat_vorschaeden, anzahl, letzter_datum, typ_a_ergebnis jsonb, typ_b_bericht jsonb, typ_b_pdf_url, beschreibung, created_at). `vehicles` += cardentity_abfrage_am, cardentity_report. `claims` += vorschaden_geprueft, vorschaden_erkannt. **0 Daten → kein Backfill.**
2. **RLS** für `vehicle_vorschaeden` (wer liest Vorschäden? SV/Admin/Kunde des zugehörigen Claims — via vehicle_id→claims→Party-Gate; an `is_claim_*`-Helper anlehnen).
3. **Code-Repoint:** `api/cardentity/typ-a/route.ts` + `typ-b/route.ts` (schreiben aktuell `faelle.vorschaden_*` per fall_id → künftig `vehicle_vorschaeden`/`claims` via fall_id→claims.vehicle_id) + `enrich-fahrzeug.ts` (cardentity_report → vehicles). Timeline-Inserts nutzen noch `fall_id` — auf claim_id-Quelle prüfen.
4. **Reader-Sweep:** 39 Files referenzieren `vorschaden_*`/`cardentity_*`/`hat_vorschaeden` (Stammdaten-Tabs, Briefing-Prompt, Dispatch-Phasen, seed). Auf neue Heimat umstellen.
5. **View-Repoint:** danach v_claim_full/v_faelle_mit_aktuellem_termin Vorschäden/Cardentity-Reads auf vehicle_vorschaeden/vehicles (EXCEPT-0/0).
6. Build-Gate Pflicht (API-Routen + viele Reader).

---

## 5 · NICHT gemacht (Constraints eingehalten)
- **Kein** `DROP TABLE faelle` / keine Spalten-Drops (417 Zugriffe + 47 FK).
- **Keine** 41 FK-Re-Keys (warten auf Aaron §7.1 Architektur-Entscheidung re-key vs. Assignment-Bridge).
- **Keine** Sync-Trigger gedroppt.
- **Keine** Lifecycle-/claims-Writer angefasst (Kollision mit AAR-939-Sessions: monika-embed, embed-b, monika-billing).
- **CMM-64 nicht gebaut** (eigenes Ticket, Code+RLS+Reader-Sweep, 0-Daten/keine Eile) — nur entschieden + spezifiziert.

## 6 · Empfehlung nächste Session
1. **CMM-64** bauen (Spec §4 oben, vehicle-zentrisch) — entsperrt 2 weitere v_claim_full-Repoints (vorschaden/cardentity).
2. **org_id/dispatch_id Ownership** mit Aaron klären (CMM-65-Scope?) → additiv claims → Repoint.
3. **gegner_anzahl_beteiligte/gegner_fahrzeugtyp**: claim_parties-Ableitung vs claims-Spalten entscheiden.
4. **CMM-63-Reconcile** der 1 kunde_id-Divergenz.
5. Danach v_claim_full schrittweise faelle-frei; v_claim_listing + fall_id-Bridge erst nach Aaron §7.1.
