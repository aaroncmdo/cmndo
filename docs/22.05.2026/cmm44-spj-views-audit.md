# CMM-44 SP-J PR1 (Bucket B) — Task 0 Messung + View-Audit + Trigger-Audit

**Datum:** 2026-05-22 · **Branch:** `kitta/cmm-44-spj-pr1-add-columns` · **Migration:** `20260522133422_cmm44_spj_add_claims_columns.sql`
**Quelle:** Live-Messung gegen verlinktes Projekt `paizkjajbuxxksdoycev` via `supabase db query --linked` (read-only).

## Task 0 — Live-Messung der 12 faelle-Spalten

| faelle-Spalte | udt (prec,scale) | nullable | default | cov | Bucket |
|---|---|---|---|---|---|
| `zahlung_eingegangen_am` | timestamptz | — | — | 0 | **A** → claim_payments (PR2) |
| `zahlung_betrag` | numeric(10,2) | — | — | 0 | **A** → claim_payments (PR2) |
| `zahlungsweg` | text | — | — | 0 | **A** → claim_payments (PR2) |
| `guthaben_verrechnet_netto` | numeric(10,2) | **NO** | **0** | **49** | **B** → claims ADD |
| `sv_nachzahlung_netto` | numeric(10,2) | YES | — | 0 | **B** |
| `auszahlung_gutachter_betrag` | numeric (unconstrained) | YES | — | 0 | **B** |
| `schlussabrechnung_am` | timestamptz | YES | — | 0 | **B** |
| `auszahlung_gutachter_eingegangen_am` | timestamptz | YES | — | 0 | **B** |
| `auszahlung_zahlungsweg` | text | YES | — | 0 | **B** |
| `abrechnung_id` | uuid | YES | — | 0 | **B** |
| `kanzlei_abrechnung_id` | uuid | YES | — | 0 | **B** |
| `zahlung_erwartet_am` | date | YES | — | 0 | **C** → Phase-6-DROP (nicht migriert) |

Row-Counts: `claims=50`, `faelle=49` → 1 Claim ohne faelle (Backfill `WHERE f.claim_id=c.id` lässt ihn auf DEFAULT). `claim_payments=0` (pre-launch). `bucketB_on_claims=0` vor Apply (clean).

## Korrekturen gegenüber Spec/Plan-Entwurf (Live-Befund schlägt Annahme)

1. **`abrechnung_id` hat auf faelle KEINEN FK.** Spec-Entwurf nahm `REFERENCES abrechnungen(id)` an — live existiert kein FK-Constraint auf `faelle.abrechnung_id`. → ADD als **bare `uuid` ohne FK** (faithful mirror; Integrität, die faelle nie hatte, wird nicht neu erfunden — trivial später nachrüstbar, falls gewünscht).
2. **`kanzlei_abrechnung_id` referenziert `kanzlei_abrechnungen(id)`, NICHT `abrechnungen(id)`.** Realer Constraint: `faelle_kanzlei_abrechnung_id_fkey: FOREIGN KEY (kanzlei_abrechnung_id) REFERENCES kanzlei_abrechnungen(id)` (kein ON DELETE = NO ACTION). → ADD spiegelt das exakt.
3. **Typen exakt gespiegelt** statt Platzhalter-`numeric`: `guthaben_verrechnet_netto numeric(10,2) NOT NULL DEFAULT 0`, `sv_nachzahlung_netto numeric(10,2)`. Das hält zugleich die View-Repoints 42P16-sauber (s.u.).
4. **`claim_payments.status` (für PR2 gemessen):** `text NOT NULL DEFAULT 'ausstehend'`, CHECK `IN ('ausstehend','teilweise','erhalten','final','abgelehnt')`. → PR2-Bucket-A-Writer MUSS beim Zahlungseingang `status:'erhalten'` setzen (nicht weglassen, nicht 'ausstehend').

## View-Audit — 3 betroffene Views

| View | exponierte SP-J-Spalten | Repoint |
|---|---|---|
| `faelle_kunde_view` | `auszahlung_zahlungsweg` (B) | `f.` → `c.` |
| `faelle_sv_view` | `auszahlung_gutachter_eingegangen_am` (B) | `f.` → `c.` |
| `v_faelle_mit_aktuellem_termin` | alle 11 (3 A + 8 B) | B: `f.`→`c.` · A: `f.`→`NULL::<typ> AS` |

**Repoint-Strategie (umgesetzt im Generator `scripts/cmm44-spj-gen-migration.mjs`):**
- **Bucket B (8):** `f.<col>` → `c.<col>`. Der `claims c`-Alias (`LEFT JOIN claims c ON c.id=f.claim_id`) ist in allen 3 Views vorhanden. Typen identisch (exakter Mirror) → `CREATE OR REPLACE VIEW` ändert weder Spaltenname noch -typ noch -reihenfolge ⇒ kein 42P16.
- **Bucket A (3):** `f.<col>` → `NULL::<exakter-typ> AS <col>` (`timestamp with time zone` / `numeric(10,2)` / `text`). Begründung: pre-launch 0-cov; die echten Zahlungs-Reads laufen ab PR2 über Bucket-A-Code gegen `claim_payments` (aktuelle Row), nicht über den View. View-Reader sind damit Pattern E (kein Code-Change). Exakte Typ-Casts halten die View-Spaltentypen stabil (42P16-Guard).
- **Bucket C (`zahlung_erwartet_am`):** im View unverändert `f.zahlung_erwartet_am` (Phase-6-DROP).
- Jede Substitution mit **Occurrence-Assertion (genau 1×)** im Generator — bricht bei Drift/Konflikt ab. Bei Apply (Task 2) wird der Generator erneut gegen die dann-live-Defs gefahren + gegen die committete Datei gedifft (Drift-Schutz; `v_faelle_mit_aktuellem_termin` wird auch von SP-C1/SP-D/SP-G2 angefasst).

## Trigger-Audit (SP-G-Lesson)

`funcs_ref_bucketB = null` — **keine** Funktion in `public` referenziert eine der 8 Bucket-B-Spalten. Der claims↔faelle-Sync-Trigger (`sync_claims_sv_id_to_faelle`) synct nur `sv_id`. ⇒ Der Backfill-UPDATE löst **keine** Notification/Sync-Kaskade aus → **kein DISABLE/ENABLE-Wrapper nötig**.
claims-Trigger (zur Info): `guard_claims_created_by` (ins/upd), `trg_claim_validate_kb_rolle`, `trg_claims_claim_nummer`, `trg_claims_set_phase`, `trg_claims_updated_at`, `trg_claims_verjaehrung`, `trg_sync_claims_sv_id_to_faelle` — keiner liest die Bucket-B-Spalten.

## Dry-Run

`sed 's/^COMMIT;/ROLLBACK;/'` → `db query --linked` → **EXIT=0, keine Fehler** (ADD-Syntax, kanzlei_abrechnungen-FK, Backfill-Join, 3× CREATE OR REPLACE VIEW 42P16-Check alle grün; ROLLBACK persistiert nichts).
