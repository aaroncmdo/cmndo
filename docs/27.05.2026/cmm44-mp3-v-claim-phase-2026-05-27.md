# CMM-44 MP-3 — `v_claim_phase` + `getClaimLifecycle` neue Ableitung (2026-05-27)

> Branch `kitta/cmm44-claim-phase-mp3` (off staging, enthält MP-2). Setzt §12-MP-3 +
> B-10/B-11/B-12 um. Read-Side-Ableitungswechsel; Writer (terminales claims.status,
> lexdrive-Setzen) = MP-7/MP-8. Reader-Rewrite = MP-4.

---

## 0 · Auftrag + Aaron-Entscheidung

Die Phasen-Ableitung (SQL-View `v_claim_phase` + TS-Loader `getClaimLifecycle`, müssen
bitgleich sein) wechselt:
- **regulierung-Eintritt** von „kanzlei_faelle existiert" → **`kanzlei_faelle.lexdrive_case_id IS NOT NULL`** (B-10).
- **abschluss** von payment-/auszahlung-basiert → **`claims.status`-terminal** (B-11/B-12).

**Aaron (27.05.):** Option 1 (lexdrive-Gate jetzt) — „Kanzleifall durch lexdrive case id getriggert".
Interim (kf da, lexdrive null) = begutachtung-Tail **„Kanzlei-Übergabe läuft"** (`kanzlei_uebergabe`).
Die kf-Row-Erzeugung an lexdrive zu koppeln wäre ein Writer-Change (MP-8); der MP-3-Read-Gate
liefert „regulierung = lexdrive-getriggert" bereits ohne Daten-/Writer-Änderung.

---

## 1 · Was gemacht wurde

- **Migration** `supabase/migrations/20260527075024_cmm44_mp3_v_claim_phase_lexdrive_abschluss.sql`
  (CREATE OR REPLACE VIEW): JOIN `claims` für `status`; Prioritäts-Kaskade
  **abschluss(claims.status-terminal) > regulierung(lexdrive) > Kanzlei-Übergabe-Interim(kf existiert) >
  begutachtung(eg) > erfassung**. Via supabase-CLI (`db push`, Regel 2) auf Prod appliziert.
- **Loader** `src/lib/claims/lifecycle.ts`: `ClaimLifecycleInput += claimStatus`; `ClaimSubPhase`
  +`kanzlei_uebergabe`/`erfolgreich_reguliert`/`storniert`/`klage_rechtsstreit`/`verjaehrt`,
  −`abgeschlossen`; `getClaimLifecycle`-Logik = bitgleich zur View; `SUBPHASE_LABEL` + `mainPhaseOf`
  nachgezogen. `get-claim-lifecycle-for-claim.ts` lädt `claims.status` (claim_id==fallId) + reicht
  `claimStatus` durch.
- **Substate-Mapping (B-5/B-11):** reguliert_vollstaendig→erfolgreich_reguliert · storniert→storniert ·
  klage_rechtsstreit→klage_rechtsstreit · verjaehrt→verjaehrt.
- **Tests** (`lifecycle.test.ts`, `get-claim-lifecycle-for-claim.test.ts`) auf die neue Ableitung
  umgeschrieben. **Probes:** `probe-claim-phase-parity.mjs` um claims.status + lexdrive erweitert; neue
  `probe-claim-phase-mp3-logic.mjs` (synthetische Branch-Coverage ohne vitest).
- **ClaimStepper**: KEINE Code-Änderung nötig — rendert `SUBPHASE_LABEL[subPhase]` generisch
  (exhaustiv getypt → neue Substates erscheinen automatisch).

---

## 2 · Live-Befunde + Auswirkung (Prod, 27.05.)

- **Phase-Shift: exakt 12 Fälle** `regulierung/versicherungskontakt → begutachtung/kanzlei_uebergabe`
  (alle 12 kanzlei_faelle haben `lexdrive_case_id = NULL`). **Sonst NICHTS** (ad-hoc-View-SQL gegen
  Live-Daten verifiziert, vor Apply). Neue Verteilung: begutachtung:12, erfassung:53 · sub:
  kanzlei_uebergabe:12, vollmacht_offen:52, sa_offen:1. regulierung/abschluss live = 0 (erwartungsgemäß:
  lexdrive 0, claims.status terminal 0).
- **`claims.status`-Vokabular:** CHECK erlaubt heute `dispatch_done/in_bearbeitung/in_kommunikation_vs/
  reguliert/abgelehnt/an_externe_kanzlei_uebergeben/storniert` — NICHT das volle B-11-Terminal-Vokabular
  (`reguliert_vollstaendig/klage_rechtsstreit/verjaehrt` fehlen). View nutzt das B-11-Vokabular
  forward-ready (abschluss-Branch heute tot, da kein Fall terminal). `storniert` überlappt → B-7-Stornos
  greifen, sobald ein Writer den Wert setzt. **CHECK-Erweiterung + KB-/Kanzlei-Writer = MP-7/MP-8.**

---

## 3 · Verifikation

- **Logik-Probe** (`probe-claim-phase-mp3-logic.mjs`, node type-strip): **16/16 ok** — Interim,
  lexdrive-regulierung, B-12 (Auszahlung≠abschluss), alle 4 terminalen abschluss-Substates,
  nicht-terminaler claimStatus ignoriert, erfassung/begutachtung-Regress.
- **Parity-Probe** (`probe-claim-phase-parity.mjs`, Live-Daten): **0 Divergenzen / 65 Claims** zwischen
  Loader (TS) und neuer View (SQL). View↔Loader bitgleich.
- **Ad-hoc-View-SQL** vor Apply: 12-Shift wie erwartet, keine Überraschung.
- **Reader-Safety:** `v_claim_phase` hat **0 SQL-Consumer** in der App (nur Kommentare in den
  lifecycle-Files) → View-Änderung bricht keinen Reader; Migration der Reader = MP-4. Einziger
  Live-Consumer von `getClaimLifecycle` = Kunde-`ClaimStepper` (zeigt neue Substate-Labels, gewollt).
- **`tsc`/`vitest` lokal nicht lauffähig** (Worktree-Environment degradiert: symlink-`node_modules` mit
  leerem `.bin` / vitest nicht auflösbar / `Cannot find module 'next'` in unbeteiligten Files — NICHT
  MP-3). Runtime via node-Probes verifiziert; CI (frischer `npm ci`) ist der Typecheck/Build-Gate.

---

## 4 · Migration-Sequencing-Hinweis

Die View-Migration ist via CLI **auf Prod appliziert** (vor Code-Deploy — strecke-Pattern). Da
`v_claim_phase` **0 App-Consumer** hat und der einzige Live-Consumer (`getClaimLifecycle` im
Kunde-Stepper) erst beim PR-Deploy auf die neue Logik wechselt, gibt es **kein** user-sichtbares
View↔Loader-Fenster. Reversibel (CREATE OR REPLACE zurück auf P0). Nur diese eine Migration war pending
(remote schema_migrations bis 20260526202512, lokal alles applied).

---

## 5 · Follow-ups (nicht MP-3)

- **MP-4 (Reader portal-weise):** Listen/Kanban/Portale auf `v_claim_phase`/`getClaimLifecycle`
  umstellen; KEINE Klage-Hauptphase (B-1); kanzlei_uebergabe + terminale Substates anzeigen.
- **MP-7/MP-8:** `claims.status`-CHECK um `reguliert_vollstaendig`/`klage_rechtsstreit`/`verjaehrt`
  erweitern + KB/Kanzlei-Writer (terminaler abschluss, B-6/B-11) + lexdrive_case_id-Setzen (regulierung-
  Eintritt) + no-show/storno→claims (B-7/B-8).
- **`aktuelle_phase`-Alias-Repoint (DE-3)** + Cron `pflichtdokumente-reminder` (liest aktuelle_phase) =
  MP-4/MP-5 (MP-3 fasst `aktuelle_phase` NICHT an).

---

## 6 · 7-Punkte-Audit

- **Build:** Logik-Probe 16/16 + Parity 0/65 + ad-hoc-SQL ok. tsc/vitest lokal env-blockiert (§3),
  CI autoritativ.
- **UI:** kein neuer Einstiegspunkt; ClaimStepper unverändert (rendert neue Substates via SUBPHASE_LABEL).
- **Redundanz:** View + Loader = die zwei Faces derselben Ableitung, bitgleich gehalten (Parity-Gate);
  kein Logik-Duplikat (Probe ruft die ECHTE getClaimLifecycle).
- **Dead-Code:** `abgeschlossen`-ClaimSubPhase entfernt (kein Consumer); payment-basierte abschluss-Logik raus.
- **Spec:** B-10 (lexdrive-Gate, Aaron Option 1) + B-11/B-12 (claims.status-terminal, Auszahlung≠abschluss)
  + B-5/B-7-Substates. Forward-ready claims.status-Vokabular dokumentiert (§2).
- **Inkonsistenz:** DB live verifiziert (viewdef, schema_migrations, claims.status-CHECK); View/Loader-
  Prioritätskaskade identisch.
- **Regression:** v_claim_phase 0 SQL-Consumer; ClaimSubPhase-Removal referenzfrei; Parity 0/65.

---

## 7 · Dateien

- `supabase/migrations/20260527075024_cmm44_mp3_v_claim_phase_lexdrive_abschluss.sql` — **neu**, appliziert
- `src/lib/claims/lifecycle.ts` — Ableitung + Typen + Labels
- `src/lib/claims/get-claim-lifecycle-for-claim.ts` — claims.status-Fetch + claimStatus
- `src/lib/claims/lifecycle.test.ts` · `get-claim-lifecycle-for-claim.test.ts` — neue Ableitung
- `scripts/probe-claim-phase-parity.mjs` — claims.status + lexdrive
- `scripts/probe-claim-phase-mp3-logic.mjs` — **neu**, synthetische Branch-Coverage
