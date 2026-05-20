# CMM-44 SP-G — View-Audit + Trigger-Audit

**Datum:** 2026-05-20 · **PR1-Migration:** `supabase/migrations/20260520095539_cmm44_spg_add_gutachten_columns.sql`

Live-Audit gegen Prod-DB (`db query --linked`, 2026-05-20). Mit den drei Aaron-Entscheidungen aus dem Brainstorm:
- 4 ki_*-Spalten + `gutachten_positionen` → ADD COLUMN auf `gutachten`
- 3 Rest-Spalten (`gutachten_vorhanden`, `gutachten_stundensatz`, `nutzungsausfall_gesamt`) → Reader-Umstellung
- Rein additiv (kein per-Spalten-DROP, faelle stirbt in Phase 6)
- **Alle 3 Views in PR1 repointen**

## View-Audit

Welche Views exponieren eine der 19 SP-G-Spalten?

| View | Spalten (aus `f.<col>`) | Repoint nötig? |
|---|---|---|
| `faelle_sv_view` | `gutachter_honorar` (1) | **Ja** |
| `v_claim_full` | `gutachten_betrag`, `gutachten_eingegangen_am` (2) | **Ja** |
| `v_faelle_mit_aktuellem_termin` | alle 19 SP-G-Spalten | **Ja** |

`pg_get_viewdef` bestätigt: alle 3 Views lesen die SP-G-Spalten **direkt aus `f.<col>`** (faelle), nicht aus `gutachten`. Ohne Repoint würden View-Konsumenten nach PR2-Writer-MOVE stale faelle-Werte sehen.

### View-Repoint-Strategie (PR1 Block 3)

Pro betroffene View:
- `LEFT JOIN public.gutachten g ON g.claim_id = c.id` ergänzen (der `claims c`-Join existiert in allen 3 Views bereits)
- Pro SP-G-Spalte: `f.<col>` → `g.<new>` Replace, **Output-Spalten-Namen via `AS <alt>` unverändert** für Backward-Compat (Reader-Code-Sweep kommt erst in PR2)
- Precision-Casts wo Typen abweichen — siehe Tabelle unten

### Precision-Casts (faelle-View-Typ vs. gutachten-Spalten-Typ)

| Output-Spalte | faelle-View-Typ | gutachten-Typ | Cast |
|---|---|---|---|
| `gutachten_betrag` | numeric(10,2) | gesamt_schadensbetrag numeric(12,2) | `::numeric(10,2)` |
| `nutzungsausfall_tagessatz` | numeric(10,2) | gutachten_nutzungsausfall_tagessatz_eur numeric(8,2) | `::numeric(10,2)` |
| `ki_geschaetzte_kosten_min` | numeric(10,2) | ki_geschaetzte_kosten_min numeric (PR1 ADD) | `::numeric(10,2)` |
| `ki_geschaetzte_kosten_max` | numeric(10,2) | ki_geschaetzte_kosten_max numeric (PR1 ADD) | `::numeric(10,2)` |
| `gutachten_stundensatz` | numeric(10,2) | (DROP — `NULL`) | `NULL::numeric(10,2)` |
| `nutzungsausfall_gesamt` | numeric(10,2) | (calc tagessatz × tage) | `(g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage)::numeric(10,2)` |

Alle anderen Spalten passen typgleich.

### Klasse-C-Reader-Mappings im View-Body

- **`gutachten_vorhanden`** → `(g.id IS NOT NULL) AS gutachten_vorhanden` (Existenz-Check der gutachten-Zeile)
- **`gutachten_stundensatz`** → `NULL::numeric(10,2) AS gutachten_stundensatz` (DROP — pre-launch 0-cov, kein klares Single-Lohnsatz-Mapping)
- **`nutzungsausfall_gesamt`** → Produkt aus `g.gutachten_nutzungsausfall_tagessatz_eur * g.nutzungsausfall_tage`

## Trigger-Audit

`pg_get_functiondef` für alle Trigger auf `gutachten` (`NOT tgisinternal`):

| Trigger | prosrc-Inhalt | Side-Effects | Backfill DISABLE? |
|---|---|---|---|
| `set_gutachten_updated_at` | `NEW.updated_at = now(); RETURN NEW;` | nur `updated_at`-Pflege | **NEIN** (gewünscht) |
| `trg_fn_refresh_claim_phase_from_gutachten` | `UPDATE public.claims SET phase = public.calc_claims_phase(id, status, kundenbetreuer_id) WHERE id = <claim_id>;` | aktualisiert `claims.phase` | **NEIN** (gewünscht — Phase-Konsistenz beim Backfill) |

`trg_gutachten_benachrichtigung` aus dem Spec ist **nicht (mehr) auf der DB vorhanden** — entweder schon gedroppt oder Spec war veraltet. Keine Notification-Trigger zu wrappen.

**Konsequenz:** Backfill läuft ohne DISABLE/ENABLE-Wrapper. Die 2 verbleibenden Trigger feuern gewollt:
- `updated_at` wird auf den Backfill-Zeitpunkt gesetzt — korrekt.
- `claims.phase` wird neu berechnet — konsistent mit den jetzt befüllten gutachten-Werten.

## Dry-Run

Mit beiden Anpassungen (PR1-Migration ergänzt um `sv_id`-Backfill + Precision-Casts) lief der Dry-Run grün:

```
$ sed 's/^COMMIT;/ROLLBACK;/' supabase/migrations/20260520095539_*.sql > /tmp/spg-pr1-dryrun.sql
$ npx supabase db query --linked --file /tmp/spg-pr1-dryrun.sql
# → 0 Fehler, ROLLBACK ausgeführt
```

### Aufgetretene und gefixte Dry-Run-Probleme

1. **`sv_id NOT NULL violates`** (Iteration 1): `gutachten.sv_id` ist NOT NULL ohne Default — initial fehlte sie im INSERT. Fix: `sv_id` aus `faelle.sv_id` ins INSERT-SELECT übernommen, WHERE-Klausel um `AND sv_id IS NOT NULL` ergänzt (gutachten ohne SV ergibt semantisch keinen Sinn).
2. **`cannot change data type of view column "gutachten_betrag" from numeric(10,2) to numeric(12,2)`** (Iteration 2): `CREATE OR REPLACE VIEW` erlaubt keine Typ-Änderung der Output-Spalten. Fix: Precision-Casts in den View-Bodies — `g.gesamt_schadensbetrag::numeric(10,2)` etc. (siehe Tabelle oben).

## Migration-Apply-Reihenfolge (Task 2)

1. `npx supabase db query --linked --file supabase/migrations/20260520095539_cmm44_spg_add_gutachten_columns.sql`
2. `npx supabase migration repair --status applied 20260520095539`
3. Verify: `npx supabase db query --linked --file scripts/cmm44-spg-verify.sql` → `spg_neu_auf_gutachten = 5`
4. Types regen: `npx supabase gen types typescript --linked > src/lib/supabase/database.types.ts 2>$null` (PowerShell — kein Bash `2>&1`!)
5. Build: `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
6. Commit + Push (KEIN PR — wartet auf Reviews per `feedback_draft_pr_nicht_release_sicher`)
