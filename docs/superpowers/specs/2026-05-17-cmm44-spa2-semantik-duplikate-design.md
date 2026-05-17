# CMM-44 SP-A2 — Semantik-Duplikat-Drops (29 `faelle`-Spalten → `claims`)

**Datum:** 2026-05-17 · **Status:** Design — abgestimmt
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
SP-A2 ist ein **Reader-Rename** (anderer Spaltenname) — das ist die einzige zusaetzliche
Komplexitaet.

### Die 29 Spalten

Live gegen die Prod-DB gemessen (`scripts/probe-cmm44-spa2-divergenz.sql`, 2026-05-17,
30 `faelle`-Zeilen, alle mit `claim_id`). `f_nn` = `faelle`-Spalte non-NULL, `c_nn` =
claims-Ziel non-NULL, `div` = Zeilen mit abweichendem Wert.

| `faelle`-Spalte | → `claims`-Spalte | f_nn | c_nn | div | Notiz |
|---|---|--:|--:|--:|---|
| `schadens_beschreibung` | `hergang_kunde_text` | 0 | 0 | 0 | Kollisionsgruppe A |
| `unfallhergang` | `hergang_kunde_text` | 0 | 0 | 0 | Kollisionsgruppe A |
| `schadens_hergang` | `hergang_kunde_text` | 0 | 0 | 0 | Kollisionsgruppe A |
| `schadens_datum` | `schadentag` | 5 | 30 | 25 | Kollisionsgruppe B; 5 faelle-Zeilen decken sich |
| `unfalldatum` | `schadentag` | 0 | 30 | 30 | Kollisionsgruppe B; faelle leer |
| `schadens_entdeckt_am` | `entdeckt_am` | 0 | 0 | 0 | |
| `schadens_adresse` | `schadenort_adresse` | 0 | 6 | 6 | Kollisionsgruppe C; faelle leer |
| `unfallort` | `schadenort_adresse` | 0 | 6 | 6 | Kollisionsgruppe C; faelle leer |
| `schadens_plz` | `schadenort_plz` | 0 | 1 | 1 | faelle leer |
| `schadens_ort` | `schadenort_ort` | 5 | 1 | 6 | **Backfill noetig** — 5 faelle-Zeilen fehlen claims |
| `schadens_fall_typ` | `fall_typ` | 0 | 0 | 0 | |
| `personenschaden_flag` | `hat_personenschaden` | 30 | 30 | 0 | deckungsgleich |
| `halter_ungleich_fahrer_flag` | `halter_ungleich_fahrer` | 30 | 30 | 0 | deckungsgleich |
| `schadens_art` | `schadenart` | 0 | 30 | 30 | faelle leer, claims voll |
| `unfallort_kategorie` | `schadenort_kategorie` | 0 | 0 | 0 | |
| `sachschaden_flag` | `hat_sachschaden` | 30 | 30 | 0 | deckungsgleich |
| `unfall_uhrzeit` | `schadenzeit` | 0 | 0 | 0 | |
| `unfallort_lat` | `schadenort_lat` | 0 | 0 | 0 | |
| `unfallort_lng` | `schadenort_lng` | 0 | 0 | 0 | |
| `gegner_schadennummer` | `gegner_aktenzeichen` | 0 | 1 | 1 | faelle leer |
| `no_show_count` | `kunde_no_show_count` / `sv_no_show_count` | 30 | 30 | 0 | Ziel pro Call-Site (s. §2) |
| `aktuelle_phase` | `phase` | 3 | 30 | 30 | faelle stale, claims SSoT |
| `fall_nummer` | `claim_nummer` | 30 | 30 | 30 | Legacy-Nummer (s. §2) |
| `konvertiert_von_lead` | `lead_id` | 28 | 28 | 0 | deckungsgleich |
| `mietwagen_flag` | `hat_mietwagen` | 30 | 30 | 0 | Kollisionsgruppe D; deckungsgleich |
| `mietwagen_hat` | `hat_mietwagen` | 30 | 30 | 0 | Kollisionsgruppe D; deckungsgleich |
| `nutzungsausfall` | `hat_nutzungsausfall` | 30 | 30 | 0 | deckungsgleich |
| `regulierung_betrag` | `regulierungs_betrag` | 0 | 0 | 0 | |
| `vs_ablehnungsgrund` | `vs_ablehnungs_grund` | 0 | 0 | 0 | |

### Kollisionsgruppen (mehrere `faelle`-Spalten → eine `claims`-Spalte)

- **A** — `schadens_beschreibung`, `unfallhergang`, `schadens_hergang` → `hergang_kunde_text`
- **B** — `schadens_datum`, `unfalldatum` → `schadentag`
- **C** — `schadens_adresse`, `unfallort` → `schadenort_adresse`
- **D** — `mietwagen_flag`, `mietwagen_hat` → `hat_mietwagen`

Alle Reader **jeder** alten Spalte einer Gruppe zeigen nach dem Sweep auf dieselbe
`claims`-Spalte. Re-Grep zur Verifikation pro **altem** Namen einzeln, nicht pro Zielspalte.

### Nicht in Scope

- **`gegner_anzahl_beteiligte`** — im Phase-1-Audit als DUP von `anzahl_beteiligte_total`
  gelabelt, ist es aber nicht: `gegner_anzahl_beteiligte`=1 (nur Gegner) ≠
  `anzahl_beteiligte_total`=2 (alle Beteiligten), 28/30 divergent. Die Gegner sind
  als `claim_parties`-Zeilen (rolle = Verursacher/Gegner) modelliert → der Wert ist ein
  **Count ueber `claim_parties`**, kein eigener Spaltenwert. Behandlung: Sub-Projekt **SP-C**
  (Parteien), dort voraussichtlich ersatzlos droppen (aus Parteien-Count ableitbar). Wird im
  Phase-1-Mapping nachgezogen.
- Alle MOVE/CLAIMS/TBD-Spalten — spaetere Sub-Projekte SP-B..L.

### Erfolgskriterium

Nach PR2: `information_schema` zeigt 0 der 29 Spalten auf `faelle`; voller Portal-Smoke
(Public/Admin/SV/Kunde/Dispatch) zeigt alle betroffenen Werte unveraendert; Build gruen.

---

## 2 · PR1 — Reader/Writer-Rename-Sweep (`faelle` → `claims`)

**Branch:** `kitta/cmm-44-sp-a2-semantik-duplikate` (Worktree existiert), PR gegen `staging`.

Reiner Code-PR, **kein DB-Schema-Change**.

### Vorgehen

1. **Inventur pro Spalte** — `grep` nach jedem der 29 `faelle`-Namen in `src/`. Pro
   Call-Site klaeren: Zugriff ueber `.from('faelle')`, eine `v_*`-View oder einen
   `select('faelle(...)')`-Join? Ergebnis: Call-Site-Liste pro Spalte.
2. **Reads umstellen** — `faelle.<alt>` → `claims.<neu>`. Reader-Quelle: bestehendes
   Portal-Pattern folgen (`claims` direkt vs. `v_claim_*`-View) — **kein** neuer View-Typ.
3. **Writes umstellen** — `.from('faelle').update({<alt>})` → `claims.<neu>`. SP-A hat das
   Sync-Trigger-Paar `sync_faelle_to_claims` / `sync_claims_to_faelle` bereits gedroppt — es
   gibt **keine** Trigger-Propagierung mehr. Ein Write, der weiter `faelle` trifft, ginge
   verloren; jeder Write muss direkt auf `claims` zielen.
4. **Kollisionsgruppen** — alle Reader der alten Namen einer Gruppe auf dieselbe
   `claims`-Spalte.
5. **`no_show_count`** — `claims` hat zwei deckungsgleiche Ziele. Pro Call-Site nach Kontext
   waehlen: Kunde-No-Show → `kunde_no_show_count`, SV-No-Show → `sv_no_show_count`. Bei
   unklarem Kontext im Plan-Schritt am Call-Site dokumentieren.
6. **`fall_nummer`** — Reader auf `claims.claim_nummer`. `fall_nummer` ist die Legacy-Nummer
   (eigenes Schema, 100 % divergent zur kanonischen `claim_nummer`); laut Produktentscheidung
   nicht mehr gebraucht. UI zeigt nach dem Sweep das `claim_nummer`-Schema — gewollt.
7. **CMM-48-Abgleich** — Writer der 29 Spalten, die im `cmm-48-writer-stellen-audit.md`
   stehen, im PR1-Commit-Body markieren, damit CMM-48 sie nicht erneut migriert.

### Ergebnis PR1

`faelle.<29>` existieren noch, aber **kein Code** liest/schreibt sie `faelle`-seitig.
Eigenstaendig deploybar + smoke-bar; aendert kein DB-Schema.

### Verifikation PR1

- `npm run build` gruen (Routen/Server-Actions betroffen → voller Build).
- Portal-Smoke Public/Admin/SV/Kunde/Dispatch mit Screenshots — betroffene Werte
  (Schadenort, Schadendatum, Mietwagen-Flags, Fallnummer, Phase, …) unveraendert.
- Re-Grep: 0 verbleibende `faelle`-seitige Reads/Writes — pro **altem** Namen einzeln.

---

## 3 · PR2 — Backfill + `DROP COLUMN`

**Branch:** frisch von `origin/staging` **nach PR1-Merge auf `main`**, z.B.
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
   fuer alle 29 Paare. Bei Kollisionsgruppen feste Quell-Prioritaet — Gruppe B:
   erst `schadens_datum`, dann `unfalldatum`; Gruppe C: erst `schadens_adresse`, dann
   `unfallort`; Gruppe A/D: faelle-Seiten leer bzw. deckungsgleich → effektiv No-op.
   Live ist nur `schadens_ort` (5 Zeilen) real betroffen — der Rest ist No-op, aber
   vollstaendig abgedeckt gegen Fremd-Drift.
2. **Dependency-Audit — alle Objekt-Typen** (SP-A-Lektion a): `pg_depend` fuer
   Views/Trigger/Policies/Constraints **plus** Text-Sweep ueber `pg_proc.prosrc` nach
   Funktionen, die einen der 29 `faelle`-Namen im Body referenzieren (`pg_depend` trackt
   Funktions-Bodies nicht). Blockierende Objekte vor dem Drop anpassen / `CREATE OR REPLACE`.
   Konkrete Liste wird beim Plan-Schritt live ermittelt.
3. **`DROP COLUMN`** ×29: `ALTER TABLE public.faelle DROP COLUMN <col>;`
4. **types regen** (`npx supabase gen types`) + `npm run build` (TS-Fehler nach Regen =
   uebersehener Reader).

### Apply-Verfahren

Targeted-Apply wegen Fremd-Drift: `npx supabase db query --linked --file <migration.sql>` +
`npx supabase migration repair --status applied <version>`. **Kein** blankes `db push`.

### Verifikation PR2

- `information_schema.columns`: 0 der 29 Spalten auf `faelle`.
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
| `fall_nummer`-Anzeige aendert sich sichtbar | Bestaetigt — Legacy-Nummer, nicht mehr gebraucht, gewollt |
| View blockiert `DROP COLUMN` | Dependency-Audit PR2 Schritt 2, blockierende Views vorher anpassen |
| Andere Session droppt/aendert `faelle` parallel | `information_schema` direkt vor PR2-Apply live nachmessen |
| `db push`-Drift | Targeted-Apply + `migration repair` |
| Drop-Migration laeuft vor Code auf `main` (AAR-599-Muster) | Sequencing: PR1 → staging → **main-Release** → dann PR2-Migration applizieren |
| Writer-Doppelmigration mit CMM-48 | PR1-Commit-Body markiert migrierte Writer; CMM-48-Audit-Doc gegenchecken |
| PR1 mergt, PR2 verzoegert sich | Unkritisch: Code liest `claims`, `faelle`-Spalten sind nur noch ungelesener Ballast. Beliebig lange haltbar. |

---

## 5 · Abgrenzung der zwei PRs

| | PR1 | PR2 |
|---|---|---|
| DB-Schema-Aenderung | keine | Gap-Backfill + 29× `DROP COLUMN` |
| Code-Aenderung | 29 Spalten: alle `faelle`-Reads/Writes → `claims` (Rename) | types regen |
| Eigenstaendig deploybar | ja | ja (setzt PR1-Merge auf `main` voraus) |
| Smoke | Portal-Smoke | Portal-Smoke + DB-Verify |
| Rollback | `git revert` | additiv-destruktiv — `claims` haelt die Daten, 0 Reader auf `faelle`-Seite |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
