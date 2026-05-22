# CMM-44 SP-I — Kanzleifall-Lifecycle → `kanzlei_faelle` · Decomposition + I1 Design-Spec

**Datum:** 2026-05-22 · **Master:** CMM-44 (`faelle`-Drop) · Folgt auf SP-J (abgeschlossen). Größtes Einzel-Cluster (56 Spalten, hohes Risiko).

## 0 · Kontext + Aaron-Klarstellung
SP-I migriert die ~56 Kanzleifall-Lifecycle-Spalten von `faelle` auf die bestehende 1:1-Sub-Tabelle `kanzlei_faelle`. **Aaron-Entscheidung (2026-05-22):** Die DB **voll** bauen (alle 56), ABER UI-seitig schirmen wir den Großteil ab — die Kanzlei-LC-Daten liegen bei der Kanzlei/LexDrive und werden dem **Kunden nicht als Stepper-Schritte gezeigt** (wie der Claims-Stepper bereits Schritte ausblendet). Konsequenz für den Sweep: die meisten **Reader sind intern** (admin/kanzlei-Portal/lexdrive/cron), kaum Kunde-Portal.

## 1 · `kanzlei_faelle` (live gemessen 2026-05-22)
- **Existiert, 0 Rows.** 1:1 pro Claim: `UNIQUE(claim_id)` + FK→`claims(id)` ON DELETE CASCADE; zusätzlich `UNIQUE(fall_id)` + FK→`faelle(id)`. PK=`id`.
- Skelett: `id, fall_id, status, vs_kontakt_am, ausgezahlt_am, erstellt_am, updated_at, claim_id`. Die 56 SP-I-Spalten existieren dort NOCH NICHT.
- ⇒ **Pattern wie SP-G** (`gutachten`, 1:1 via UNIQUE) — Upsert by `claim_id`, create-or-update. 0 Rows pre-launch → der erste Writer legt die Row an.

## 2 · Decomposition (Aaron-approved) — 4 Sub-Cluster, je eigenes Spec→Plan→PR
| Sub | Domäne | ~Spalten | Notiz |
|---|---|--:|---|
| **I1** | Anschlussschreiben / Mandat / LexDrive / Klage-Übergabe | 15 | etabliert den **`kanzlei_faelle`-Upsert-Helper** |
| **I3** | Rüge-Workflow | 6 | klein, self-contained (2. dran — übt das Muster) |
| **I4** | Honorar / Provision / Kunde-Auszahlung / Mietwagen-Kanzlei | 7 | überlappt SP-J-Code (erstelle-abrechnung, lexdrive auszahlung_split, analytics getKosten) |
| **I2** | VS-Reaktion / Eskalation / Kürzung / Quote / Regulierung | 25 | größtes, überlappt state-machine+lexdrive; ggf. 2 PRs; zuletzt |

**Reihenfolge:** I1 → I3 → I4 → I2 (klein/Helper zuerst, größtes/risikoreichstes zuletzt).
**`kanzlei_id` (Mapping-TBD): NICHT Teil von SP-I.** Kanzlei-Zuordnung (welche Kanzlei) ist ein Claim-Attribut, kein Lifecycle-Feld → eigene Entscheidung (claims-Spalte oder bleibt faelle), separat.

## 3 · Gemeinsames Muster pro Sub-Cluster (wie SP-G/SP-D/SP-J)
1. **PR1 — ADD + Backfill + View-Repoint:** `ALTER TABLE kanzlei_faelle ADD COLUMN <cols>` (Typen live aus faelle gespiegelt, Precision-Casts). Backfill: für jeden Claim mit faelle-Daten eine `kanzlei_faelle`-Row **upsert** (INSERT … ON CONFLICT (claim_id) DO UPDATE), Werte aus faelle. Treffer-Views auf `kanzlei_faelle` repointen (Precision-Casts Pflicht — SP-G/SP-D-Lesson). DDL nur via supabase-CLI (`db query --linked` + `migration repair`, AGENTS Regel 2).
2. **PR2 — Reader/Writer-Sweep:** Reader → `kanzlei_faelle`-Lesart (1:1: `claims:claim_id(kanzlei_faelle(<col>))`-Embed bzw. `from('kanzlei_faelle')…eq('claim_id')` ; Filter-Reader auf repointete View). Writer → `upsertKanzleiFall(db, claimId, fields)`-Helper (create-or-update). Re-Grep 0 live `from('faelle')` der Sub-Cluster-Spalten. vitest + Build grün.
3. **PR3 — Catch-up:** idempotenter Upsert `kanzlei_faelle ← faelle` (wie SP-J PR3), gated auf PR2-main-Release.

### Shared-Helper (I1 legt an, I2-I4 nutzen)
`src/lib/faelle/kanzlei-fall.ts` → `upsertKanzleiFall(db, claimId, fields)` (find/create-or-update die `kanzlei_faelle`-Row eines Claims; INSERT mit `claim_id` + `fall_id` falls nötig — `fall_id` ist NOT-NULL? **in PR1 live prüfen**, sonst beim Insert mitziehen) + `getKanzleiFall(db, claimId, cols)`-Reader. Result `{ ok, error }`; throw-basierte Caller (state-machine/lexdrive) werfen bei `!ok`.

## 4 · UI-Abstraktion (Aaron-Klarstellung)
Der Großteil der SP-I-Felder ist **nicht kunde-facing**. Reader-Sweep priorisiert intern: `lib/lexdrive/*`, `admin/*`, `kanzlei/*`-Portal, `api/cron/*`, `lib/abrechnung/*`, `state-machine`. Kunde-Portal liest diese LC-Felder i.d.R. NICHT (Stepper blendet die Kanzlei-Phase ab). Pro Sub-Cluster-Spec wird die Reader-Liste live gegrept + nach Portal klassifiziert; kunde-facing Treffer (selten) explizit markiert.

## 5 · I1 — Anschlussschreiben / Mandat / LexDrive / Klage (Detail)
**Spalten (~15, alle MOVE):** `anschlussschreiben_am` (timestamptz), `anschlussschreiben_url` (text), `anschlussschreiben_sendedatum` (date), `anschlussschreiben_unterschrift` (bool), `anschlussschreiben_ocr_am` (timestamptz), `mandatsnummer` (text), `lexdrive_case_id` (text), `lexdrive_ocr_data` (jsonb), `lexdrive_ocr_received_at` (timestamptz), `klage_uebergeben_am` (timestamptz), `as_geforderte_summe` (numeric), `as_frist` (date), `as_vs_reaktion_text` (text), `as_salesforce_id` (text), `as_zuletzt_synced_am` (timestamptz).
**Bekannte Writer (Vorab, in PR2 live verifizieren):** `lib/lexdrive/process-event.ts` (`mandatsnummer`/`as_salesforce_id` via `mandatsnummer_vergeben`-Event; `anschlussschreiben_am` via `as_versendet`), `state-machine.ts` (`anschlussschreiben_am` bei status `anschlussschreiben`), `lib/lexdrive/email-sender` (AS-Versand), AS/Salesforce-Sync-Cron. **Reader:** überwiegend admin/kanzlei-Fallakte + lexdrive — kaum Kunde.
**`anschlussschreiben_am`-Konflikt mit I2:** state-machine setzt `anschlussschreiben_am` UND `regulierung_am` (I2) im selben `update`-Objekt. Beide gehen nach `kanzlei_faelle` → der Writer-Reroute muss beide Sub-Cluster gemeinsam berücksichtigen, sobald der jeweils andere live ist (Reihenfolge I1 vor I2: I1 peelt `anschlussschreiben_am`, I2 später `regulierung_am`; bis dahin bleibt `regulierung_am` auf faelle). **In PR2 dokumentieren.**

## 6 · Migrations-/PR-Vorgehen
DDL via supabase-CLI. PR `--base staging`. 2-Stufen-Review (Spec+Quality, read-only-git). Catch-up gated auf main. **Vor jeder Migration `information_schema` live nachmessen** (andere Sessions droppen parallel — [[feedback_information_schema_check]]). Live-Schema-Probe für CHECK-Domains vor Rename-Mappings (SP-J-zahlungsweg-Lesson: Namensgleichheit ≠ Semantik) — bei SP-I alle MOVE (kein Rename), aber `status`/`vs_kontakt_am`/`ausgezahlt_am` existieren schon auf kanzlei_faelle → Kollision mit faelle-Spalten prüfen.

## 7 · Risiken
- **Größtes Cluster + SP-J-Overlap:** I2/I4 fassen Code an, den SP-J gerade geändert hat (state-machine, lexdrive, erstelle-abrechnung, analytics). Reihenfolge + Re-Grep diszipliniert.
- **0 Rows + 1:1-Upsert:** Row-Lifecycle klar definieren (wann wird die kanzlei_faelle-Row angelegt — beim ersten LC-Write des Claims).
- **Skelett-Spalten-Kollision:** `status` existiert auf faelle UND kanzlei_faelle (verschiedene Semantik?) — live prüfen, nicht blind mappen.
- **`fall_id` NOT-NULL auf kanzlei_faelle?** → Upsert muss fall_id mitziehen. PR1 misst.

## 8 · Definition of Done (gesamt SP-I)
Alle 4 Sub-Cluster: ADD+Backfill auf kanzlei_faelle, Reader/Writer rerouted, Views repointed, Catch-up, Re-Grep 0, Build+vitest grün, Portal-Smoke (intern-fokussiert) 0 Regression, Phase-1-Mapping + Handoff je Sub-Cluster. `kanzlei_id` separat entschieden.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
