# Handoff — CMM-44 SP-I2 (AS-Lifecycle + Mandatsnummer → `kanzlei_faelle`)

**Datum:** 2026-05-23 · **Branches/PRs:** PR1 #1570, PR2 #1581 (beide auf `staging`), Abschluss-PR (dieser).
**Spec/Plan:** `docs/superpowers/{specs,plans}/2026-05-23-cmm44-spi2-anschlussschreiben*.md`

## Was erledigt ist

11 Spalten — 10 AS-Lifecycle (`anschlussschreiben_*`, `as_*`) + `mandatsnummer` — von `faelle` auf die 1:1-Sub-Table `kanzlei_faelle` migriert. **Rein additiv** (DROP → Phase 6).

- **PR1 #1570** (Migration `20260523105042`, CLI-applied + repair): 11 ADD auf `kanzlei_faelle` + 3 View-Repoints (`v_faelle_mit_aktuellem_termin` — genau 1 kf-Join, SP-I1 hatte ihn schon; `v_claim_full` `anschlussschreiben_am`; `faelle_sv_view` +`mandatsnummer`/+`lexdrive_case_id`). `anschlussschreiben_unterschrift` (default false) via `COALESCE(kf…, false)` im View. `mandatsnummer`-Backfill: 12 `kanzlei_faelle`-Rows (`status='versicherungskontakt'`). AS-Spalten cov=0.
- **PR2 #1581**: Helper `upsertKanzleiFall`/`peelKanzleiFaelleColumns` (`src/lib/kanzlei-fall/upsert-kanzlei-fall.ts`) = **erster Row-Creator** von `kanzlei_faelle` (select-then-insert-or-update, `status` nur on-insert). Writer (state-machine/process-event/push-mandat/dokumente) via Helper. **`filmcheck.ts` CLM-YYYY-Generator entfernt** (`claim_nummer` ist kanonisch). Reader auf `kanzlei_faelle`. **Label=beides**: `claim_nummer` primär + `mandatsnummer` sekundär (via `kanzlei_faelle(mandatsnummer)`-Embed, reverse-FK `fall_id`, 1:1). Kunde: Frist-Card + WA-Hinweis (lean). SV: `mandatsnummer` read-only **ab Kanzlei-Phase**.

## `mandatsnummer`-Semantik (geklärt, live gemessen)

`faelle.mandatsnummer` = **Salesforce/Kanzlei-Mandat-ID** (`001Jz…`), NICHT die Fallnummer. `claims.claim_nummer` (`CLM-2026-…`) ist die kanonische Fallnummer (SP-A3). Der `filmcheck`-CLM-Write war tot/überschrieben → entfernt. Aaron: „mandatsnummer bekomme ich von der Kanzlei zurückgespielt".

## Review-Befunde (2-stufig)

Code-Quality-Review fand **untergesweepte mandatsnummer-Reader** (kritisch **I4**: `kanzlei-wunsch`-Idempotenz-Guard las `faelle.mandatsnummer` → für neue Fälle null → **Doppel-Push an LexDrive/Salesforce**). I1–I6 + I9 inline gefixt (Helper-Subagent lief ins Session-Limit, daher Controller-inline). 14 verbleibende Re-Grep-Hits verifiziert (false-positive Embed/upsert-Reads + intentional). tsc 0, voller Build grün.
Deferred Minors: I7/I8 (claimloser `create-test-fall` hält `mandatsnummer` auf `faelle` bis Phase-6), I10 (ungenutzter blocker-detection-Embed), I11 (totes seed-Feld), I12 (`mt-1`).

## PR3 (LexDrive-SV-Embed) — GESTRICHEN

Empirischer Spike (echtes LexDrive-Login `aarons.98@web.de`, eingeloggt): das LexDrive-Salesforce-Portal sendet beim Page-Load `Content-Security-Policy: frame-ancestors 'self' https://lex-drive.com` → **`app.claimondo.de` darf es NICHT iframen** (auch mit gültiger Session, 2× bestätigt). Der Deep-Link funktioniert dagegen voll: die `aktendetailansicht?recordId=…` rendert den **kompletten Mandatsverlauf** (Workflow Interessent→…→Abgeschlossen + Tabs Mandant/Anspruchsschreiben/Gutachten/Dokumente).
→ Die **erreichbare** SV-Variante ist bereits live: Deep-Link (`MeinFallStatusCard`, `lexdriveCaseId`, CMM-23) + `mandatsnummer` (PR2). **Inline-Embedding nur möglich, wenn LexDrive `app.claimondo.de` in ihre `frame-ancestors`-Allowlist aufnimmt** (deren Salesforce-Config). Aaron-Entscheidung 2026-05-23: vorerst NICHT verfolgen.
(Spike-Script + PII-Screenshots gelöscht — enthielten echte Mandatsdaten.)

## PR4 (Catch-up-Backfill) — No-op by design

AS-Spalten cov=0; `mandatsnummer` in PR1 backfilled. Es gibt keinen Datenbestand, der im Fenster PR1-Apply→PR2-Deploy auf `faelle` gelandet sein könnte (pre-launch). **Vor einem evtl. Lauf** mit `scripts/cmm44-spi2-measure.sql` + dem Parity-Query (Handoff) verifizieren; bei 0 Diskrepanz entfällt PR4.

## Verifikation

`spi2_cols=11`; alle View-Quellen-Booleans true; `vterm_kf_joins=1`; `kf_mandat=12`; tsc 0; voller Build grün; Re-Grep 0 echte faelle-Reads/Writes der 11. **Portal-Smoke HARD=0** (`scripts/smoke-cmm44-spi2.mjs`, Protokoll `cmm44-spi2-smoke.md`): admin/kanzlei/kunde/public rendern; admin-Hub zeigt `claim_nummer` als Fall-Nr-Label.

## Lessons

- **iframe-Embedding IMMER mit echtem Browser-Load testen** (Playwright `setContent`+iframe), nie nur `curl -I` — die Salesforce-LWR-Runtime setzt `frame-ancestors` erst beim Page-Load (HEAD verfehlt sie).
- `kanzlei_faelle(col)`-Embed geht **direkt von `faelle`** über reverse-FK `fall_id` (1:1) — Array-Normalisierung Pflicht.
- 2-Stufen-Review fängt untergesweepte Reader, die ein cov-additiver Sweep „grün" aussehen lässt (faelle behält die Werte → Reader sehen sie für ALTE Fälle, brechen erst für NEUE).
- `upsertKanzleiFall` = erster Row-Creator von `kanzlei_faelle`; `status='versicherungskontakt'` nur on-insert.

## Nächster CMM-44-Schritt

SP-I-Restmenge: **Regulierung/VS-Cluster** (`regulierung_am`, `vs_reaktion_*`, `vs_eskalationsstufe`, `kuerzungs_betrag`, `vs_frist_bis`, `as_*`-VS-Detail …) → `kanzlei_faelle`, oder `kanzlei_id` + Kanzlei-DUP-Spalten. Alternativ anderes Cluster (SP-C Parteien laufend, SP-E/F Fahrzeug/Vorschäden). Memory: `project_cmm44_spi2_status`.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
