# CMM-44 SP-B — Claims-native ADD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 64 claim-globalen `faelle`-Spalten (Phase-1-Verdikt `CLAIMS`) auf `claims` anlegen und alle Reader/Writer von `faelle` auf `claims` umstellen. Rein additiv — kein `DROP COLUMN`.

**Architecture:** PR1 = additive Migration (64× `ADD COLUMN` auf `claims`, Typ/Default/NOT-NULL von `faelle` gespiegelt, + Backfill + ggf. View-Repoint). PR2a/b/c = Reader/Writer-Sweep pro Domänen-Cluster (code-only). PR3 = Catch-up-Backfill (additive Migration). Die `faelle`-Spalten bleiben stehen und fallen gesammelt mit `DROP TABLE faelle` in Phase 6 (SP-L). Kein PR enthält destruktives DDL.

**Tech Stack:** Next.js 15, TypeScript, `@supabase/supabase-js`, Supabase CLI (Migrations), Postgres, Playwright (Portal-Smoke).

**Spec:** `docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md`

---

## Vorbedingungen & Kontext

- **Worktree:** Diese Arbeit läuft im Worktree `.claude/worktrees/cmm-44-spb`, Branch `kitta/cmm-44-spb` (aus `origin/staging`). Pro PR ein eigener Branch gegen `staging` (Memory: PRs immer `--base staging`).
- **Harte Regeln (AGENTS.md):** Nie auf `main` pushen. DDL nur über supabase-CLI (`db query --linked` + `migration repair`), nie Management-API. Kein unbegleiteter Stash am Session-Ende.
- **DB-Apply-Muster (SP-A2/A3-bewährt):** Migration in `BEGIN/COMMIT`; Dry-Run `BEGIN; … ROLLBACK;`; Apply via `npx supabase db query --linked --file <sql>`; danach `npx supabase migration repair --status applied <version>`. **Kein** `db push`.
- **Supabase-Link:** Der Worktree ist gelinkt (`.env.local` + `supabase/.temp` wurden aus dem Haupt-Checkout kopiert). `db query --linked` läuft direkt im Worktree.
- **Commit-Format:** Jeder Commit braucht den 7-Punkte-Audit-Block im Body (AGENTS.md). Umlaute Pflicht — ein Pre-Commit-Hook blockt ASCII-Ersatz.
- **Gates sind entspannt:** SP-B ist additiv → kein destruktives DDL → die strenge „Migration darf Code nicht vorauslaufen"-Sequenzierung von SP-A/A2/A3 entfällt. PR1 ist jederzeit sicher applizierbar.

---

## Referenz: Die 64 Spalten

Live gemessen 2026-05-18 (`scripts/cmm44-spb-measure.sql`). `udt` = Postgres-Typ, `null` = NOT NULL wenn `NO`, `def` = Default. Spalte „Cl" = PR2-Cluster.

| Spalte | udt | null | def | Cl |
|---|---|---|---|--:|
| `makler_id` | uuid | YES | — | a |
| `betreuungspaket` | betreuungspaket | YES | `'vollservice'` | a |
| `notizen` | text | YES | — | a |
| `prioritaet` | text | YES | `'normal'` | a |
| `onboarding_complete` | bool | YES | `false` | a |
| `status_changed_at` | timestamptz | YES | `now()` | a |
| `google_review_gesendet` | bool | YES | `false` | a |
| `datenschutz_akzeptiert` | bool | YES | `false` | a |
| `datenschutz_akzeptiert_am` | timestamptz | YES | — | a |
| `interne_notizen` | text | YES | — | a |
| `ist_aktiv` | bool | YES | `true` | a |
| `deaktiviert_am` | timestamptz | YES | — | a |
| `deaktiviert_grund` | text | YES | — | a |
| `deaktiviert_notiz` | text | YES | — | a |
| `szenario` | text | YES | `'normalfall'` | a |
| `service_typ` | text | **NO** | `'komplett'` | a |
| `geschlossen_grund` | text | YES | — | a |
| `bevorzugter_kanal` | text | YES | — | a |
| `sprache` | text | YES | `'de'` | a |
| `fallakte_angelegt_am` | timestamptz | YES | — | a |
| `google_review_prompt_gezeigt_am` | timestamptz | YES | — | a |
| `sv_zugewiesen_am` | timestamptz | YES | — | a |
| `kundenbetreuer_fallback_flag` | bool | **NO** | `false` | a |
| `kundenbetreuer_zugewiesen_am` | timestamptz | YES | — | a |
| `eskaliert_an_admin_id` | uuid | YES | — | a |
| `eskaliert_am` | timestamptz | YES | — | a |
| `eskaliert_grund` | text | YES | — | a |
| `abtretung_pdf` | text | YES | — | b |
| `vollmacht_pdf` | text | YES | — | b |
| `abtretung_signiert_am` | timestamptz | YES | — | b |
| `vollmacht_signiert_am` | timestamptz | YES | — | b |
| `sa_unterschrieben` | bool | YES | `false` | b |
| `sa_unterschrieben_am` | timestamptz | YES | — | b |
| `sa_pdf_url` | text | YES | — | b |
| `sa_unterschrift_url` | text | YES | — | b |
| `vollmacht_status` | text | YES | `'ausstehend'` | b |
| `vollmacht_geprueft_am` | timestamptz | YES | — | b |
| `vollmacht_geprueft_von` | text | YES | — | b |
| `vollmacht_pruefung_status` | text | YES | — | b |
| `vollmacht_pruefung_begruendung` | text | YES | — | b |
| `mietwagen_seit_datum` | date | YES | — | c |
| `mietwagen_limit_tage` | integer | YES | — | c |
| `mietwagen_limit_grund` | text | YES | — | c |
| `mietwagen_rechnung_vorhanden` | bool | **NO** | `false` | c |
| `mietwagen_rechnung_url` | text | YES | — | c |
| `mietwagen_argumentations_puffer` | integer | **NO** | `3` | c |
| `mietwagen_vermieter` | text | YES | — | c |
| `schadens_hoehe_netto` | numeric | YES | — | c |
| `schadens_ursache` | text | YES | — | c |
| `zeugen_vorhanden` | bool | **NO** | `false` | c |
| `bkat_unfallart` | bkat_unfallart | YES | — | c |
| `werkstatt_seit_datum` | date | YES | — | c |
| `fahrzeug_fahrbereit` | bool | YES | — | c |
| `fahrzeugschaden_beschreibung` | text | YES | — | c |
| `abrechnungsart_besprochen` | text | YES | — | c |
| `abrechnungsart_notiz` | text | YES | — | c |
| `abrechnungsart_besprochen_am` | timestamptz | YES | — | c |
| `unfallmitteilung_status` | text | YES | `'nicht_erforderlich'` | c |
| `dokumente_vollstaendig_fuer_phase` | text | YES | — | c |
| `dokumente_vollstaendig_am_phase` | timestamptz | YES | — | c |
| `dokumente_reminder_whatsapp_letzte_sendung` | timestamptz | YES | — | c |
| `zb1_status` | text | YES | — | c |
| `kanzlei_ansprechpartner_position` | text | YES | — | c |
| `leasinggeber_informiert` | bool | YES | `false` | c |

**Hinweis Generator vs. explizit:** Spec §4 nennt einen Generator für die `ADD COLUMN`-Statements. Da die Live-Messung die 64 Definitionen bereits exakt geliefert hat, führt dieser Plan sie direkt aus (Task 1) — gleicher Effekt, ein Moving-Part weniger. Task 0 misst vor dem Apply erneut gegen die Drift.

---

## File Structure

**Neu:**
- `scripts/cmm44-spb-measure.sql` — Live-Messung (existiert bereits, committet mit dem Spec).
- `scripts/cmm44-spb-views-audit.sql` — View-Audit-Query (Task 1).
- `scripts/cmm44-spb-verify.sql` — Verify-Query nach PR1/PR3 (Task 2/6).
- `scripts/smoke-cmm44-spb.mjs` — Portal-Smoke (Vorlage `scripts/smoke-cmm44-spa2-pr2.mjs`).
- `supabase/migrations/<ts>_cmm44_spb_add_64_claims_columns.sql` — PR1.
- `supabase/migrations/<ts>_cmm44_spb_catchup_backfill.sql` — PR3.
- `docs/18.05.2026/cmm44-spb-views-audit.md`, `…-inventory-cluster-{a,b,c}.md`, `…-smoke-{pr2a,pr2b,pr2c,pr3}.md` — Audit-/Inventur-/Smoke-Protokolle.

**Modifiziert (PR2a/b/c):** `src/`-Files mit `faelle`-seitigem Zugriff auf die 64 Spalten (Inventur je Cluster). Types: `src/lib/supabase/database.types.ts` (PR1).

---

## Transform-Regelwerk (PR2 Reader/Writer-Sweep)

**Kern-Unterschied zu SP-A2/A3:** SP-B benennt **nicht um** — `faelle.notizen` → `claims.notizen`, gleicher Spaltenname. Die Änderung sitzt nur in der **DB-Zugriffs-Schicht** (welche Tabelle), nicht bei Property-Zugriffen/Interfaces/JSX. Jede Fundstelle fällt in genau eines dieser Muster:

| Muster | Erkennung | Transform |
|---|---|---|
| **A — Direkt-Select aus `faelle`, nur SP-B-Spalten** | `from('faelle').select('id, claim_id, <nur SP-B-Spalten>')` | Query-Quelle auf `claims` umstellen: `from('claims').select('id, <SP-B-Spalten>')`. Filter `eq('id', fallId)` → `eq('id', claimId)` bzw. `eq('claim_id', …)`-Logik anpassen (claims-PK ist die Claim-`id`). |
| **B — Direkt-Select aus `faelle`, gemischt** | `from('faelle').select('… <SP-B-Spalte> … <faelle-only-Spalte> …')` (Select enthält auch Nicht-SP-B-Spalten) | `faelle`-Select bleibt für die Nicht-SP-B-Spalten; SP-B-Spalten in einen nested `claims:claim_id(<SP-B-Spalten>)`-Block ziehen; Lesezugriffe der SP-B-Spalten auf das normalisierte claims-Objekt umstellen — Nested-FK mit `Array.isArray(x) ? x[0] : x` normalisieren (AGENTS.md §Inkonsistenz). |
| **C — Write auf `faelle`** | `from('faelle').update({… <SP-B-Spalte> …})` oder `.insert({… <SP-B-Spalte> …})` | SP-B-Spalten-Writes auf `claims`: `from('claims').update({<SP-B-Spalten>}).eq('id', claimId)`. **Kein Sync-Trigger** — der Write MUSS `claims` treffen, sonst geht der Wert verloren. Nicht-SP-B-Spalten im selben Objekt bleiben auf `faelle` → ggf. zwei getrennte Updates. |
| **D — Nested `faelle(...)`-Select von anderer Tabelle** | `from('<x>').select('…, faelle(… <SP-B-Spalte> …)')` | SP-B-Spalte aus dem `faelle(...)`-Block in einen `claims(...)`-Block ziehen (Quelltabelle muss `claim_id` o.ä. führen) bzw. `faelle(claims(<SP-B-Spalte>))` schachteln; Lesezugriff entsprechend normalisieren. |
| **E — View-Read** | `from('v_claim_full' \| 'v_claim_listing' \| 'faelle_kunde_view' \| 'faelle_sv_view' \| 'v_faelle_mit_aktuellem_termin' \| …).select('… <SP-B-Spalte> …')` | PR1 hat die View auf die `claims`-Quelle repointet — **Spaltenname unverändert → kein Code-Change**. Nur verifizieren, dass die View die Spalte führt (Task 1 View-Audit-Doc). |
| **F — Reiner TS-Typ / JSX / Property-Zugriff** | Property in `interface`/`type`, `obj.<SP-B-Spalte>` ohne DB-Zugriff, JSX-Anzeige | **Kein Change** — der Spaltenname ist identisch. Ausnahme: ein Typ, der die Tabellen-Herkunft explizit kodiert (`type FaelleRow = …`) und nun ein claims-Objekt beschreibt → Typ-Quelle korrigieren (z.B. `Database['public']['Tables']['claims']['Row']`), aber **kein** Feld-Rename. |

**Verify-Endzustand je Cluster:** kein `from('faelle')`-Select/Update und kein `faelle(...)`-Nested-Select referenziert mehr eine Cluster-Spalte; `npm run build` grün; Portal-Smoke ohne Hard-Fail.

---

## Task 0: Live-DB-Drift-Check

**Files:** nutzt `scripts/cmm44-spb-measure.sql` (existiert).

- [ ] **Step 1: 64-Spalten-Messung erneut fahren**

Run:
```bash
npx supabase db query --linked --file scripts/cmm44-spb-measure.sql
```
Expected: `TOTALS`-Zeile + 64 Detailzeilen, jede `claims: frei`, keine `!! FEHLT auf faelle`. Zeigt eine Zeile `!! CLAIMS-KOLLISION`, hat eine andere Session die Spalte bereits auf `claims` angelegt → diese Spalte aus dem PR1-`ADD`-Block streichen und im Ausführungs-Log vermerken. Zeigt eine Zeile `!! FEHLT auf faelle`, wurde sie gedroppt → aus dem gesamten SP-B-Scope streichen.

- [ ] **Step 2: Kein Commit** — reiner Verifikationsschritt.

---

## Task 1: PR1 — View-Audit + Migration schreiben + Dry-Run

**Branch:** `kitta/cmm-44-spb-pr1-add-columns`, frisch von `origin/staging`.

**Files:**
- Create: `scripts/cmm44-spb-views-audit.sql`
- Create: `scripts/cmm44-spb-verify.sql`
- Create: `docs/18.05.2026/cmm44-spb-views-audit.md`
- Create: `supabase/migrations/<ts>_cmm44_spb_add_64_claims_columns.sql`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spb-pr1-add-columns origin/staging
```

- [ ] **Step 2: View-Audit-Query schreiben**

Datei `scripts/cmm44-spb-views-audit.sql` — welche Views führen heute eine SP-B-Spalte als Ausgabespalte (also aus `faelle` gespeist)?

```sql
-- CMM-44 SP-B — welche Views exponieren eine der 64 SP-B-Spalten?
SELECT c.table_name AS view_name, c.column_name
FROM information_schema.columns c
JOIN information_schema.views v
  ON v.table_schema = c.table_schema AND v.table_name = c.table_name
WHERE c.table_schema = 'public'
  AND c.column_name IN (
    'makler_id','betreuungspaket','notizen','prioritaet','onboarding_complete',
    'status_changed_at','google_review_gesendet','datenschutz_akzeptiert',
    'datenschutz_akzeptiert_am','interne_notizen','ist_aktiv','deaktiviert_am',
    'deaktiviert_grund','deaktiviert_notiz','szenario','service_typ','geschlossen_grund',
    'bevorzugter_kanal','sprache','fallakte_angelegt_am','google_review_prompt_gezeigt_am',
    'sv_zugewiesen_am','kundenbetreuer_fallback_flag','kundenbetreuer_zugewiesen_am',
    'eskaliert_an_admin_id','eskaliert_am','eskaliert_grund','abtretung_pdf','vollmacht_pdf',
    'abtretung_signiert_am','vollmacht_signiert_am','sa_unterschrieben','sa_unterschrieben_am',
    'sa_pdf_url','sa_unterschrift_url','vollmacht_status','vollmacht_geprueft_am',
    'vollmacht_geprueft_von','vollmacht_pruefung_status','vollmacht_pruefung_begruendung',
    'mietwagen_seit_datum','mietwagen_limit_tage','mietwagen_limit_grund',
    'mietwagen_rechnung_vorhanden','mietwagen_rechnung_url','mietwagen_argumentations_puffer',
    'mietwagen_vermieter','schadens_hoehe_netto','schadens_ursache','zeugen_vorhanden',
    'bkat_unfallart','werkstatt_seit_datum','fahrzeug_fahrbereit','fahrzeugschaden_beschreibung',
    'abrechnungsart_besprochen','abrechnungsart_notiz','abrechnungsart_besprochen_am',
    'unfallmitteilung_status','dokumente_vollstaendig_fuer_phase','dokumente_vollstaendig_am_phase',
    'dokumente_reminder_whatsapp_letzte_sendung','zb1_status','kanzlei_ansprechpartner_position',
    'leasinggeber_informiert')
ORDER BY c.table_name, c.column_name;
```

- [ ] **Step 3: View-Audit ausführen + dokumentieren**

Run: `npx supabase db query --linked --file scripts/cmm44-spb-views-audit.sql`

Ergebnis nach `docs/18.05.2026/cmm44-spb-views-audit.md` schreiben: Tabelle `view_name | column_name`. Für **jede** Treffer-View per `pg_get_viewdef` prüfen, ob die Spalte aus `f.<col>` (faelle-Alias) gespeist wird:
```bash
echo "SELECT pg_get_viewdef('public.<view_name>', true);" > /tmp/spb-viewdef.sql
npx supabase db query --linked --file /tmp/spb-viewdef.sql
```
- Ist die Trefferliste **leer** → kein View-Repoint nötig, Step 5 Block 3 entfällt.
- Sind Treffer da → die betroffenen Views müssen in der PR1-Migration von `f.<col>` auf `c.<col>` repointet werden (gleicher Ausgabe-Name/-Typ/-Position → `CREATE OR REPLACE VIEW` reicht, kein `DROP`).

- [ ] **Step 4: Verify-Query schreiben**

Datei `scripts/cmm44-spb-verify.sql`:
```sql
-- CMM-44 SP-B — Verify: alle 64 Spalten auf claims vorhanden?
SELECT count(*) AS spb_spalten_auf_claims
FROM information_schema.columns
WHERE table_schema='public' AND table_name='claims'
  AND column_name IN (
    'makler_id','betreuungspaket','notizen','prioritaet','onboarding_complete',
    'status_changed_at','google_review_gesendet','datenschutz_akzeptiert',
    'datenschutz_akzeptiert_am','interne_notizen','ist_aktiv','deaktiviert_am',
    'deaktiviert_grund','deaktiviert_notiz','szenario','service_typ','geschlossen_grund',
    'bevorzugter_kanal','sprache','fallakte_angelegt_am','google_review_prompt_gezeigt_am',
    'sv_zugewiesen_am','kundenbetreuer_fallback_flag','kundenbetreuer_zugewiesen_am',
    'eskaliert_an_admin_id','eskaliert_am','eskaliert_grund','abtretung_pdf','vollmacht_pdf',
    'abtretung_signiert_am','vollmacht_signiert_am','sa_unterschrieben','sa_unterschrieben_am',
    'sa_pdf_url','sa_unterschrift_url','vollmacht_status','vollmacht_geprueft_am',
    'vollmacht_geprueft_von','vollmacht_pruefung_status','vollmacht_pruefung_begruendung',
    'mietwagen_seit_datum','mietwagen_limit_tage','mietwagen_limit_grund',
    'mietwagen_rechnung_vorhanden','mietwagen_rechnung_url','mietwagen_argumentations_puffer',
    'mietwagen_vermieter','schadens_hoehe_netto','schadens_ursache','zeugen_vorhanden',
    'bkat_unfallart','werkstatt_seit_datum','fahrzeug_fahrbereit','fahrzeugschaden_beschreibung',
    'abrechnungsart_besprochen','abrechnungsart_notiz','abrechnungsart_besprochen_am',
    'unfallmitteilung_status','dokumente_vollstaendig_fuer_phase','dokumente_vollstaendig_am_phase',
    'dokumente_reminder_whatsapp_letzte_sendung','zb1_status','kanzlei_ansprechpartner_position',
    'leasinggeber_informiert');
```

- [ ] **Step 5: PR1-Migration generieren + schreiben**

Run: `npx supabase migration new cmm44_spb_add_64_claims_columns`

Inhalt der generierten Datei — drei Blöcke in `BEGIN/COMMIT`:

```sql
BEGIN;

-- BLOCK 1: 64 Spalten auf claims anlegen, Typ/Default/NOT-NULL von faelle gespiegelt.
ALTER TABLE public.claims
  ADD COLUMN makler_id uuid,
  ADD COLUMN betreuungspaket public.betreuungspaket DEFAULT 'vollservice',
  ADD COLUMN notizen text,
  ADD COLUMN prioritaet text DEFAULT 'normal',
  ADD COLUMN onboarding_complete boolean DEFAULT false,
  ADD COLUMN status_changed_at timestamptz DEFAULT now(),
  ADD COLUMN google_review_gesendet boolean DEFAULT false,
  ADD COLUMN datenschutz_akzeptiert boolean DEFAULT false,
  ADD COLUMN datenschutz_akzeptiert_am timestamptz,
  ADD COLUMN interne_notizen text,
  ADD COLUMN ist_aktiv boolean DEFAULT true,
  ADD COLUMN deaktiviert_am timestamptz,
  ADD COLUMN deaktiviert_grund text,
  ADD COLUMN deaktiviert_notiz text,
  ADD COLUMN szenario text DEFAULT 'normalfall',
  ADD COLUMN service_typ text NOT NULL DEFAULT 'komplett',
  ADD COLUMN geschlossen_grund text,
  ADD COLUMN bevorzugter_kanal text,
  ADD COLUMN sprache text DEFAULT 'de',
  ADD COLUMN fallakte_angelegt_am timestamptz,
  ADD COLUMN google_review_prompt_gezeigt_am timestamptz,
  ADD COLUMN sv_zugewiesen_am timestamptz,
  ADD COLUMN kundenbetreuer_fallback_flag boolean NOT NULL DEFAULT false,
  ADD COLUMN kundenbetreuer_zugewiesen_am timestamptz,
  ADD COLUMN eskaliert_an_admin_id uuid,
  ADD COLUMN eskaliert_am timestamptz,
  ADD COLUMN eskaliert_grund text,
  ADD COLUMN abtretung_pdf text,
  ADD COLUMN vollmacht_pdf text,
  ADD COLUMN abtretung_signiert_am timestamptz,
  ADD COLUMN vollmacht_signiert_am timestamptz,
  ADD COLUMN sa_unterschrieben boolean DEFAULT false,
  ADD COLUMN sa_unterschrieben_am timestamptz,
  ADD COLUMN sa_pdf_url text,
  ADD COLUMN sa_unterschrift_url text,
  ADD COLUMN vollmacht_status text DEFAULT 'ausstehend',
  ADD COLUMN vollmacht_geprueft_am timestamptz,
  ADD COLUMN vollmacht_geprueft_von text,
  ADD COLUMN vollmacht_pruefung_status text,
  ADD COLUMN vollmacht_pruefung_begruendung text,
  ADD COLUMN mietwagen_seit_datum date,
  ADD COLUMN mietwagen_limit_tage integer,
  ADD COLUMN mietwagen_limit_grund text,
  ADD COLUMN mietwagen_rechnung_vorhanden boolean NOT NULL DEFAULT false,
  ADD COLUMN mietwagen_rechnung_url text,
  ADD COLUMN mietwagen_argumentations_puffer integer NOT NULL DEFAULT 3,
  ADD COLUMN mietwagen_vermieter text,
  ADD COLUMN schadens_hoehe_netto numeric,
  ADD COLUMN schadens_ursache text,
  ADD COLUMN zeugen_vorhanden boolean NOT NULL DEFAULT false,
  ADD COLUMN bkat_unfallart public.bkat_unfallart,
  ADD COLUMN werkstatt_seit_datum date,
  ADD COLUMN fahrzeug_fahrbereit boolean,
  ADD COLUMN fahrzeugschaden_beschreibung text,
  ADD COLUMN abrechnungsart_besprochen text,
  ADD COLUMN abrechnungsart_notiz text,
  ADD COLUMN abrechnungsart_besprochen_am timestamptz,
  ADD COLUMN unfallmitteilung_status text DEFAULT 'nicht_erforderlich',
  ADD COLUMN dokumente_vollstaendig_fuer_phase text,
  ADD COLUMN dokumente_vollstaendig_am_phase timestamptz,
  ADD COLUMN dokumente_reminder_whatsapp_letzte_sendung timestamptz,
  ADD COLUMN zb1_status text,
  ADD COLUMN kanzlei_ansprechpartner_position text,
  ADD COLUMN leasinggeber_informiert boolean DEFAULT false;

-- BLOCK 2: Initial-Backfill — alle 64 Spalten aus faelle uebernehmen.
-- claims hatte die Spalten vorher nicht -> reiner Copy, kein COALESCE/NULL-Schutz noetig.
UPDATE public.claims c SET
  makler_id = f.makler_id,
  betreuungspaket = f.betreuungspaket,
  notizen = f.notizen,
  prioritaet = f.prioritaet,
  onboarding_complete = f.onboarding_complete,
  status_changed_at = f.status_changed_at,
  google_review_gesendet = f.google_review_gesendet,
  datenschutz_akzeptiert = f.datenschutz_akzeptiert,
  datenschutz_akzeptiert_am = f.datenschutz_akzeptiert_am,
  interne_notizen = f.interne_notizen,
  ist_aktiv = f.ist_aktiv,
  deaktiviert_am = f.deaktiviert_am,
  deaktiviert_grund = f.deaktiviert_grund,
  deaktiviert_notiz = f.deaktiviert_notiz,
  szenario = f.szenario,
  service_typ = f.service_typ,
  geschlossen_grund = f.geschlossen_grund,
  bevorzugter_kanal = f.bevorzugter_kanal,
  sprache = f.sprache,
  fallakte_angelegt_am = f.fallakte_angelegt_am,
  google_review_prompt_gezeigt_am = f.google_review_prompt_gezeigt_am,
  sv_zugewiesen_am = f.sv_zugewiesen_am,
  kundenbetreuer_fallback_flag = f.kundenbetreuer_fallback_flag,
  kundenbetreuer_zugewiesen_am = f.kundenbetreuer_zugewiesen_am,
  eskaliert_an_admin_id = f.eskaliert_an_admin_id,
  eskaliert_am = f.eskaliert_am,
  eskaliert_grund = f.eskaliert_grund,
  abtretung_pdf = f.abtretung_pdf,
  vollmacht_pdf = f.vollmacht_pdf,
  abtretung_signiert_am = f.abtretung_signiert_am,
  vollmacht_signiert_am = f.vollmacht_signiert_am,
  sa_unterschrieben = f.sa_unterschrieben,
  sa_unterschrieben_am = f.sa_unterschrieben_am,
  sa_pdf_url = f.sa_pdf_url,
  sa_unterschrift_url = f.sa_unterschrift_url,
  vollmacht_status = f.vollmacht_status,
  vollmacht_geprueft_am = f.vollmacht_geprueft_am,
  vollmacht_geprueft_von = f.vollmacht_geprueft_von,
  vollmacht_pruefung_status = f.vollmacht_pruefung_status,
  vollmacht_pruefung_begruendung = f.vollmacht_pruefung_begruendung,
  mietwagen_seit_datum = f.mietwagen_seit_datum,
  mietwagen_limit_tage = f.mietwagen_limit_tage,
  mietwagen_limit_grund = f.mietwagen_limit_grund,
  mietwagen_rechnung_vorhanden = f.mietwagen_rechnung_vorhanden,
  mietwagen_rechnung_url = f.mietwagen_rechnung_url,
  mietwagen_argumentations_puffer = f.mietwagen_argumentations_puffer,
  mietwagen_vermieter = f.mietwagen_vermieter,
  schadens_hoehe_netto = f.schadens_hoehe_netto,
  schadens_ursache = f.schadens_ursache,
  zeugen_vorhanden = f.zeugen_vorhanden,
  bkat_unfallart = f.bkat_unfallart,
  werkstatt_seit_datum = f.werkstatt_seit_datum,
  fahrzeug_fahrbereit = f.fahrzeug_fahrbereit,
  fahrzeugschaden_beschreibung = f.fahrzeugschaden_beschreibung,
  abrechnungsart_besprochen = f.abrechnungsart_besprochen,
  abrechnungsart_notiz = f.abrechnungsart_notiz,
  abrechnungsart_besprochen_am = f.abrechnungsart_besprochen_am,
  unfallmitteilung_status = f.unfallmitteilung_status,
  dokumente_vollstaendig_fuer_phase = f.dokumente_vollstaendig_fuer_phase,
  dokumente_vollstaendig_am_phase = f.dokumente_vollstaendig_am_phase,
  dokumente_reminder_whatsapp_letzte_sendung = f.dokumente_reminder_whatsapp_letzte_sendung,
  zb1_status = f.zb1_status,
  kanzlei_ansprechpartner_position = f.kanzlei_ansprechpartner_position,
  leasinggeber_informiert = f.leasinggeber_informiert
FROM public.faelle f
WHERE f.claim_id = c.id;

-- BLOCK 3: View-Repoint — nur falls Task 1 Step 3 Treffer-Views fand.
-- Pro betroffene View ein CREATE OR REPLACE VIEW, das die SP-B-Spalten von
-- f.<col> auf c.<col> umstellt (Ausgabe-Name/-Typ/-Position unveraendert).
-- View-Def per `pg_get_viewdef('public.<view>', true)` holen, f.<col> -> c.<col>
-- ersetzen (claims-Join `c` existiert in den faelle_*-Views bereits). Ist die
-- Trefferliste leer, entfaellt dieser Block komplett.

COMMIT;
```

NOT-NULL-Sicherheit: die 5 NOT-NULL-Spalten (`service_typ`, `kundenbetreuer_fallback_flag`, `mietwagen_rechnung_vorhanden`, `mietwagen_argumentations_puffer`, `zeugen_vorhanden`) haben alle einen Default → `ADD COLUMN … NOT NULL DEFAULT …` füllt die 30 Bestands-Claims atomar. Der Backfill überschreibt mit dem `faelle`-Wert; da diese Spalten auch `faelle`-seitig NOT NULL sind, schreibt er nie NULL.

- [ ] **Step 6: Dry-Run gegen die Live-DB**

Eine Dry-Run-Variante der Migration mit `ROLLBACK;` statt `COMMIT;` speichern und ausführen:
```bash
sed 's/^COMMIT;/ROLLBACK;/' supabase/migrations/<ts>_cmm44_spb_add_64_claims_columns.sql > /tmp/spb-pr1-dryrun.sql
npx supabase db query --linked --file /tmp/spb-pr1-dryrun.sql
```
Expected: kein Fehler. Bei „column … already exists" → Drift, Spalte aus Block 1+2 streichen (Task 0). Bei Enum-Fehler → Enum-Typname prüfen.

- [ ] **Step 7: Commit (Scripts + Migrationsdatei, noch nicht appliziert)**

```bash
git add scripts/cmm44-spb-views-audit.sql scripts/cmm44-spb-verify.sql docs/18.05.2026/cmm44-spb-views-audit.md supabase/migrations/<ts>_cmm44_spb_add_64_claims_columns.sql
git commit -F - <<'EOF'
chore(CMM-44): SP-B PR1 — ADD-Migration + View-Audit (vor Apply)

64-Spalten-ADD-Migration auf claims (Typ/Default/NOT-NULL von faelle gespiegelt)
+ Initial-Backfill geschrieben, Dry-Run gegen Live-DB gruen. View-Audit-Ergebnis
in docs/18.05.2026/cmm44-spb-views-audit.md.

Audit:
- Build: n/a (SQL + Audit-Doc, kein Code)
- UI: n/a
- Redundanz: Verify-/Audit-SQL folgt SP-A2/A3-probe-Muster
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md
- Inkonsistenz: Spalten-Defs aus Live-Messung, nicht geraten
- Regression: n/a (additiv, noch nicht appliziert)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
```

---

## Task 2: PR1 — Apply + Verify + Types + Build + PR

**Branch:** `kitta/cmm-44-spb-pr1-add-columns` (Fortsetzung von Task 1).

- [ ] **Step 1: Drift-Recheck**

Run: `npx supabase db query --linked --file scripts/cmm44-spb-measure.sql`
Expected: 64× `claims: frei`. Bei Kollision → Task 0 Step 1 folgen, Migration anpassen.

- [ ] **Step 2: Migration applizieren**

```bash
npx supabase db query --linked --file supabase/migrations/<ts>_cmm44_spb_add_64_claims_columns.sql
npx supabase migration repair --status applied <ts>
```
Expected: kein Fehler.

- [ ] **Step 3: Verify — 64 Spalten auf `claims`**

Run: `npx supabase db query --linked --file scripts/cmm44-spb-verify.sql`
Expected: `spb_spalten_auf_claims = 64`.

- [ ] **Step 4: Types regenerieren**

```bash
npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts
```
Hinweis: Der `claims`-Typ trägt jetzt 64 zusätzliche Felder; `faelle` behält sie ebenfalls (kein Drop). Beides ist korrekt.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: grün. (Reiner Type-Zuwachs auf `claims` — additiv, sollte nichts brechen.)

- [ ] **Step 6: Commit + Push + PR**

```bash
git add src/lib/supabase/database.types.ts
git commit -F - <<'EOF'
feat(CMM-44): SP-B PR1 — 64 claim-globale Spalten auf claims anlegen + Backfill

ADD COLUMN x64 auf claims (Verdikt CLAIMS aus Phase-1-Mapping), Typ/Default/
NOT-NULL von faelle gespiegelt, + Initial-Backfill aus faelle. Migration
appliziert + via repair recorded. Rein additiv — faelle unveraendert.
Supabase-Types regeneriert.

Audit:
- Build: gruen (npm run build)
- UI: n/a (Schema-Vorbereitung, kein UI-Change)
- Redundanz: keine — claims hatte die 64 Spalten nicht (Live-Messung)
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md
- Inkonsistenz: Spalten-Defs live gemessen; Verify spb_spalten_auf_claims=64
- Regression: additiv — bestehende Reader/Writer unberuehrt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spb-pr1-add-columns
gh pr create --base staging --title "CMM-44 SP-B PR1 — 64 Spalten auf claims anlegen + Backfill" --body "Additive ADD-COLUMN-Migration (64 claim-globale Spalten) + Backfill. Migration bereits appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md"
```

> **GATE:** Task 3 (PR2a) startet erst, wenn PR1 auf `staging` gemergt ist — der Reader-Sweep braucht die regenerierten Types in `src/lib/supabase/database.types.ts`.

---

## Task 3: PR2a — Cluster Workflow/Zuweisung (27 Spalten)

**Branch:** `kitta/cmm-44-spb-pr2a-workflow`, frisch von `origin/staging` (nach PR1-Merge).
**Spalten:** `makler_id`, `betreuungspaket`, `notizen`, `prioritaet`, `onboarding_complete`, `status_changed_at`, `google_review_gesendet`, `datenschutz_akzeptiert`, `datenschutz_akzeptiert_am`, `interne_notizen`, `ist_aktiv`, `deaktiviert_am`, `deaktiviert_grund`, `deaktiviert_notiz`, `szenario`, `service_typ`, `geschlossen_grund`, `bevorzugter_kanal`, `sprache`, `fallakte_angelegt_am`, `google_review_prompt_gezeigt_am`, `sv_zugewiesen_am`, `kundenbetreuer_fallback_flag`, `kundenbetreuer_zugewiesen_am`, `eskaliert_an_admin_id`, `eskaliert_am`, `eskaliert_grund`.

**Files:**
- Create: `docs/18.05.2026/cmm44-spb-inventory-cluster-a.md`
- Modify: `src/`-Files mit `faelle`-Zugriff auf eine der 27 Spalten (Inventur Step 2).

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spb-pr2a-workflow origin/staging
```

- [ ] **Step 2: Call-Site-Inventur Cluster a**

Run im Repo-Root:
```bash
for col in makler_id betreuungspaket notizen prioritaet onboarding_complete status_changed_at google_review_gesendet datenschutz_akzeptiert datenschutz_akzeptiert_am interne_notizen ist_aktiv deaktiviert_am deaktiviert_grund deaktiviert_notiz szenario service_typ geschlossen_grund bevorzugter_kanal sprache fallakte_angelegt_am google_review_prompt_gezeigt_am sv_zugewiesen_am kundenbetreuer_fallback_flag kundenbetreuer_zugewiesen_am eskaliert_an_admin_id eskaliert_am eskaliert_grund; do
  echo "### $col"
  grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```
Inventur-Doc `docs/18.05.2026/cmm44-spb-inventory-cluster-a.md` schreiben — pro Treffer eine Zeile `Datei:Zeile | Spalte | Muster`. `Muster` ∈ `{A, B, C, D, E, F}` aus dem Transform-Regelwerk. Nur **A/B/C/D** brauchen einen Change; **E/F** = kein Change (Spaltenname stabil). Generische Namen (`notizen`, `sprache`, `prioritaet`, `ist_aktiv`, `service_typ`, `szenario`) produzieren Grep-Rauschen — Kontext lesen, Nicht-DB-Treffer als `F` klassifizieren.

```bash
git add docs/18.05.2026/cmm44-spb-inventory-cluster-a.md
git commit -m "docs(CMM-44): SP-B PR2a — Call-Site-Inventur Cluster a (Workflow/Zuweisung)"
```

- [ ] **Step 3: Transform anwenden**

Jede als `A/B/C/D` klassifizierte Call-Site nach dem Transform-Regelwerk umstellen. Kein Spalten-Rename — nur die DB-Quelle wechselt (`faelle` → `claims`). Reader-Quelle dem bestehenden Portal-Pattern der Datei folgen (`claims` direkt vs. `v_claim_*`-View).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: 0 Fehler.

- [ ] **Step 5: Re-Grep — Verify Cluster sauber**

```bash
for col in makler_id betreuungspaket notizen prioritaet onboarding_complete status_changed_at google_review_gesendet datenschutz_akzeptiert datenschutz_akzeptiert_am interne_notizen ist_aktiv deaktiviert_am deaktiviert_grund deaktiviert_notiz szenario service_typ geschlossen_grund bevorzugter_kanal sprache fallakte_angelegt_am google_review_prompt_gezeigt_am sv_zugewiesen_am kundenbetreuer_fallback_flag kundenbetreuer_zugewiesen_am eskaliert_an_admin_id eskaliert_am eskaliert_grund; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "from('faelle')" src/ | grep -i "$col" || true
done
```
Manuell sicherstellen: kein `from('faelle')`-Select/Update und kein `faelle(...)`-Nested-Select referenziert mehr eine der 27 Spalten. Reine `E/F`-Resttreffer (View-Read, Property, Typ) sind ok.

- [ ] **Step 6: Voller Build**

Run: `npm run build`
Expected: grün. (Routen/Server-Actions betroffen → voller Build, nicht nur `tsc`.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -F - <<'EOF'
refactor(CMM-44): SP-B PR2a — Cluster Workflow/Zuweisung faelle->claims

27 claim-globale Spalten: alle faelle-seitigen Reads/Writes auf claims
umgestellt (gleicher Spaltenname, andere Tabelle). Kein DB-Schema-Change.

Audit:
- Build: gruen (npm run build)
- UI: kein neuer Einstiegspunkt (Quell-Tabellen-Wechsel)
- Redundanz: bestehende claims-Reads/v_claim_*-Views genutzt
- Dead-Code: faelle-seitige Zugriffe der 27 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md
- Inkonsistenz: kein Spalten-Rename; Writes treffen claims direkt (kein Trigger)
- Regression: Re-Grep = 0 faelle-Zugriffe der Cluster-Spalten

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spb-pr2a-workflow
gh pr create --base staging --title "CMM-44 SP-B PR2a — Cluster Workflow/Zuweisung Reader/Writer-Sweep" --body "27 claim-globale Spalten von faelle auf claims umgestellt. Kein DB-Schema-Change. Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md"
```

- [ ] **Step 8: Smoke-Script anlegen + Portal-Smoke (nach staging-Deploy)**

`scripts/smoke-cmm44-spb.mjs` anlegen (Vorlage `scripts/smoke-cmm44-spa2-pr2.mjs`): loggt sich in die 5 Portale ein (Public/Admin/Dispatch/SV/Kunde), öffnet je die Fallakte-/Listen-Seiten mit SP-B-Werten, macht Screenshots. Test-User aus dem E2E-Setup (`twofa_aktiviert=false`, Passwort `Test1234!`). Dann `node scripts/smoke-cmm44-spb.mjs` gegen `app.staging.claimondo.de`; Screenshots im selben Schritt auswerten (`feedback_smoke_screenshot_pflicht`). Prüfen: Status/Phase, Notizen, Eskalation, Onboarding-Gate, Sprache erscheinen in Fallakte/Listen unverändert. Ergebnis in `docs/18.05.2026/cmm44-spb-smoke-pr2a.md`. (PR2b/c nutzen das Script wieder.)

---

## Task 4: PR2b — Cluster Dokumente/SA/Vollmacht (13 Spalten)

**Branch:** `kitta/cmm-44-spb-pr2b-dokumente`, frisch von `origin/staging`.
**Spalten:** `abtretung_pdf`, `vollmacht_pdf`, `abtretung_signiert_am`, `vollmacht_signiert_am`, `sa_unterschrieben`, `sa_unterschrieben_am`, `sa_pdf_url`, `sa_unterschrift_url`, `vollmacht_status`, `vollmacht_geprueft_am`, `vollmacht_geprueft_von`, `vollmacht_pruefung_status`, `vollmacht_pruefung_begruendung`.

**Files:**
- Create: `docs/18.05.2026/cmm44-spb-inventory-cluster-b.md`
- Modify: `src/`-Files mit `faelle`-Zugriff auf eine der 13 Spalten.

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spb-pr2b-dokumente origin/staging
```

- [ ] **Step 2: Call-Site-Inventur Cluster b**

```bash
for col in abtretung_pdf vollmacht_pdf abtretung_signiert_am vollmacht_signiert_am sa_unterschrieben sa_unterschrieben_am sa_pdf_url sa_unterschrift_url vollmacht_status vollmacht_geprueft_am vollmacht_geprueft_von vollmacht_pruefung_status vollmacht_pruefung_begruendung; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```
Inventur-Doc `docs/18.05.2026/cmm44-spb-inventory-cluster-b.md` — Klassifizierung wie Task 3 Step 2.

```bash
git add docs/18.05.2026/cmm44-spb-inventory-cluster-b.md
git commit -m "docs(CMM-44): SP-B PR2b — Call-Site-Inventur Cluster b (Dokumente/SA/Vollmacht)"
```

- [ ] **Step 3: Transform anwenden** — Regelwerk wie Task 3 Step 3.

- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit` · Expected: 0 Fehler.

- [ ] **Step 5: Re-Grep** — wie Task 3 Step 5, mit den 13 Cluster-b-Spalten. Sicherstellen: kein `from('faelle')`/`faelle(...)`-Zugriff der 13 Spalten mehr.

- [ ] **Step 6: Voller Build** — Run: `npm run build` · Expected: grün.

- [ ] **Step 7: Commit + Push + PR**

```bash
git add -A
git commit -F - <<'EOF'
refactor(CMM-44): SP-B PR2b — Cluster Dokumente/SA/Vollmacht faelle->claims

13 Dokument-/SA-/Vollmacht-Spalten: alle faelle-seitigen Reads/Writes auf
claims umgestellt (gleicher Spaltenname, andere Tabelle). Kein DB-Schema-Change.

Audit:
- Build: gruen (npm run build)
- UI: kein neuer Einstiegspunkt (Quell-Tabellen-Wechsel)
- Redundanz: bestehende claims-Reads/v_claim_*-Views genutzt
- Dead-Code: faelle-seitige Zugriffe der 13 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md
- Inkonsistenz: kein Spalten-Rename; Writes treffen claims direkt
- Regression: Re-Grep = 0 faelle-Zugriffe der Cluster-Spalten

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spb-pr2b-dokumente
gh pr create --base staging --title "CMM-44 SP-B PR2b — Cluster Dokumente/SA/Vollmacht Reader/Writer-Sweep" --body "13 Dokument-/SA-/Vollmacht-Spalten von faelle auf claims umgestellt. Kein DB-Schema-Change. Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md"
```

- [ ] **Step 8: Portal-Smoke** — wie Task 3 Step 8. Prüfen: Abtretung/Vollmacht/SA-Status + PDFs in Fallakte (Admin/SV/Kunde) + Magic-Link-Seiten unverändert. Ergebnis in `docs/18.05.2026/cmm44-spb-smoke-pr2b.md`.

---

## Task 5: PR2c — Cluster Mietwagen/Unfall-Rest/Abrechnungsart/Reminder (24 Spalten)

**Branch:** `kitta/cmm-44-spb-pr2c-mietwagen-rest`, frisch von `origin/staging`.
**Spalten:** `mietwagen_seit_datum`, `mietwagen_limit_tage`, `mietwagen_limit_grund`, `mietwagen_rechnung_vorhanden`, `mietwagen_rechnung_url`, `mietwagen_argumentations_puffer`, `mietwagen_vermieter`, `schadens_hoehe_netto`, `schadens_ursache`, `zeugen_vorhanden`, `bkat_unfallart`, `werkstatt_seit_datum`, `fahrzeug_fahrbereit`, `fahrzeugschaden_beschreibung`, `abrechnungsart_besprochen`, `abrechnungsart_notiz`, `abrechnungsart_besprochen_am`, `unfallmitteilung_status`, `dokumente_vollstaendig_fuer_phase`, `dokumente_vollstaendig_am_phase`, `dokumente_reminder_whatsapp_letzte_sendung`, `zb1_status`, `kanzlei_ansprechpartner_position`, `leasinggeber_informiert`.

**Files:**
- Create: `docs/18.05.2026/cmm44-spb-inventory-cluster-c.md`
- Modify: `src/`-Files mit `faelle`-Zugriff auf eine der 24 Spalten.

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spb-pr2c-mietwagen-rest origin/staging
```

- [ ] **Step 2: Call-Site-Inventur Cluster c**

```bash
for col in mietwagen_seit_datum mietwagen_limit_tage mietwagen_limit_grund mietwagen_rechnung_vorhanden mietwagen_rechnung_url mietwagen_argumentations_puffer mietwagen_vermieter schadens_hoehe_netto schadens_ursache zeugen_vorhanden bkat_unfallart werkstatt_seit_datum fahrzeug_fahrbereit fahrzeugschaden_beschreibung abrechnungsart_besprochen abrechnungsart_notiz abrechnungsart_besprochen_am unfallmitteilung_status dokumente_vollstaendig_fuer_phase dokumente_vollstaendig_am_phase dokumente_reminder_whatsapp_letzte_sendung zb1_status kanzlei_ansprechpartner_position leasinggeber_informiert; do
  echo "### $col"; grep -rIn --include='*.ts' --include='*.tsx' "\b$col\b" src/
done
```
Inventur-Doc `docs/18.05.2026/cmm44-spb-inventory-cluster-c.md` — Klassifizierung wie Task 3 Step 2.

```bash
git add docs/18.05.2026/cmm44-spb-inventory-cluster-c.md
git commit -m "docs(CMM-44): SP-B PR2c — Call-Site-Inventur Cluster c (Mietwagen/Unfall-Rest)"
```

- [ ] **Step 3: Transform anwenden** — Regelwerk wie Task 3 Step 3.

- [ ] **Step 4: Typecheck** — Run: `npx tsc --noEmit` · Expected: 0 Fehler.

- [ ] **Step 5: Re-Grep** — wie Task 3 Step 5, mit den 24 Cluster-c-Spalten.

- [ ] **Step 6: Voller Build** — Run: `npm run build` · Expected: grün.

- [ ] **Step 7: Commit + Push + PR**

```bash
git add -A
git commit -F - <<'EOF'
refactor(CMM-44): SP-B PR2c — Cluster Mietwagen/Unfall-Rest faelle->claims

24 Spalten (Mietwagen, Unfall-Rest, Fahrzeug-Schaden, Abrechnungsart,
Reminder, Einzel): alle faelle-seitigen Reads/Writes auf claims umgestellt.
Kein DB-Schema-Change.

Audit:
- Build: gruen (npm run build)
- UI: kein neuer Einstiegspunkt (Quell-Tabellen-Wechsel)
- Redundanz: bestehende claims-Reads/v_claim_*-Views genutzt
- Dead-Code: faelle-seitige Zugriffe der 24 Spalten entfernt
- Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md
- Inkonsistenz: kein Spalten-Rename; Writes treffen claims direkt
- Regression: Re-Grep = 0 faelle-Zugriffe der Cluster-Spalten

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spb-pr2c-mietwagen-rest
gh pr create --base staging --title "CMM-44 SP-B PR2c — Cluster Mietwagen/Unfall-Rest Reader/Writer-Sweep" --body "24 Spalten von faelle auf claims umgestellt. Kein DB-Schema-Change. Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md"
```

- [ ] **Step 8: Portal-Smoke** — wie Task 3 Step 8. Prüfen: Mietwagen-Block, Schadenshöhe/-ursache, Abrechnungsart, Doku-Vollständigkeit/Reminder, ZB1-Status in Fallakte unverändert. Ergebnis in `docs/18.05.2026/cmm44-spb-smoke-pr2c.md`.

> **Hinweis Datei-Überlappung:** PR2a/b/c haben disjunkte Spaltenmengen, können aber dieselbe Datei berühren (z.B. die Fallakte liest Spalten aus mehreren Clustern). Bei paralleler Bearbeitung sind triviale Merge-Konflikte möglich. Empfehlung: sequenziell (a → merge → b → merge → c), jeder Branch frisch von `origin/staging`.

---

## Task 6: PR3 — Catch-up-Backfill

> **GATE:** PR3 startet erst, wenn PR2a + PR2b + PR2c auf `main` sind (staging→main-Release). Prüfen inhaltsbasiert: `git diff origin/main origin/staging -- src/` enthält keine SP-B-Sweep-Reste mehr (Squash-Release — kein `merge-base`, SP-A-Lektion c).

**Branch:** `kitta/cmm-44-spb-pr3-catchup-backfill`, frisch von `origin/staging`.

**Files:**
- Create: `supabase/migrations/<ts>_cmm44_spb_catchup_backfill.sql`

- [ ] **Step 1: Branch anlegen**

```bash
git fetch origin
git checkout -b kitta/cmm-44-spb-pr3-catchup-backfill origin/staging
```

- [ ] **Step 2: Catch-up-Backfill-Migration generieren + schreiben**

Run: `npx supabase migration new cmm44_spb_catchup_backfill`

Inhalt — **identischer Backfill wie PR1 Block 2** (alle 64 Spalten, `UPDATE public.claims c SET … FROM public.faelle f WHERE f.claim_id = c.id;` in `BEGIN/COMMIT`). Fängt `faelle`-Writes, die im Fenster zwischen PR1-Backfill und PR2-Writer-Deploy noch auf `faelle` liefen. Idempotent — re-applizierter Copy. Den `UPDATE`-Block aus PR1 Block 2 1:1 übernehmen (Datei `supabase/migrations/<ts>_cmm44_spb_add_64_claims_columns.sql` Block 2 als Vorlage).

- [ ] **Step 3: Dry-Run**

```bash
sed 's/^COMMIT;/ROLLBACK;/' supabase/migrations/<ts>_cmm44_spb_catchup_backfill.sql > /tmp/spb-pr3-dryrun.sql
npx supabase db query --linked --file /tmp/spb-pr3-dryrun.sql
```
Expected: kein Fehler.

- [ ] **Step 4: Applizieren + Verify**

```bash
npx supabase db query --linked --file supabase/migrations/<ts>_cmm44_spb_catchup_backfill.sql
npx supabase migration repair --status applied <ts>
npx supabase db query --linked --file scripts/cmm44-spb-verify.sql
```
Expected: `spb_spalten_auf_claims = 64` (unverändert — additiv).

- [ ] **Step 5: Commit + Push + PR**

```bash
git add supabase/migrations/<ts>_cmm44_spb_catchup_backfill.sql
git commit -F - <<'EOF'
feat(CMM-44): SP-B PR3 — Catch-up-Backfill claims aus faelle

Idempotenter Re-Backfill der 64 SP-B-Spalten claims<-faelle. Faengt Writes
aus dem Fenster PR1-Backfill -> PR2-Writer-Deploy. Additiv, kein Drop.
Migration appliziert + via repair recorded.

Audit:
- Build: n/a (reine UPDATE-Migration, kein Code)
- UI: n/a
- Redundanz: Backfill-Block identisch zu PR1 Block 2 (bewusst, idempotent)
- Dead-Code: nichts
- Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md §4 PR3
- Inkonsistenz: additiv; faelle behaelt die Daten bis Phase 6
- Regression: n/a (additiv)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
git push -u origin kitta/cmm-44-spb-pr3-catchup-backfill
gh pr create --base staging --title "CMM-44 SP-B PR3 — Catch-up-Backfill" --body "Idempotenter Re-Backfill der 64 SP-B-Spalten claims<-faelle. Additiv, kein Drop. Migration bereits appliziert + repair-recorded. Spec: docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md"
```

- [ ] **Step 6: Finaler Portal-Smoke**

`node scripts/smoke-cmm44-spb.mjs` gegen `app.staging.claimondo.de`, 5 Portale, Screenshots auswerten. Erwartung: 0 Hard-Fails, alle SP-B-Werte in der UI unverändert. Protokoll `docs/18.05.2026/cmm44-spb-smoke-pr3.md`.

---

## Task 7: Abschluss

- [ ] **Step 1: Phase-1-Mapping nachziehen**

`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`: SP-B als erledigt markieren (64 CLAIMS-Spalten auf `claims`, faelle-Spalten bleiben bis Phase 6).

- [ ] **Step 2: Handoff-Doc schreiben**

`docs/18.05.2026/handoff-cmm44-spb-abschluss.md` — analog SP-A3-Handoff: erledigt (PR1/PR2a/b/c/PR3), Verify-Ergebnisse, nächster Schritt (SP-C Parteien-Snapshots oder SP-G2 — siehe Phase-1 §4).

- [ ] **Step 3: Memory aktualisieren**

`project_cmm44_spb_status.md` anlegen (analog `project_cmm44_spa3_status.md`), Pointer in `MEMORY.md`. SP-B erledigt, faelle-Spalten-Drop explizit als Phase-6-Aufgabe vermerkt.

- [ ] **Step 4: Commit (nur `docs/` — die Memory-Files liegen außerhalb des Repos)**

```bash
git add docs/
git commit -m "docs(CMM-44): SP-B erledigt — Handoff + Phase-1-Mapping nachgezogen"
```

- [ ] **Step 5: Session-Abschluss-Checkliste (AGENTS.md Regel 3)**

```bash
git status
git stash list
git log --branches --not --remotes --oneline
```
Working-Tree clean, keine unbegleiteten Stashes, alle Commits gepusht.

---

## Definition of Done

- [ ] PR1 gemergt; `cmm44-spb-verify.sql` zeigt 64 Spalten auf `claims`; Build grün nach Type-Regen.
- [ ] PR2a + PR2b + PR2c gemergt; je Portal-Smoke ohne Hard-Fail; Re-Grep = 0 `faelle`-Zugriffe der 64 Spalten.
- [ ] PR3-Catch-up-Backfill appliziert + `repair`-recorded.
- [ ] `git grep "from('faelle')"` referenziert keine der 64 SP-B-Spalten mehr.
- [ ] Finaler 5-Portal-Smoke ohne Hard-Fail, Screenshots ausgewertet.
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen; `faelle`-Spalten-Drop als Phase-6-Aufgabe dokumentiert.

---

## Selbst-Review (Plan vs. Spec)

- **Spec §1 Scope (64 CLAIMS-Spalten, kein TBD)** — Task 1 ADD-Block deckt exakt die 64; TBD-Spalten nicht enthalten: ✅.
- **Spec §2 (Live-Stand, Enums, NOT-NULL)** — Task 0 Drift-Check; Task 1 ADD-Block mit `public.betreuungspaket`/`public.bkat_unfallart` + 5× `NOT NULL DEFAULT`: ✅.
- **Spec §3 (kein per-Spalten-Drop)** — kein `DROP COLUMN` im Plan; Task 7 vermerkt Phase-6-Drop: ✅.
- **Spec §4 PR1 (ADD + Backfill + View-Repoint)** — Task 1+2; View-Repoint Block 3 konditional nach View-Audit: ✅.
- **Spec §4 PR2 (Reader/Writer-Sweep, gechunkt a/b/c)** — Task 3/4/5, je Inventur→Transform→Build→Smoke: ✅.
- **Spec §4 PR3 (Catch-up-Backfill, additiv)** — Task 6: ✅.
- **Spec §5 (Migrations-Vorgehen)** — `BEGIN/COMMIT`, Dry-Run, `db query --linked` + `repair`, kein `db push`: ✅ Task 1/2/6.
- **Spec §6 (5-Portal-Smoke)** — Task 3/4/5 Step 8 + Task 6 Step 6: ✅.
- **Spec §7 Risiken** — Drift (Task 0/2 Re-Measure), View-Read (Task 1 Audit), Staleness-Fenster (Task 6 Catch-up), NOT-NULL (Task 1 Step 5 Hinweis): ✅.
- **Typ-Konsistenz** — Transform-Regelwerk-Muster A–F durchgängig in Task 3/4/5 referenziert; Migration-Block-Nummerierung (1 ADD / 2 Backfill / 3 View) konsistent PR1↔PR3.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
