# CMM-44 SP-J — Abrechnung/Zahlung-Spalten → `claims` (Design-Spec)

**Datum:** 2026-05-22 · **Master:** CMM-44 (`faelle`-Drop) · **Strategie:** `docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md` §4, Phase-1-Mapping `docs/16.05.2026/cmm44-phase1-faelle-dekomposition.md` §3 (Cluster „Abrechnung").

## 1 · Ziel & Scope

12 zahlungs-/abrechnungsbezogene `faelle`-Spalten auf `claims` migrieren. **Rein additiv** — kein per-Spalten-`DROP`; `faelle` behält die Spalten bis Phase 6 (`DROP TABLE faelle`). Muster identisch zu **SP-B** (claims-native ADD, 1:1 pro Claim).

### Die 12 Spalten (alle nur auf `faelle`, kein DUP auf claims/abrechnungen)

| # | Spalte | Typ (Doc) | Cov live | Klasse |
|---|---|---|--:|---|
| 1 | `zahlung_eingegangen_am` | timestamptz | 0 | Zahlungs-State |
| 2 | `zahlung_erwartet_am` | date | 0 | Zahlungs-State |
| 3 | `zahlung_betrag` | numeric | 0 | Zahlungs-State |
| 4 | `guthaben_verrechnet_netto` | numeric | 48 (Default) | Zahlungs-State |
| 5 | `sv_nachzahlung_netto` | numeric | 0 | Zahlungs-State |
| 6 | `schlussabrechnung_am` | timestamptz | 0 | Zahlungs-State |
| 7 | `zahlungsweg` | text | 0 | Zahlungs-State |
| 8 | `auszahlung_gutachter_eingegangen_am` | timestamptz | 0 | SV-Auszahlung |
| 9 | `auszahlung_zahlungsweg` | text | 0 | SV-Auszahlung |
| 10 | `auszahlung_gutachter_betrag` | numeric | 0 | SV-Auszahlung |
| 11 | `abrechnung_id` | uuid (FK→abrechnungen) | 0 | Invoice-Link |
| 12 | `kanzlei_abrechnung_id` | uuid (FK→abrechnungen) | 0 | Invoice-Link |

**Exakte Typen/Defaults/Precision + FK-Constraints werden in PR1 live gemessen** (`information_schema` + `pg_constraint`) und 1:1 gespiegelt — SP-G/SP-D-Lehre: numeric-Precision messen (sonst 42P16 beim View-Repoint), NOT-NULL/Default nicht raten (`guthaben_verrechnet_netto` hat einen Default).

### Verdikt-Korrektur (wichtig)
Das Phase-1-Audit listete diese 12 als „MOVE → `abrechnungen`". **Das ist falsch** und wird hier korrigiert: `abrechnungen` ist eine **empfänger-gescopte Rechnung** (`empfaenger_typ`/`empfaenger_id`, `abrechnungs_nr`, `positionen` jsonb, `summe_*`, eigenes `bezahlt_am`/`status`) **ohne `claim_id`/`fall_id`**. Die 12 Spalten sind **per-Claim-Zahlungs-Outcome** (1:1 pro Claim) → Heimat = `claims` (bestätigt Aaron 2026-05-22). Phase-1-Doc §6 sieht genau das vor („TBD/Verdikt beim Sub-Projekt-Spec gegen echte Reader/Writer entscheiden").

## 2 · Architektur

`claims` ist die per-Claim-SSoT (SP-B legte dort 64 Spalten ab). Die 12 sind **1:1 pro Claim** → simpler ADD, **keine** 1:N-„aktueller-Row"-Logik (anders als SP-H/auftraege, SP-D/gutachter_termine). Namen bleiben unverändert (claims hat aktuell keine der 12 → keine Kollision). Die 2 Invoice-FKs werden `claims.abrechnung_id` / `claims.kanzlei_abrechnung_id` (FK→`abrechnungen`, Claim→Rechnung-Link).

## 3 · Komponenten & Daten-Fluss

### 3a · Zentrale-Writer-Routing (SP-J-Kernpunkt)
`src/lib/faelle/state-machine.ts` `transitionFallStatus` setzt bei `status='zahlung-eingegangen'`:
`update.zahlung_eingegangen_am = now; update.zahlung_betrag = metadata.betrag`. Diese laufen durch `splitOrKeepFaelleUpdate`. **Lösung = SP-B-Muster:** die 12 namensgleichen Spalten in `CLAIM_OWNED_DUPLICATE_COLUMNS` (`src/lib/faelle/claim-duplicate-columns.ts`) aufnehmen → der Helper splittet sie automatisch nach `claims`. Komponiert sauber mit SP-Hs `peelAuftraegeColumns` (läuft davor; disjunkt, vom Unit-Test abgesichert). `process-event.ts` ist ebenfalls Helper-Consumer → automatisch abgedeckt.

### 3b · View-Repoint (live auditiert)
3 Views exponieren SP-J-Spalten und werden in PR1 auf `c.<col>` (claims) repointet:
- `v_faelle_mit_aktuellem_termin` — alle 12
- `faelle_sv_view` — `auszahlung_gutachter_eingegangen_am`
- `faelle_kunde_view` — `auszahlung_zahlungsweg`

`CREATE OR REPLACE VIEW` mit wortgetreuem Body aus live `pg_get_viewdef` + Precision-Casts wo nötig (42P16-Guard). View-Reader brauchen dann **keinen** Code-Change (Pattern E).

### 3c · Reader/Writer-Sweep (PR2, voller Sweep — Aaron)
Paren-balanced Re-Grep (`scripts/cmm44-spj-grep.mjs`, analog SP-H). Jeder direkte `from('faelle')`-Read/Write der 12 → `claims`. Ziel: **0 unrerouted faelle-SP-J-Zugriffe**. Footprint ist groß (Finance-Domain, ~38 `abrechnung_id`-Refs), aber Daten ~0 (pre-launch) → niedriges Laufzeit-Risiko. Muster:
- **Reads:** direkter `faelle`-Select der 12 → `claims:claim_id(<cols>)`-Embed (1:1, Array-Normalisierung) oder Quelle auf claims/Views. `select('*')`-Reads, die nur eine SP-J-Property nutzen, mit-umstellen.
- **Writes:** SP-J-Werte aus `faelle`-Writes entfernen, auf `claims` schreiben (über `splitOrKeepFaelleUpdate` für Helper-Consumer, sonst direkt `from('claims').update(...).eq('id', claimId)`); non-SP-J-Spalten bleiben auf faelle; `{ error }`-geguarded; **kein Dual-Write**.

## 4 · Migrations-Vorgehen
DDL nur via supabase-CLI (AGENTS.md Regel 2): `db query --linked --file` + `migration repair --status applied`, **kein** `db push`. `BEGIN/COMMIT`, Dry-Run mit `ROLLBACK`. PR1 additiv (jederzeit applizierbar). PR2 nach PR1-staging-Merge (braucht regen. Types). PR3 nach PR2-main-Release.

## 5 · 3-PR-Struktur
- **PR1** — Migration: 12 `ADD COLUMN` auf claims (Typen/Defaults/FK live gemessen) + UPDATE-Backfill (`FROM faelle f WHERE f.claim_id=c.id`) + 3 View-Repoints. Types-Regen. Verify `count=12`.
- **PR2** — Code-Sweep: Inventur + Reader/Writer-Transform + die 12 in `CLAIM_OWNED_DUPLICATE_COLUMNS`. tsc + Build grün. Re-Grep 0.
- **PR3** — idempotenter COALESCE-Catch-up (`UPDATE claims c SET col=COALESCE(c.col, f.col) FROM faelle f WHERE c.id=f.claim_id`).

## 6 · Error-Handling
Server-Actions bleiben Result-Object (`{ ok }`/`{ success }`); `state-machine`/`process-event` throwen (low-level, unverändert). `claims`-Writes immer `{ error }`-destructuren (SP-B-Lehre: stille Fehler erzeugen faelle↔claims-Diskrepanz). Bei Backfill keine Row-Creation (claims existiert 1:1 schon).

## 7 · Testing
- **vitest** (`src/lib/faelle/claim-duplicate-columns.test.ts`, bestehend aus SP-H): Der Disjunktheits-Test (`AUFTRAEGE_OWNED_COLUMNS ∩ CLAIM_OWNED_DUPLICATE_COLUMNS = ∅`) fängt automatisch, falls eine SP-J-Spalte versehentlich in beiden Sets landet. Ergänzen: ein Case, der bestätigt, dass `splitOrKeepFaelleUpdate` die 12 nach `claimsUpdate` routet (mit claim_id) bzw. bei null-claim_id auf faelle bleibt.
- **5-Portal-Smoke** nach PR2 (`scripts/smoke-cmm44-spj.mjs`): Fokus Admin-Finance/Abrechnung-Views + SV-Abrechnung + Fallakte. Screenshots im selben Turn auswerten. HARD = 5xx/pageerror/`undefined`-im-Display.

## 8 · Risiken & Non-Goals
- **Finance-Domain in Flux:** Es existieren Branches (billing/finance-hub/stripe-drift) — vor PR2 Drift-Recheck (`information_schema` live), und Reader-Sweep auf aktuellen `origin/staging`-Stand. Kollision mit aktiven Sessions geprüft: SP-C1 + matelso berühren Finance NICHT.
- **`abrechnungen`-Tabelle bleibt unangetastet** (kein claim_id-Umbau) — Non-Goal. Die 2 FK-Pointer wandern als Link-Spalten auf claims, die Rechnungstabelle selbst ändert sich nicht.
- **Kein Dropping** — auch die 0-Daten-Spalten ziehen additiv um (sterben mit faelle in Phase 6). Dead-Drop wäre ein separater Cleanup nach Phase 6.
- **Lead-Preis-/Bankdaten-/Kanzlei-Provisions-Spalten** aus dem Abrechnung-Cluster sind **NICHT** SP-J (→ claims-TBD bzw. SP-I/SP-C) — Scope strikt die 12.

## 9 · Definition of Done
- [ ] 12 Spalten live auf `claims` (Typen/FK gespiegelt), Backfill verifiziert.
- [ ] 3 Views sourcen die 12 aus `claims`.
- [ ] 12 in `CLAIM_OWNED_DUPLICATE_COLUMNS`; vitest grün (inkl. neuem Routing-Case + Disjunktheit).
- [ ] Re-Grep 0 live `from('faelle')`-Zugriffe der 12; `npm run build` grün.
- [ ] PR3 Catch-up appliziert + repaired.
- [ ] 5-Portal-Smoke 0 SP-J-Regression (Screenshots ausgewertet).
- [ ] Phase-1-Mapping + Handoff + Memory nachgezogen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
