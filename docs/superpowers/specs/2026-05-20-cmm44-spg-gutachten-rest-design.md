# CMM-44 SP-G — Gutachten-Rest (19 `faelle`-Spalten → `gutachten`)

**Datum:** 2026-05-20 · **Status:** Design — abgestimmt
**Master:** CMM-44 (Claim-SSoT-Vollmigration / `faelle`-Drop)
**Dekomposition:** `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` (Sub-Projekt SP-G)
**Vorgänger:** SP-B (`docs/superpowers/specs/2026-05-18-cmm44-spb-claims-native-add-design.md`)
**Branch:** `kitta/cmm-44-spg` (Worktree `.claude/worktrees/cmm-44-spb`)
**Live-Messung:** `scripts/cmm44-spg-measure.sql` (Prod-DB, 2026-05-20)

---

## 1 · Ziel & Scope

SP-G bringt die **19 Gutachten-bezogenen `faelle`-Spalten** (16 aus dem Gutachten-Cluster + 3 aus dem Mietwagen-Cluster mit Heimat `gutachten`, Phase-1-Verdikt **MOVE → gutachten**) auf die `gutachten`-Sub-Table und stellt alle Reader/Writer um.

**Strategie-Konsistenz mit SP-B:** SP-G ist **rein additiv** — kein per-Spalten-`DROP COLUMN faelle.*`. Die 19 `faelle`-Spalten bleiben stehen und sterben gesammelt mit `DROP TABLE faelle CASCADE` in Phase 6 (Master-Strategie §4 „claims-first, faelle stirbt zuletzt"). SP-A/A2/A3 mussten droppen, weil ihre DUP-Spalten entkoppelte Dubletten waren — SP-Gs Spalten sind keine Duplikate, sondern MOVE auf eine Sub-Table mit anderem Namensraum.

**Schlüssel-Unterschied zu SP-B:** SP-G ist **MOVE auf Sub-Table mit Reader-Rename**. Anders als SP-B (`faelle.<col>` → `claims.<col>`, gleicher Name) hat SP-G zwei Dimensionen Änderung gleichzeitig:

1. **Tabellen-Wechsel:** `faelle` → `gutachten` (Sub-Table).
2. **Spalten-Rename:** 11 der 19 haben ein anders benanntes Ziel auf `gutachten` (`gutachten_betrag` → `gesamt_schadensbetrag` etc.). Das ist die SP-A2-Komplexität (Reader-Rename) plus die Sub-Table-Semantik.

**1:1-Cardinality:** `gutachten` hat ein `UNIQUE`-Constraint auf `claim_id` (`gutachten_claim_id_unique`) → pro Claim gibt es höchstens eine `gutachten`-Zeile. Keine N:1-Race-Conditions, kein „welche gutachten-Zeile gewinnt"-Problem. Reader können `from('gutachten').eq('claim_id', X).maybeSingle()` oder via nested embed `claims:claim_id(gutachten(...))` lesen.

### Die 19 Spalten

Live gemessen 2026-05-20 (`scripts/cmm44-spg-measure.sql`). Pre-launch-DB hat `faelle`=278 Spalten, `gutachten`=73 Spalten + 1 Zeile / 1 distinct claim_id.

#### A · MOVE — 11 direkte 1:1-Mappings (Ziel-Spalte existiert auf `gutachten`)

| `faelle` (alt) | `gutachten` (neu) | Typ | Notiz |
|---|---|---|---|
| `gutachten_eingegangen_am` | `fertiggestellt_am` | timestamptz | Reader-Hits: 73 |
| `gutachten_betrag` | `gesamt_schadensbetrag` | numeric | Reader-Hits: 58 |
| `gutachter_honorar` | `gutachten_sv_honorar_netto` | numeric | Reader-Hits: 23 |
| `ocr_extrahiert_am` | `ocr_finished_at` | timestamptz | Reader-Hits: 13 |
| `ocr_rohdaten` | `gutachten_ocr_raw` | jsonb | Reader-Hits: 10 |
| `gutachten_hochgeladen_am` | `pdf_uploaded_at` | timestamptz | Reader-Hits: 5 |
| `gutachten_nummer` | `auftragsnummer` | text | Reader-Hits: 4 · UNIQUE auf `gutachten` |
| `reparaturkosten` | `reparaturkosten_netto` | numeric | Reader-Hits: 32 |
| `wertminderung` | `minderwert` | numeric | Reader-Hits: 32 |
| `nutzungsausfall_tagessatz` | `gutachten_nutzungsausfall_tagessatz_eur` | numeric | Reader-Hits: 12 |
| `reparaturdauer_tage` | `wiederbeschaffungsdauer_tage` | int4 | Reader-Hits: 11 · Phase-1-Mapping |

#### B · MOVE — 5 Neu-ADD auf `gutachten` (Ziel-Spalte fehlt heute)

| `faelle` (alt) | `gutachten` (neu) | Typ | Default | Notiz |
|---|---|---|---|---|
| `ki_kalkulation` | `ki_kalkulation` | jsonb | — | Reader-Hits: 12 · live aber 0-cov |
| `ki_kalkulation_am` | `ki_kalkulation_am` | timestamptz | — | Reader-Hits: 5 |
| `ki_geschaetzte_kosten_min` | `ki_geschaetzte_kosten_min` | numeric | — | Reader-Hits: 5 |
| `ki_geschaetzte_kosten_max` | `ki_geschaetzte_kosten_max` | numeric | — | Reader-Hits: 5 |
| `gutachten_positionen` | `positionen` | jsonb | — | Reader-Hits: 6 · Phase-1 „Sub-Table" — gibt's nicht, jsonb-Spalte auf gutachten |

#### C · Reader-Umstellung ohne MOVE (3 Spalten, kein Schema-Change)

| `faelle` (alt) | Reader-Strategie | Notiz |
|---|---|---|
| `gutachten_vorhanden` (bool) | `claims:claim_id(gutachten(id))` → `!!gutachten` (Existenz-Check) | Reader-Hits: 11 · 30/30 cov, aber kein Spalten-Ziel — aus `gutachten`-Existenz/Status ableiten. Konkretes Prädikat pro Reader im Sweep-Schritt (Default: `gutachten?.id != null`). |
| `gutachten_stundensatz` (numeric) | DROP-Reader (null-Lieferung) | Reader-Hits: 4 · 0/30 cov · kein klares Mapping (`gutachten` hat 3 Lohnsätze ak/kar/lack — kein „der eine" Stundensatz). Vermutlich Display-Felder die bereits null sind. |
| `nutzungsausfall_gesamt` (numeric) | Reader berechnet: `tagessatz × tage` aus `gutachten` | Reader-Hits: 9 · 0/30 cov · `gutachten` hat `gutachten_nutzungsausfall_tagessatz_eur` + `nutzungsausfall_tage` — Produkt liefert den Gesamt-Wert. |

### Nicht in Scope

- **Per-Spalten-`DROP COLUMN faelle.*`** — bewusst nicht, faelle-Drop in Phase 6 / SP-L.
- **`apply_gutachten_ocr`-RPC-Änderungen** — die RPC schreibt bereits direkt auf `gutachten`, kein Code-Change nötig (siehe §3 unten).
- **`nutzungsausfall_tage`** (auf `gutachten` existierend) — bleibt unverändert. Phase-1 mappt `reparaturdauer_tage → wiederbeschaffungsdauer_tage`, nicht `→ nutzungsausfall_tage`. `nutzungsausfall_tage` ist ein OCR-befülltes Feld mit eigener Semantik und wird vom SP-G-Backfill nicht angefasst.
- **Sub-Projekte SP-A/B/C/D/E/F/H/J/K/L** — siehe Phase-1-Dekomposition §4.

## 2 · Ausgangslage (Live-DB, 2026-05-20)

Gemessen mit `scripts/cmm44-spg-measure.sql`:

- `faelle` = 278 Spalten · `gutachten` = 73 Spalten · 1 Gutachten-Zeile / 1 distinct claim_id.
- Pre-launch-Realität: 29 von 30 Claims haben kein `gutachten`-Row. Der PR1-Backfill muss daher `INSERT INTO gutachten (claim_id, …)` pro `faelle`-Zeile mit SP-G-Werten machen — eine reine `UPDATE`-Migration wie in SP-B reicht nicht.
- **`gutachten`-Constraints:** PK = `id`, UNIQUE auf `claim_id` (1:1) + UNIQUE auf `auftragsnummer`.
- **Bestehende `gutachten`-Trigger:** `set_gutachten_updated_at` (auto-`updated_at`), `trg_fn_refresh_claim_phase_from_gutachten` (aktualisiert `claims.phase`), `trg_gutachten_benachrichtigung` (Notifications). Alle drei feuern AFTER INSERT/UPDATE und sind durch SP-G unverändert vorteilhaft — werden vom Backfill mit ausgelöst.
- **Bestehender RPC `apply_gutachten_ocr`** schreibt schon nach `gutachten` — kein Code-Change für die OCR-Pipeline nötig. SP-G migriert die *anderen* Reader/Writer (Admin-Korrekturen, Finance-Berechnungen, KI-Schätzwert-Setter etc.).

## 3 · Architektur — 3-PR analog SP-B

PR1 (additive Migration) → PR2 (Code-Sweep, code-only) → PR3 (Catch-up-Backfill, additiv). Kein PR enthält destruktives DDL.

### PR1 — Schema + Backfill + View-Repoint

Eine CLI-Migration (`npx supabase migration new cmm44_spg_add_gutachten_columns`), `BEGIN/COMMIT`:

1. **5× `ALTER TABLE gutachten ADD COLUMN`** — die 4 ki_* + `positionen jsonb`. Typ aus der Live-Messung; alle nullable, keine Defaults. **Generator-Pattern:** Wenn der Implementer das deterministisch aus dem `faelle`-Schema spiegelt, ist Drift ausgeschlossen.
2. **Backfill — UPSERT pro Claim mit beliebigem SP-G-Wert:**
   ```sql
   INSERT INTO public.gutachten (claim_id, fertiggestellt_am, gesamt_schadensbetrag, …)
   SELECT claim_id,
          gutachten_eingegangen_am, gutachten_betrag, …
   FROM public.faelle
   WHERE claim_id IS NOT NULL
     AND (gutachten_eingegangen_am IS NOT NULL OR gutachten_betrag IS NOT NULL OR … /* any of the 16 cols not null */)
   ON CONFLICT (claim_id) DO UPDATE SET
     fertiggestellt_am       = COALESCE(public.gutachten.fertiggestellt_am, EXCLUDED.fertiggestellt_am),
     gesamt_schadensbetrag   = COALESCE(public.gutachten.gesamt_schadensbetrag, EXCLUDED.gesamt_schadensbetrag),
     … (alle 16 MOVE-Spalten)
   ;
   ```
   - **`COALESCE`-Pattern:** Bestehende `gutachten`-Werte gewinnen, faelle-Werte füllen nur `NULL`-Slots. Idempotent + kollisionsfrei.
   - **Trigger-Effekt:** Der Backfill triggert `trg_refresh_claim_phase_from_gutachten` und `trg_gutachten_benachrichtigung`. Das ist akzeptabel: `claims.phase` aktualisiert sich konsistent (Idempotenz: Trigger-Funktion sollte gleicher Eingabe = gleicher Ausgabe sein), und Notifications werden im pre-launch-Umfeld toleriert. **Mitigation:** Vorher Trigger-Body anschauen; falls ein Trigger Side-Effects (Email, WhatsApp) produziert, vor dem Apply mit Aaron klären.
3. **View-Repoint (konditional)** — analog SP-B PR1 Block 3. Live-Audit über `information_schema.columns` für alle Views, die eine der 16 MOVE-Spalten exponieren. Falls Treffer: `CREATE OR REPLACE VIEW` mit Quell-Wechsel von `f.<col>` auf `gutachten.<col>` (via Join auf `gutachten` per `claim_id`). Wenn keine Views betroffen: Block entfällt.
4. **Types-Regen** nach PR1 (`npx supabase gen types --linked`) — `gutachten`-Typ trägt jetzt 5 neue Felder, alle SP-G-Reader können das `gutachten`-Objekt typsicher abfragen.

PR1 ist additiv (kein DROP, kein Spalten-Rename) → jederzeit applizierbar, Apply via `db query --linked` + `migration repair`.

### PR2 — Reader/Writer-Sweep (code-only)

Kein DDL. Alle `faelle`-seitigen Reads UND Writes der 19 Spalten → `gutachten` (Pattern A–E unten). Zwei Dimensionen pro Site: Tabellen-Wechsel **und** Spalten-Rename (bei den 11 1:1-Mappings).

**Cluster-Wahl — vermutlich 1 PR statt mehrere:** Anders als SP-B (3 Domänen-Cluster mit je 13-27 Spalten) sind SP-Gs 19 Spalten alle in *einer* Domäne (Gutachten). Die Reader-Inventur im Plan-Schritt entscheidet final, ob 1 PR (`PR2`) oder 2 PRs (`PR2a` ki_+positionen / `PR2b` Rest) sinnvoller ist; die Daumenregel SP-A2: bei <80 betroffenen Files reicht 1 PR.

#### Transform-Regelwerk

| Muster | Erkennung | Transform |
|---|---|---|
| **A** — Direkt-Select aus `faelle`, nur SP-G-Spalten | `from('faelle').select('id, claim_id, gutachten_betrag, …')` | Quelle wechseln: `from('gutachten').select('gesamt_schadensbetrag, …').eq('claim_id', X).maybeSingle()`. **Spalte renamen** bei den 11 1:1-Mappings. Reader-Konsum auf neuen Property-Namen umstellen. |
| **B** — Direkt-Select aus `faelle`, gemischt | `from('faelle').select('… <SP-G> … <non-SP-G> …')` | SP-G-Spalten in nested `gutachten(...)`-Embed: `from('faelle').select('…non-SP-G…, gutachten(<renamed-SP-G>)')`. **Spalten renamen** im Embed. Reader-Konsum auf `embed.<new>`. `Array.isArray(x) ? x[0] : x`-normalisieren — `gutachten` ist 1:1, aber PostgREST liefert je nach Relation-Detection Objekt oder Array. |
| **C** — Write auf `faelle` | `from('faelle').update/insert({… <SP-G> …})` | **MOVE auf `gutachten`** (gutachten-only — NICHT Dual-Write): SP-G-Spalten aus dem `faelle`-Write entfernen, separater `from('gutachten').upsert({…}, { onConflict: 'claim_id' })`. Guard mit `{ error }`. **Spalten renamen.** Non-SP-G-Spalten im selben Objekt bleiben auf `faelle` (Split). |
| **D** — Nested `faelle(...)`-Select | `from('<x>').select('…, faelle(… <SP-G> …)')` | SP-G-Spalten in `gutachten(...)`-Block ziehen — entweder neben dem `faelle`-Embed (`from('<x>').select('…, faelle(non-SP-G), claims:<…>(gutachten(<SP-G-renamed>))')`) oder via `faelle(gutachten(...))` doppelt nesten falls FK-Pfad existiert. |
| **E** — View-Read | PR1-View-Repoint übernimmt | PR1 hat die Views repointet → kein Code-Change. Output-Spalten-Namen bleiben für Backward-Compat erhalten oder werden (falls View-Definition es zulässt) auf die neuen Namen umbenannt — Entscheidung im View-Audit. |
| **F** — Pure TS-Typ / JSX-Anzeige | Property in `interface`/`type`, JSX | **Property-Rename** auf den neuen `gutachten`-Namen (analog SP-A2 PR1). Generator-Stellen für Display-Strings (z.B. `${fall.gutachten_betrag} €` → `${gutachten?.gesamt_schadensbetrag} €`) mitziehen. |

#### Die drei Reader-Umstellungen (Cluster C)

- **`gutachten_vorhanden`** (11 Hits): pro Reader-Site das passende Existenz-Prädikat einsetzen. Default: `!!gutachten?.id`. Falls ein Reader vorher auf einen *Status*-Wert wartete (z.B. nur „fertiges" Gutachten), `gutachten?.status === 'fertig'`-ähnliches Prädikat — pro Site klären, nicht raten.
- **`gutachten_stundensatz`** (4 Hits): null-Lieferung. Konkrete Implementation pro Site:
  - Display-String `${fall.gutachten_stundensatz} €` → `${gutachten?.gutachten_lohnsatz_ak_eur ?? '–'} €` (oder „n/a") **wenn** der Wert in der UI gebraucht wird. Wenn der String aktuell bei 0-cov nie sichtbar war, einfach den Display-Pfad entfernen.
  - Inventur-Schritt entscheidet pro Stelle: behalten-mit-AK-Lohnsatz vs. ersatzlos-droppen.
- **`nutzungsausfall_gesamt`** (9 Hits): Reader rechnet: `(gutachten?.gutachten_nutzungsausfall_tagessatz_eur ?? 0) × (gutachten?.nutzungsausfall_tage ?? 0)`. Falls einer der Operanden null und der bestehende Reader nicht null-tolerant ist, `null`-Lieferung (Display `–`).

### PR3 — Catch-up-Backfill (additive Migration)

Eine kleine CLI-Migration: idempotenter Re-UPSERT der 16 MOVE-Spalten (gleiches `INSERT … ON CONFLICT DO UPDATE SET … = COALESCE(...)`-Pattern wie PR1 Block 2). Fängt `faelle`-Writes, die im Fenster zwischen PR1-Backfill und PR2-Writer-Deploy noch auf `faelle` liefen. Idempotent, additiv, ohne Zeitdruck (`faelle` behält die Daten bis Phase 6).

### Sequencing

PR1 (additiv) jederzeit applizierbar. PR2 → `staging` → `main`-Release. PR3 nach PR2-`main`-Release. Kein destruktives DDL → die AAR-599-Sequencing-Gefahr entfällt.

## 4 · Migrations-Vorgehen (bewährt aus SP-A2/A3/B)

1. Vor jeder Migration Live-DB messen (`information_schema`) — Drift-Check.
2. Migrationen in `BEGIN/COMMIT`; vor dem Apply Dry-Run (`BEGIN; … ROLLBACK;`).
3. Apply via `npx supabase db query --linked --file <sql>` + `npx supabase migration repair --status applied <version>` — **kein** `db push`.
4. `information_schema`-Verify nach jedem Schritt; `types regen` nach PR1.
5. AGENTS.md Regel 2 (DDL nur CLI) + Regel 3 (kein unbegleiteter Stash).

## 5 · Tests & Erfolgskriterium

Portal-Smoke auf 5 Portalen (Public / Admin / Dispatch / SV / Kunde) mit Screenshots nach PR2 und PR3 — die gutachten-bezogenen UI-Werte (Fallakte-Header, Finance-Übersicht, KI-Schätzwerte-Anzeige, Mietwagen/Nutzungsausfall-Block) erscheinen unverändert.

**Erfolg, wenn:**
- `information_schema.columns` zeigt 5 neue Spalten auf `gutachten` (4 ki_* + `positionen`).
- `git grep` jedes der 19 Spaltennamen → 0 `faelle`-seitige Reads/Writes in `src/` (pro Namen einzeln, kontext-sicher mit paren-balanced Re-Grep wie in SP-B-Lessons).
- `npm run build` grün (mit 8 GB heap).
- Portal-Smoke: 0 Hard-Fails; jeder gutachten-Wert erscheint korrekt.

## 6 · Risiken

| Risiko | Mitigation |
|---|---|
| Backfill: `trg_gutachten_benachrichtigung` triggert ungewollte Notifications bei 30 INSERT-OPs | Vor Apply Trigger-Body inspizieren (`pg_get_functiondef`); falls Email/WhatsApp gefeuert wird, Trigger temporär deaktivieren (`ALTER TABLE … DISABLE TRIGGER …` in der Migration vor Backfill, Re-Enable danach) |
| `apply_gutachten_ocr`-RPC + neue Writer kollidieren | RPC bleibt unverändert (schreibt schon `gutachten`). PR2-Writer treffen `gutachten` direkt → keine Race; UNIQUE-Constraint auf `claim_id` verhindert Duplikate |
| `gutachten_vorhanden`-Reader misinterpretiert (z.B. ein Status-Filter wird übersehen) | Konkretes Reader-Audit im PR2-Inventur-Schritt pro Site; abgeleitete Bedingung explizit dokumentieren, nicht generisch raten |
| `nutzungsausfall_gesamt`-Berechnung null-Operand | Reader gibt null/„–" bei null-Operand; bestehende Display-Pfade vermutlich schon null-tolerant (0-cov heißt: noch nie ausgelöst) |
| Dynamische `fall[feld]`-Reads, die `grep` nicht fängt | Portal-Smoke auf allen 5 Portalen + kontext-sicherer paren-balanced Re-Grep (SP-B-Lesson) |
| Writer übersehen → `gutachten`-Staleness (kein Sync-Trigger) | Re-Grep pro Spaltenname einzeln + Smoke; PR3-Catch-up-Backfill heilt Reste |
| View-Read exponiert `faelle`-Gutachten-Spalte | PR1 ergänzt die Views via Repoint; falls eine Output-Spalte renamed werden muss (View-Konsumenten brechen), Backward-Compat-Alias erwägen |
| Fremd-Drift (Parallel-Sessions ändern `gutachten`/`faelle`) | `information_schema` live direkt vor PR1 nachmessen (`feedback_information_schema_check`) |

---

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
