# CMM-44 SP-I1 — LexDrive + Klage → `kanzlei_faelle` (Design)

> **Ticket:** CMM-44 / Sub-Projekt SP-I (Kanzleifall-LC), Slice 1 ("mandat-lexdrive").
> **Status:** Design — von Aaron freigegeben (Scope + PR-Struktur), 2026-05-23.
> **Vorgänger-Pattern:** SP-G (1:1-Sub-Table via UNIQUE), SP-H (Lifecycle-Sub-Table), SP-D/SP-G2/SP-C1 (View-Repoint `v_faelle_mit_aktuellem_termin`).

## Goal

Vier dormante Kanzlei-Lifecycle-Spalten von `faelle` auf ihre semantische Heimat `kanzlei_faelle` (1:1-Sub-Entity pro Claim/Fall) umziehen. **Rein additiv** — kein `DROP COLUMN` (das passiert sammelweise in CMM-44 Phase 6). Die vier Spalten:

- `lexdrive_case_id` (`text`) — Salesforce-recordId des LexDrive-Vorgangs (Deep-Link-Quelle).
- `lexdrive_ocr_data` (`jsonb`) — OCR-Rohdaten aus dem LexDrive-Akteneingang.
- `lexdrive_ocr_received_at` (`timestamptz`) — Zeitstempel des OCR-Eingangs.
- `klage_uebergeben_am` (`timestamptz`) — Übergabe an die Klage-Instanz.

## Scope-Entscheidung (Aaron, 2026-05-23)

SP-I umfasst laut Phase-1-Dekomposition **56 Spalten** (`docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md`, größtes Cluster, „hoch"-Risiko). Diese Slice nimmt bewusst **nur die 4 LexDrive/Klage-Spalten** — alle `cov=0`, winziger Blast-Radius. Bewusst **verschoben** auf spätere SP-I-Slices:

- **`mandatsnummer`** (`cov=12`) — primäres Display-Label in `search` / `admin-faelle-hub` / `kanzlei-kanban` / PDF / `autoPhase`, dazu zwei Writer mit **konfligierender Semantik** (`filmcheck.ts` schreibt `CLM-YYYY-NNNN`, `push-mandat.ts` überschreibt mit Salesforce-Mandat-ID). Eigene Slice mit Reklassifizierungs-Entscheidung (CLM-Fallnummer → `claims` vs. Mandat-ID → `kanzlei_faelle`).
- **`kanzlei_id`** (`cov=0`) — Dekomposition markiert „TBD"; Heimat-Frage (Zuordnungs-FK) erst klären.

## Current State (live gemessen 2026-05-23, Projekt `paizkjajbuxxksdoycev`)

### `kanzlei_faelle` (8 Spalten, **0 Rows**)

| Spalte | Typ | Constraint |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `fall_id` | uuid | NOT NULL, **UNIQUE**, FK→`faelle.id` |
| `claim_id` | uuid | NOT NULL, **UNIQUE**, FK→`claims.id` |
| `status` | text | NOT NULL (kein Default) |
| `vs_kontakt_am` | timestamptz | — |
| `ausgezahlt_am` | timestamptz | — |
| `erstellt_am` | timestamptz | NOT NULL `now()` |
| `updated_at` | timestamptz | NOT NULL `now()` |

- **Kardinalität:** 1:1 pro Claim **und** pro Fall (beide UNIQUE) → wie SP-G `gutachten`. Im View reicht ein einfacher `LEFT JOIN ... ON kf.claim_id = c.id`, **kein** LATERAL/`LIMIT 1` nötig.
- **Trigger `kanzlei_faelle_sync_claim_fall`** (BEFORE INSERT/UPDATE): leitet bei nur gesetztem `fall_id` das `claim_id` aus `faelle` ab (und umgekehrt). Relevant nur falls künftig Rows eingefügt werden.
- **Trigger `tg_auftraege_set_updated_at`** (wiederverwendete Funktion): pflegt `updated_at`. Harmlos.

### Die 4 Spalten auf `faelle`

- Coverage **0/0** für alle vier (kein einziger Fall trägt einen Wert).
- **Writer: keiner.** `src/lib/lexdrive/process-event.ts` (`computeFieldUpdates`) schreibt keine der vier. Die LexDrive-OCR-Integration, die `lexdrive_ocr_*` befüllen würde, ist noch nicht verdrahtet. `klage_uebergeben_am` hat 0 Code-Referenzen (`klage_eingereicht`-Event setzt nur `status='klage'`).
- **Reader:**
  - `src/app/gutachter/fall/[id]/page.tsx:508,631` liest `lexdrive_case_id` — **aus der View `v_faelle_mit_aktuellem_termin`** (das Haupt-`fall`-Objekt der Seite), nicht direkt aus `faelle`.
  - `src/lib/kanzlei/lexdrive-link.ts` — nur Kommentar-Referenz (`getLexdriveDeepLink(caseId)` bekommt den Wert als Argument übergeben, liest die Spalte nicht selbst).
  - `lexdrive_ocr_data`, `lexdrive_ocr_received_at`, `klage_uebergeben_am`: **0 Code-Referenzen**.

### View

- **Nur** `v_faelle_mit_aktuellem_termin` (relkind `v`, keine Matview) exponiert die 4 Spalten, Quelle heute `f.<col>` (faelle-Alias). Vollständige `pg_get_viewdef` liegt dem Plan bei.
- `faelle_sv_view` exponiert die 4 **nicht** (nur Gutachter-/Nachbesichtigungs-Felder) → von SP-I1 nicht betroffen.

## Architektur — eine additive PR (Ansatz A)

Weil es **keinen Reader-/Writer-Code-Sweep** (einziger Reader läuft über die View) und **keinen sinnvollen Backfill** (cov=0, keine Writer) gibt, entfallen die SP-H-typischen PR2/PR3. Eine PR:

### Block 1 — `ALTER TABLE kanzlei_faelle ADD COLUMN` × 4

```sql
ALTER TABLE public.kanzlei_faelle
  ADD COLUMN lexdrive_case_id text,
  ADD COLUMN lexdrive_ocr_data jsonb,
  ADD COLUMN lexdrive_ocr_received_at timestamptz,
  ADD COLUMN klage_uebergeben_am timestamptz;
```

Alle nullable, keine Defaults — exakt wie auf `faelle` (Live-Messung im Plan-Task bestätigt die Typen vor dem Schreiben).

### Block 2 — Backfill: dokumentierter No-op

`cov=0` auf `faelle`, `kanzlei_faelle` leer ⇒ keine Daten zu migrieren. Ein INSERT-Backfill wäre zusätzlich nicht-trivial (`kanzlei_faelle.status` ist NOT NULL ohne Default). Bei cov=0 moot → **kein Backfill-Block**, nur ein SQL-Kommentar, der das festhält.

### Block 3 — View-Repoint `v_faelle_mit_aktuellem_termin`

`CREATE OR REPLACE VIEW` mit der **vollständigen** aktuellen Definition, **zwei** Änderungen:

1. Neuer Join nach `LEFT JOIN gutachten g ON g.claim_id = c.id`:
   ```sql
   LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
   ```
   (1:1 via UNIQUE `claim_id` → kein LATERAL, kein `LIMIT 1`.)
2. Die 4 Spalten-Quellen umstellen, **Name/Typ/Position unverändert**:
   - `f.lexdrive_case_id` → `kf.lexdrive_case_id`
   - `f.lexdrive_ocr_data` → `kf.lexdrive_ocr_data`
   - `f.lexdrive_ocr_received_at` → `kf.lexdrive_ocr_received_at`
   - `f.klage_uebergeben_am` → `kf.klage_uebergeben_am`

`CREATE OR REPLACE` (kein DROP) ist zulässig, weil die Spaltenliste (Reihenfolge/Namen/Typen) identisch bleibt — nur Quell-Ausdrücke ändern sich. Typen bleiben identisch (`kf.<col>` hat denselben Typ wie `f.<col>`), daher **kein Cast** nötig. Abhängige Views (z. B. `faelle_sv_view`, falls darauf aufgebaut) brechen nicht, da keine Spalte entfernt/umsortiert wird.

**Verhalten unverändert:** Vor dem Repoint liefert die View `f.<col>` = NULL (cov=0); nach dem Repoint `kf.<col>` = NULL (kanzlei_faelle leer). Reiner Quell-Wechsel, kein Daten-/Anzeige-Effekt.

### Block 4 — Types + Build

`npx supabase gen types typescript --linked` (via PowerShell, kein Bash-`2>&1` — SP-G-Lesson) → `src/lib/supabase/database.types.ts`. Voller Build mit `NODE_OPTIONS=--max-old-space-size=8192`.

### Kein Code-Change

- **Reader** `gutachter/fall/[id]/page.tsx` liest `lexdrive_case_id` über die repointete View → **Pattern E, kein Change**.
- **Writer**: keiner existiert.

## Migrations-Vorgehen (AGENTS.md Regel 2)

- DDL nur über supabase-CLI: `npx supabase migration new …`, SQL schreiben, **Dry-Run** (`BEGIN; … ROLLBACK;` via `db query --linked --file`), dann Apply via `db query --linked --file <mig>` + `npx supabase migration repair --status applied <ts>`. **Kein `db push`.**
- Migration in `BEGIN/COMMIT`.
- Worktree ist gelinkt (`.env.local` + `supabase/.temp/`).

## Verifikation + Smoke

1. **Schema-Verify:** `SELECT count(*) FROM information_schema.columns WHERE table_name='kanzlei_faelle' AND column_name IN (…4…)` ⇒ `4`.
2. **View-Verify:** `pg_get_viewdef` zeigt `kf.<col>` für die 4 + den neuen Join; die 4 Spalten weiterhin in der View-Spaltenliste vorhanden (gleiche Position).
3. **Build** grün (8 GB Heap).
4. **Portal-Smoke nach Merge** (Memory: Screenshot-Pflicht, gegen `app.staging.claimondo.de`, nie Prod):
   - **SV** `gutachter/fall/[id]` — primärer `lexdrive_case_id`-Reader über View; LexDrive-Deep-Link-Button rendert (oder null, da case_id NULL — wie heute).
   - **Sanity** Admin `faelle`, Kunde-Portal, Public — kein 5xx / TypeError / Hydration-Overlay.

## Risiken

| Risiko | Mitigation |
|---|---|
| `CREATE OR REPLACE VIEW` scheitert an Spalten-Reorder/-Typ | Vollständige aktuelle viewdef als Basis, nur 4 Quell-Ausdrücke + 1 Join geändert; Dry-Run gegen Live-DB fängt „cannot change name/type of view column". |
| Andere Session droppt/ändert eine der 4 Spalten oder die View parallel | Drift-Recheck (`information_schema` live) unmittelbar vor Apply (Memory `information_schema-Check vor Cluster-Refactor`). |
| Übersehener Reader der 4 Spalten | paren-balanced Re-Grep der 4 Spaltennamen in `src/` (außer `database.types.ts`) ⇒ erwartet 0 neue `from('faelle')`-Direkt-Reads; bekannter View-Reader bleibt unverändert. |
| Künftiger LexDrive-OCR-Writer schreibt weiter auf `faelle` | Out-of-Scope-Notiz: wenn die OCR-Integration verdrahtet wird, MUSS sie auf `kanzlei_faelle` schreiben (UPSERT, Sync-Trigger füllt `claim_id`/`fall_id`, `status` Pflichtwert beachten). |

## Bewusst nicht in dieser Slice (Phase-/Slice-Grenzen)

- **DROP der 4 `faelle`-Spalten** → CMM-44 **Phase 6** (sammelweise, wie alle SP-*).
- **`mandatsnummer`-Reklassifizierung** + **`kanzlei_id`** → spätere SP-I-Slice.
- **`getKanzleiFall`-Loader / Writer-Pfad** für die 4 neuen Spalten → erst wenn ein Consumer/Integration sie braucht (YAGNI).
- Restliche ~52 SP-I-Spalten (Dokumente-AS, Regulierung, Kanzlei-DUP) → eigene SP-I-Slices.

## Definition of Done

- [ ] 4 Spalten additiv auf `kanzlei_faelle` (Verify = 4); Typen exakt von `faelle` gespiegelt.
- [ ] `v_faelle_mit_aktuellem_termin` repointet (4× `kf.<col>` + `LEFT JOIN kanzlei_faelle`); viewdef-Verify; Spaltenliste unverändert.
- [ ] Backfill dokumentierter No-op (cov=0).
- [ ] Re-Grep: 0 neue `faelle`-Direkt-Reads der 4 Spalten; View-Reader unverändert.
- [ ] Types regeneriert, voller Build grün.
- [ ] PR gegen `staging` (kein Auto-Merge); nach Merge Portal-Smoke mit Screenshots.
- [ ] Phase-1-Mapping + Handoff-Doc + Memory nachgezogen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
