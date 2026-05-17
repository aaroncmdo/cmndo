# CMM-44 SP-A2 — Semantik-Duplikat-Drops (28 `faelle`-Spalten → `claims`)

**Datum:** 2026-05-17 · **Status:** Design — abgestimmt (Scope-Update nach Plan-Inventur)
**Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Dekomposition:** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (Sub-Projekt SP-A2)
**Vorgaenger:** SP-A (`docs/superpowers/specs/2026-05-16-cmm44-spa-duplikat-drops-design.md`)
**Handoff:** `docs/17.05.2026/handoff-2026-05-17-cmm44-sp-b-strecke.md`

---

## 1 · Ziel & Scope

SP-A hat die 34 **namensgleichen** sync-getriggerten Duplikat-Spalten gedroppt. SP-A2
entfernt die zweite Haelfte der DUP-Klasse: die **semantik-gleichen** Duplikate — Spalten,
deren Gegenstueck auf `claims` bereits existiert, aber **anders heisst**
(`faelle.schadens_datum` ↔ `claims.schadentag`). `claims` ist die SSoT. SP-A2 stellt alle
`faelle`-seitigen Leser/Schreiber auf die `claims`-Spalte mit dem neuen Namen um und droppt
die Spalten danach `faelle`-seitig.

Unterschied zu SP-A: SP-A war ein reiner Quell-Tabellen-Wechsel (gleicher Spaltenname).
SP-A2 ist ein **Reader-Rename** (anderer Spaltenname) — das ist die zusaetzliche
Komplexitaet.

### Die 28 Spalten

Live gegen die Prod-DB gemessen (`scripts/probe-cmm44-spa2-divergenz.sql`, 2026-05-17,
30 `faelle`-Zeilen, alle mit `claim_id`). `f_nn` = `faelle`-Spalte non-NULL, `c_nn` =
claims-Ziel non-NULL, `div` = Zeilen mit abweichendem Wert. `Files` = distinct `*.ts/.tsx`
in `src/` mit dem Bezeichner (Plan-Inventur 2026-05-17).

| `faelle`-Spalte | → `claims`-Spalte | f_nn | c_nn | div | Files | Cluster |
|---|---|--:|--:|--:|--:|---|
| `schadens_adresse` | `schadenort_adresse` | 0 | 6 | 6 | 56 | 1 |
| `unfallort` | `schadenort_adresse` | 0 | 6 | 6 | 36 | 1 |
| `schadens_plz` | `schadenort_plz` | 0 | 1 | 1 | 54 | 1 |
| `schadens_ort` | `schadenort_ort` | 5 | 1 | 6 | 69 | 1 |
| `unfallort_kategorie` | `schadenort_kategorie` | 0 | 0 | 0 | 13 | 1 |
| `unfallort_lat` | `schadenort_lat` | 0 | 0 | 0 | 22 | 1 |
| `unfallort_lng` | `schadenort_lng` | 0 | 0 | 0 | 22 | 1 |
| `schadens_datum` | `schadentag` | 5 | 30 | 25 | 24 | 1 |
| `unfalldatum` | `schadentag` | 0 | 30 | 30 | 20 | 1 |
| `schadens_entdeckt_am` | `entdeckt_am` | 0 | 0 | 0 | 3 | 1 |
| `unfall_uhrzeit` | `schadenzeit` | 0 | 0 | 0 | 12 | 1 |
| `schadens_beschreibung` | `hergang_kunde_text` | 0 | 0 | 0 | 12 | 2 |
| `unfallhergang` | `hergang_kunde_text` | 0 | 0 | 0 | 27 | 2 |
| `schadens_hergang` | `hergang_kunde_text` | 0 | 0 | 0 | 15 | 2 |
| `schadens_art` | `schadenart` | 0 | 30 | 30 | 18 | 2 |
| `schadens_fall_typ` | `fall_typ` | 0 | 0 | 0 | 23 | 2 |
| `personenschaden_flag` | `hat_personenschaden` | 30 | 30 | 0 | 29 | 2 |
| `halter_ungleich_fahrer_flag` | `halter_ungleich_fahrer` | 30 | 30 | 0 | 9 | 2 |
| `sachschaden_flag` | `hat_sachschaden` | 30 | 30 | 0 | 11 | 2 |
| `mietwagen_flag` | `hat_mietwagen` | 30 | 30 | 0 | 25 | 2 |
| `mietwagen_hat` | `hat_mietwagen` | 30 | 30 | 0 | 10 | 2 |
| `nutzungsausfall` | `hat_nutzungsausfall` | 30 | 30 | 0 | 19 | 2 |
| `gegner_schadennummer` | `gegner_aktenzeichen` | 0 | 1 | 1 | 12 | 3 |
| `no_show_count` | `kunde_no_show_count` / `sv_no_show_count` | 30 | 30 | 0 | 3 | 3 |
| `aktuelle_phase` | `phase` | 3 | 30 | 30 | 26 | 3 |
| `konvertiert_von_lead` | `lead_id` | 28 | 28 | 0 | 6 | 3 |
| `regulierung_betrag` | `regulierungs_betrag` | 0 | 0 | 0 | 32 | 3 |
| `vs_ablehnungsgrund` | `vs_ablehnungs_grund` | 0 | 0 | 0 | 8 | 3 |

Distinct-Files-Summe ist kleiner als die Spaltensumme (viele Dateien lesen mehrere Spalten
gemeinsam): **185 distinct Files**, davon **82 mit `.from('faelle')`**.

### Kollisionsgruppen (mehrere `faelle`-Spalten → eine `claims`-Spalte)

- **A** — `schadens_beschreibung`, `unfallhergang`, `schadens_hergang` → `hergang_kunde_text`
- **B** — `schadens_datum`, `unfalldatum` → `schadentag`
- **C** — `schadens_adresse`, `unfallort` → `schadenort_adresse`
- **D** — `mietwagen_flag`, `mietwagen_hat` → `hat_mietwagen`

Alle Reader **jeder** alten Spalte einer Gruppe zeigen nach dem Sweep auf dieselbe
`claims`-Spalte. Re-Grep zur Verifikation pro **altem** Namen einzeln, nicht pro Zielspalte.

### Nicht in Scope

- **`fall_nummer` → `claims.claim_nummer`** — im Phase-1-Audit als DUP gelabelt, in der
  Plan-Inventur (2026-05-17) aber als eigenstaendiges Vorhaben erkannt: **198 Files**, ein
  Nummern-**Generator** (`admin/faelle/anlegen/actions.ts` baut `CLM-${datum}-${seq}` via
  `.like('fall_nummer', …)`), und eine bereits **teilmigrierte** Anzeige
  (`fall_nummer ?? claim_nummer`-Fallbacks). Das ist kein Reader-Rename, sondern „Legacy-
  Fallnummern-Schema abschaffen" inkl. Generator-Umbau. → Eigenes Sub-Projekt mit eigenem
  Spec/Plan/PR-Strecke (Arbeitstitel **SP-A3**). Wird im Phase-1-Mapping nachgezogen.
- **`gegner_anzahl_beteiligte`** — im Phase-1-Audit als DUP von `anzahl_beteiligte_total`
  gelabelt, ist es aber nicht: `gegner_anzahl_beteiligte`=1 (nur Gegner) ≠
  `anzahl_beteiligte_total`=2 (alle Beteiligten), 28/30 divergent. Die Gegner sind
  als `claim_parties`-Zeilen (rolle = Verursacher/Gegner) modelliert → der Wert ist ein
  **Count ueber `claim_parties`**, kein eigener Spaltenwert. Behandlung: Sub-Projekt **SP-C**
  (Parteien), dort voraussichtlich ersatzlos droppen. Wird im Phase-1-Mapping nachgezogen.
- Alle MOVE/CLAIMS/TBD-Spalten — spaetere Sub-Projekte SP-B..L.

### Erfolgskriterium

Nach PR2: `information_schema` zeigt 0 der 28 Spalten auf `faelle`; voller Portal-Smoke
(Public/Admin/SV/Kunde/Dispatch) zeigt alle betroffenen Werte unveraendert; Build gruen.

---

## 2 · PR-Strecke — 3× Reader-Sweep + 1× Migration

Der 28-Spalten-Kern hat 185 distinct Files. Statt eines SP-A-artigen Einzel-PRs (SP-A
hatte nur 44 Files) wird der Reader-Sweep in **drei Domaenen-PRs** geschnitten — je
einzeln reviewbar, einzeln deploybar, einzeln smoke-bar. Danach **eine** Migration.

| PR | Cluster | Spalten | Inhalt |
|---|---|--:|---|
| **PR1a** | Cluster 1 — Schadenort + Datum | 11 | Adresse/PLZ/Ort/Kategorie/Lat/Lng + Datum/Uhrzeit/entdeckt |
| **PR1b** | Cluster 2 — Hergang/Art/Typ + Flags | 11 | hergang_kunde_text-Gruppe, schadenart, fall_typ, 6 Flags |
| **PR1c** | Cluster 3 — Rest | 6 | gegner_aktenzeichen, no_show_count, phase, lead_id, regulierung/vs |
| **PR2** | Migration | 28 | Gap-Backfill + Dependency-Audit + `DROP COLUMN` ×28 |

Cluster-Zuordnung siehe Spalten-Tabelle §1. PR1a/b/c sind untereinander unabhaengig und
koennen parallel laufen; PR2 setzt voraus, dass **alle drei** auf `main` sind.

### Vorgehen je Reader-Sweep-PR (PR1a/b/c)

Reiner Code-PR, **kein DB-Schema-Change**. Branch frisch von `origin/staging`, PR gegen
`staging`.

1. **Inventur pro Spalte** — `grep` nach jedem Cluster-Spaltennamen in `src/`. Pro
   Call-Site klaeren: Zugriff ueber `.from('faelle')`, eine `v_*`-View oder einen
   `select('faelle(...)')`-Join?
2. **Reads umstellen** — `faelle.<alt>` → `claims.<neu>`. Reader-Quelle: bestehendes
   Portal-Pattern folgen (`claims` direkt vs. `v_claim_*`-View) — **kein** neuer View-Typ.
3. **Writes umstellen** — `.from('faelle').update({<alt>})` → `claims.<neu>`. SP-A hat das
   Sync-Trigger-Paar `sync_faelle_to_claims` / `sync_claims_to_faelle` bereits gedroppt — es
   gibt **keine** Trigger-Propagierung mehr. Ein Write, der weiter `faelle` trifft, ginge
   verloren; jeder Write muss direkt auf `claims` zielen.
4. **Kollisionsgruppen** — alle Reader der alten Namen einer Gruppe auf dieselbe
   `claims`-Spalte (A+B+C in PR1a/b, D in PR1b).
5. **`no_show_count`** (PR1c) — `claims` hat zwei deckungsgleiche Ziele. Pro Call-Site nach
   Kontext waehlen: Kunde-No-Show → `kunde_no_show_count`, SV-No-Show → `sv_no_show_count`.
6. **CMM-48-Abgleich** — Writer, die im `cmm-48-writer-stellen-audit.md` stehen, im
   PR-Commit-Body markieren, damit CMM-48 sie nicht erneut migriert.

### Verifikation je PR1-PR

- `npm run build` gruen (Routen/Server-Actions betroffen → voller Build).
- Portal-Smoke Public/Admin/SV/Kunde/Dispatch mit Screenshots — betroffene Werte
  unveraendert.
- Re-Grep: 0 verbleibende `faelle`-seitige Reads/Writes der Cluster-Spalten — pro **altem**
  Namen einzeln.

---

## 3 · PR2 — Backfill + `DROP COLUMN`

**Branch:** frisch von `origin/staging` **nach Merge von PR1a+PR1b+PR1c auf `main`**, z.B.
`kitta/cmm-44-spa2-pr2-drop`.

### Migration (eine CLI-Migration, `npx supabase migration new`)

Reihenfolge zwingend:

1. **Gap-Backfill** — `claims` gewinnt; nur claims-NULL-Luecken aus `faelle` fuellen, keine
   divergenten claims-Werte ueberschreiben:
   ```sql
   UPDATE public.claims c SET schadenort_ort = f.schadens_ort
   FROM public.faelle f
   WHERE f.claim_id = c.id AND c.schadenort_ort IS NULL AND f.schadens_ort IS NOT NULL;
   ```
   fuer alle 28 Paare. Bei Kollisionsgruppen feste Quell-Prioritaet — Gruppe B:
   erst `schadens_datum`, dann `unfalldatum`; Gruppe C: erst `schadens_adresse`, dann
   `unfallort`; Gruppe A/D: faelle-Seiten leer bzw. deckungsgleich → effektiv No-op.
   Live ist nur `schadens_ort` (5 Zeilen) real betroffen — der Rest ist No-op, aber
   vollstaendig abgedeckt gegen Fremd-Drift.
2. **Dependency-Audit — alle Objekt-Typen** (SP-A-Lektion a): `pg_depend` fuer
   Views/Trigger/Policies/Constraints **plus** Text-Sweep ueber `pg_proc.prosrc` nach
   Funktionen, die einen der 28 `faelle`-Namen im Body referenzieren (`pg_depend` trackt
   Funktions-Bodies nicht). Blockierende Objekte vor dem Drop anpassen / `CREATE OR REPLACE`.
   Konkrete Liste wird beim Plan-Schritt live ermittelt.
3. **`DROP COLUMN`** ×28: `ALTER TABLE public.faelle DROP COLUMN <col>;`
4. **types regen** (`npx supabase gen types`) + `npm run build` (TS-Fehler nach Regen =
   uebersehener Reader).

### Apply-Verfahren

Targeted-Apply wegen Fremd-Drift: `npx supabase db query --linked --file <migration.sql>` +
`npx supabase migration repair --status applied <version>`. **Kein** blankes `db push`.

### Verifikation PR2

- `information_schema.columns`: 0 der 28 Spalten auf `faelle`.
- Voller Portal-Smoke mit Screenshots — Public/Admin/SV/Kunde/Dispatch, betroffene Werte
  unveraendert.
- DB-Smoke-Skript unter `scripts/` (analog `probe-cmm44-spa2-*`).

---

## 4 · Risiken & Mitigation

| Risiko | Mitigation |
|---|---|
| Dynamische `fall[feld]`-Reads, die `grep` nicht faengt | Portal-Smoke auf allen 5 Portalen, nicht nur Grep |
| Kollisionsgruppe: ein Reader uebersehen → liest weiter `faelle` | Re-Grep pro **altem** Namen einzeln, nicht pro Zielspalte |
| Funktions-Body referenziert gedroppte Spalte (kein `pg_depend`-Eintrag) | `pg_proc.prosrc`-Text-Sweep in PR2 Schritt 2 |
| `no_show_count` falsches Ziel (kunde vs sv) | Call-Site-Kontext im Plan dokumentieren; beide claims-Spalten sind heute deckungsgleich |
| View blockiert `DROP COLUMN` | Dependency-Audit PR2 Schritt 2, blockierende Views vorher anpassen |
| Andere Session droppt/aendert `faelle` parallel | `information_schema` direkt vor PR2-Apply live nachmessen |
| `db push`-Drift | Targeted-Apply + `migration repair` |
| Drop-Migration laeuft vor Code auf `main` (AAR-599-Muster) | Sequencing: PR1a/b/c → staging → **main-Release** → dann PR2-Migration applizieren |
| Writer-Doppelmigration mit CMM-48 | PR-Commit-Body markiert migrierte Writer; CMM-48-Audit-Doc gegenchecken |
| PR1a/b/c gemergt, PR2 verzoegert sich | Unkritisch: Code liest `claims`, `faelle`-Spalten sind nur noch ungelesener Ballast. Beliebig lange haltbar. |
| Ein PR1-Cluster blockiert, andere fertig | PR1a/b/c sind unabhaengig — fertige koennen mergen; PR2 wartet auf alle drei |

---

## 5 · Abgrenzung der PRs

| | PR1a/b/c | PR2 |
|---|---|---|
| DB-Schema-Aenderung | keine | Gap-Backfill + 28× `DROP COLUMN` |
| Code-Aenderung | Cluster-Spalten: alle `faelle`-Reads/Writes → `claims` (Rename) | types regen |
| Eigenstaendig deploybar | ja | ja (setzt PR1a+b+c-Merge auf `main` voraus) |
| Smoke | Portal-Smoke | Portal-Smoke + DB-Verify |
| Rollback | `git revert` | additiv-destruktiv — `claims` haelt die Daten, 0 Reader auf `faelle`-Seite |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
