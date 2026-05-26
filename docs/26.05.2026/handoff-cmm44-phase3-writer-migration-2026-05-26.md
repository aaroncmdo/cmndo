# CMM-44 Phase 3 (Writer-Migration) — Handoff + Bankdaten-Slice (2026-05-26)

**Kontext:** Phase-6-Readiness revalidiert (Memory `project_cmm44_phase6_readiness`) → NICHT ready, 420 `from('faelle')`-Sites. Phase 3 = die faelle-Writer auf claims/Sub-Tabellen umstellen. Diese Session: vollständige Writer-Inventur + Routing-Mechanik verstanden + erste Slice (Bankdaten) gebaut. **Apply blockiert durch DB-Pool-Saturation (8 Parallel-Sessions, db push + MCP beide 544/timeout).**

Strategie: `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` (Phase 4 = Reader, Phase 5 = Sync-Trigger weg, Phase 6 = DROP).

---

## 1 · Writer-Inventur (Subagent, 2026-05-26)

**56 `from('faelle').(update|insert|upsert|delete)`-Sites; davon 30 PRODUKTION, 26 Test/Seed/Smoke.** (Test/Seed-Scripts schreiben teils bereits gedroppte Spalten = schon kaputt; KEINE kanonischen Ziel-Spalten daraus ableiten.)

## 2 · Routing-Mechanik (zentral — VOR jeder Writer-Migration verstehen)

`src/lib/faelle/claim-duplicate-columns.ts`:
- **`CLAIM_OWNED_DUPLICATE_COLUMNS`** (~70 Spalten) + **`splitOrKeepFaelleUpdate(update, claimId)`** → routet namens-gleiche Spalten automatisch auf claims. ~14 Produktions-Writer laufen durch diesen Helper → eine Spalte hier eintragen = alle diese Writer schreiben sie auf claims (sofern die Spalte auf claims existiert + Reader dort lesen).
- **`AUFTRAEGE_OWNED_COLUMNS`** + `peelAuftraegeColumns` → Auftrag-LC-Spalten auf `auftraege`.
- **`CLUSTER1/2/3_RENAMED_TO_CLAIMS`** → Semantik-Duplikate (alter faelle-Name → anderer claims-Name), Caller schreibt direkt.

**Phase-3-Muster pro claim-globaler Spalte:** (1) ADD auf claims (additiv, IF NOT EXISTS) + IS-NULL-Backfill + View-Repoint `v_faelle_mit_aktuellem_termin` falls projiziert. (2) Spalte in `CLAIM_OWNED_DUPLICATE_COLUMNS` eintragen (→ Helper-Writer auto-routen) UND/ODER Direkt-Writer (die nicht durch den Helper laufen) manuell auf `claims.update via claim_id` repointen. (3) Direkt-faelle-Reader auf claims/Embed/View. (4) `database.types.ts` claims-Typ ergänzen. (5) tsc + Smoke. Exakt wie CMM-65 Part B / CMM-61.

## 3 · Slice-Klassifizierung (Live-Schema 2026-05-26)

**UNBLOCKED claim-global (faelle-only, noch nicht auf claims):**
- **Bankdaten** `iban, bic, kontoinhaber, bankdaten_hinterlegt_am` → claims. 1 Writer (`saveBankdaten`), 1 echter Reader (`bankdaten_hinterlegt_am`-Flag). **DIESE SLICE GEBAUT (s.u.).**
- **SV-Leadpreis** `lead_preis_netto, lead_preis_typ, lead_preis_berechnet_am` → claims. Writer: `monatsabrechnung` (direkt) + process-case-billing/revert/reissue (via Helper-Survivors). ⚠️ **Überlappung mit `gutachter_abrechnungen.leadpreis` prüfen** (konkurrierende Heimat) — eigene Reader-Analyse vor Migration.

**EIGENES SUB-PROJEKT (zu groß für eine Slice):**
- **`status`** — liegt schon auf claims+faelle (Duplikat), aber NICHT in `CLAIM_OWNED_DUPLICATE_COLUMNS`. Geschrieben von state-machine (Helper-Survivor), lexdrive, sv-zuweisung, gutachter/team, VorOrtPanel (mehrere DIREKT, nicht via Helper) + 6 Smoke-Scripts. Gelesen ÜBERALL (Views `fall_status`/`status`, hunderte Reader). Erst klären: ist claims.status konsistent/synced mit faelle.status (live)? Dann eigener Reader+Writer-Sweep wie SP-A/B. Höchster Phase-6-Hebel, höchstes Risiko.

**BLOCKED (Audit offen / fremde Heimat):**
- **Vorschaden/Cardentity** `vorschaden_*, hat_vorschaeden, cardentity_abfrage_am, vorschaden_typ_a/b_*` — Strategie §3.1c Cardentity-Audit OFFEN. Writer: cardentity typ-a/typ-b.
- **Fahrzeug/Halter/OCR** `fin_vin, kennzeichen, erstzulassung, fahrzeug_*, halter_*, hsn, tsn, ocr_*` → `vehicles`/`claim_parties`/`gutachten` (NICHT claims). Cluster-H teils begonnen, `vehicle_id` oft nicht gesetzt. Writer: ocr-gutachten/ocr-fahrzeugschein/ocr-trigger/stammdaten.saveFinVin/gutachter-fall.
- **gutachter_honorar** — SV-Honorar, Aaron 2026-05-26: separate Slice (war out-of-scope CMM-61).
- **Strukturell (kein Spalten-Move):** `convert-lead-to-claim`/`admin/faelle/anlegen` = faelle-INSERT (Fall-Erzeugung, stirbt mit Phase 6); `create-for-fall` = claim_id-Bridge-Write; `sv_id`-Writer (termin-actions/sv-lead-ablehn/sv-zuweisung/reassignCases) = sv_id hat bidir. Sync-Trigger → eigener sv_id-Slice; `besichtigungsort`/`polizei_aktenzeichen` = Sub-Table-Fallback-Writer (SP-D/gutachter_termine).

## 4 · Bankdaten-Slice — GEBAUT, APPLY PENDING POOL

**Migration `supabase/migrations/20260526172527_cmm44_phase3_bankdaten_claims_adds.sql` (geschrieben, NICHT appliziert):** ADD claims.iban/bic/kontoinhaber/bankdaten_hinterlegt_am + IS-NULL-Backfill + View-Repoint (bankdaten_hinterlegt_am RAISE-guarded weil view-gelesen; iban/bic/kontoinhaber conditional). Selbst-validierend via RAISE + BEGIN/COMMIT-Rollback → sicher zu pushen.

**Noch zu tun NACH `db push` (Pool frei):**
1. `db push` → verifizieren: claims-Spalten da, Backfill divergent_rows=0, View SELECT-bar + `c.bankdaten_hinterlegt_am`, security_invoker erhalten. Migrations-Datei = Version (kein Re-Run-Drift).
2. **Writer** `src/app/kunde/faelle/[id]/actions.ts:94` `saveBankdaten`: `admin.from('faelle').update({iban,bic,kontoinhaber,bankdaten_hinterlegt_am}).eq('id',fallId)` → `admin.from('claims').update({...}).eq('id', ownership.claimId)` (ownership.claimId ist verfügbar, Zeile 91; guard wenn null). timeline-Insert + revalidatePath bleiben.
3. **Reader** `src/lib/claims/get-kunde-faelle.ts:654` `bankdaten_hinterlegt_am: f.bankdaten_hinterlegt_am` → `c.bankdaten_hinterlegt_am ?? null` (das `c`=claims-Objekt ist in scope, s. Zeilen 644/648/651/657). **claims-Read-Select dieser Funktion um `bankdaten_hinterlegt_am` erweitern** (sonst undefined). Den faelle-`FALL_DETAIL_SELECT:436`-Eintrag `bankdaten_hinterlegt_am` entfernen (nur dort wo er ungenutzt selektiert wird) — prüfen ob :436-Select-Funktion ihn überhaupt nutzt (sah nach reinem Ownership-Check aus).
4. **Reader** `page.tsx:873` `!!fall.bankdaten_hinterlegt_am` + `fall/queries.ts:56` FALL_SELECT_KUNDE: lesen via View → der View-Repoint (Schritt 1) deckt sie automatisch, KEIN Code-Change.
5. `database.types.ts`: 4 Spalten in claims Row/Insert/Update (alphabetisch: bankdaten_hinterlegt_am nahe Anfang; bic/iban/kontoinhaber an passender Stelle).
6. tsc grün (eigene Files) + Kunde-Smoke (Bankdaten-Banner speichern → claims). PR `--base staging`.

`iban`/`bic`/`kontoinhaber` sind in-App NUR geschrieben (Auszahlungs-Referenz, kein Reader) → nach claims für Phase-6-Überleben, keine Reader-Migration nötig außer dem View-Repoint-Fallback.

## 5 · Reihenfolge-Empfehlung Phase 3

Bankdaten (gebaut) → SV-Leadpreis (nach gutachter_abrechnungen-Überlappungs-Check) → `status` als eigenes SP (größter Hebel) → sv_id-Slice → dann Cardentity/Fahrzeug nach Abschluss der offenen Audits (§3.1c, Cluster-H). Parallelisierbar (jede Spalten-Domäne = eigener Worktree/PR, gleiche Mechanik).

**Env/Gotchas:** Projekt `paizkjajbuxxksdoycev`. Pool unter ≥7 Parallel-Sessions dauer-544/timeout → db push + MCP beide tot; ruhigen Slot abwarten. DDL nur CLI (Regel 2). NICHT Merge-Session → PR `--base staging`.
