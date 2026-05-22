# CMM-44 SP-J — Zahlungs-/Abrechnungs-Spalten (3-Wege-Split) · Design-Spec

**Datum:** 2026-05-22 · **Master:** CMM-44 (`faelle`-Drop) · **Ersetzt:** `2026-05-22-cmm44-spj-abrechnung-claims-design.md` (Erstentwurf „alle 12 → claims" — verworfen, siehe §0).

## 0 · Korrektur-Historie (wichtig)
Der Erstentwurf dieser Session schlug „alle 12 → claims" vor. Das **widersprach** einem früheren, von Aaron approveten SP-J-Audit (Commit `9ff8d09e`, 2026-05-20), das per Live-Messung den korrekten Architektur-Mismatch fand. Aaron-Entscheidung 2026-05-22: **auf den Audit-Split umbauen** + offene Buckets nachbrainstormen. Diese Spec ist das Ergebnis. **`abrechnungen` bleibt unangetastet** (Empfänger-Rechnung, kein claim_id) — Non-Goal.

## 1 · Scope: 12 `faelle`-Spalten, 3 Aktionen

| Bucket | Spalten | Aktion | Heimat |
|---|---|---|---|
| **A — Forderung/Zahlung (3)** | `zahlung_eingegangen_am`, `zahlungsweg`, `zahlung_betrag` | **Reader/Writer-Reroute (kein ADD, mit Rename)** | **`claim_payments`** (existiert, 1:N pro Claim) |
| **B — claims-ADD (8)** | `guthaben_verrechnet_netto`, `schlussabrechnung_am`, `auszahlung_gutachter_betrag`, `auszahlung_gutachter_eingegangen_am`, `auszahlung_zahlungsweg`, `sv_nachzahlung_netto`, `abrechnung_id`, `kanzlei_abrechnung_id` | **ADD auf claims (1:1, additiv)** | **`claims`** |
| **C — DROP-Marker (1)** | `zahlung_erwartet_am` | **NICHT migrieren** (0-cov, kein Pendant) → Phase-6-DROP | — |

Alle 12 sind `faelle`-only (kein DUP), Daten ~0 (pre-launch; nur `guthaben_verrechnet_netto` hat einen Default).

### Bucket-A-Mapping (faelle → claim_payments, alle Zielspalten existieren)
| `faelle` | `claim_payments` | Hinweis |
|---|---|---|
| `zahlung_eingegangen_am` | `zahlungseingang_am` | Rename |
| `zahlungsweg` | `zahlungsweg` | gleich |
| `zahlung_betrag` | `erhaltener_betrag` | semantisch „eingegangener Betrag" |

`claim_payments` (13 Spalten): `id, claim_id, status, forderungsbetrag, erhaltener_betrag, differenz_betrag, zahlungseingang_am, zahlungsweg, zahlungsreferenz, notiz, created_at, updated_at, created_by_user_id`. **1:N pro Claim** (`claim_id`, kein UNIQUE) — „aktuelle/letzte Zahlung" via `created_at DESC` (pre-launch 0 Rows → Writer legt bei Bedarf eine Payment-Row an).

## 2 · Architektur

Drei unabhängige Mechanismen, alle **rein additiv** auf `faelle`-Seite (faelle behält die 12 bis Phase 6):
- **Bucket A** = SP-C1-artiger Reroute auf eine **bestehende** Tabelle, ABER mit Rename (SP-G-artig) + 1:N-„aktuelle Row" (SP-H-artig). Kein `ADD` auf claim_payments. Komplexester Teil.
- **Bucket B** = SP-B-Klon: 8× `ADD COLUMN` auf claims (1:1) + Backfill + View-Repoint + ggf. `CLAIM_OWNED_DUPLICATE_COLUMNS`.
- **Bucket C** = nichts tun (Doku-Marker).

## 3 · Komponenten & Daten-Fluss

### 3a · Bucket A — claim_payments (1:N, Rename)
- **Reads:** `from('faelle').select('zahlung_betrag'…)` → aktuelle claim_payments-Row: `from('claim_payments').select('erhaltener_betrag, zahlungseingang_am, zahlungsweg').eq('claim_id', claimId).order('created_at', { ascending:false }).limit(1).maybeSingle()`. Property-Rename am Consumer (`zahlung_betrag`→`erhaltener_betrag`).
- **Writes (inkl. `state-machine.transitionFallStatus` bei `status='zahlung-eingegangen'`, setzt `zahlung_eingegangen_am`+`zahlung_betrag`):** SP-J-Werte aus dem faelle-Write entfernen; auf die aktuelle claim_payments-Row schreiben — **create-or-update**: existiert keine Payment-Row für den Claim → `insert({ claim_id, erhaltener_betrag, zahlungseingang_am, zahlungsweg, status, created_by_user_id })`, sonst `update` der aktuellsten. **NICHT** in `CLAIM_OWNED_DUPLICATE_COLUMNS` (das routet nach claims, falsch hier) — manueller Reroute an den Write-Sites.
- **Cardinality-Hinweis:** pre-launch 0 claim_payments-Rows; create-or-update ist die saubere Semantik. Bei N>1 künftig „aktuellste".

### 3b · Bucket B — claims-ADD (1:1, SP-B-Muster)
8× `ADD COLUMN` auf claims (Typen/Defaults/FK live in PR1 gemessen). `abrechnung_id`/`kanzlei_abrechnung_id` als `uuid REFERENCES abrechnungen(id)` (ON DELETE aus faelle-FK spiegeln). UPDATE-Backfill `FROM faelle f WHERE f.claim_id=c.id`. Reads → `claims:claim_id(<col>)`-Embed (1:1, Array-Normalisierung). Writes, die durch `splitOrKeepFaelleUpdate` laufen → die 8 in `CLAIM_OWNED_DUPLICATE_COLUMNS` (auto-Routing nach claims). Direkte Writes → `from('claims').update`.

### 3c · View-Repoint (live auditiert — 3 Views)
- `v_faelle_mit_aktuellem_termin` — exponiert alle betroffenen; Bucket-B-Spalten → `c.<col>`; Bucket-A-Spalten → aus claim_payments via LATERAL (aktuelle Row) ODER (pre-launch, 0-cov) als `NULL::<typ>`-Platzhalter mit Klärung im Audit. **PR1-View-Audit entscheidet pro Spalte** (SP-G/SP-D-Lesson: Precision-Casts Pflicht).
- `faelle_sv_view` (`auszahlung_gutachter_eingegangen_am` = Bucket B → `c.`), `faelle_kunde_view` (`auszahlung_zahlungsweg` = Bucket B → `c.`).

## 4 · Migrations-Vorgehen
DDL nur via supabase-CLI (`db query --linked` + `migration repair`, kein `db push`). Bucket A braucht **keine** Schema-Migration (claim_payments-Spalten existieren) — nur Code + ggf. View-Repoint. Bucket B = additive ADD-Migration. `zahlung_erwartet_am` (Bucket C) bleibt unangetastet.

## 5 · PR-Struktur
- **PR1 (Bucket B Migration):** 8× ADD auf claims + Backfill + 3 View-Repoints (Bucket-A-Spalten im View gemäß 3c). Types-Regen. Verify `count=8`.
- **PR2 (Code-Sweep, voller Sweep):** Bucket A (claim_payments-Reroute + Rename + create-or-update an Writern inkl. state-machine) + Bucket B (claims-Reads/Writes + 8 in `CLAIM_OWNED_DUPLICATE_COLUMNS`). `zahlung_erwartet_am`-Reader: auf NULL/Entfernung umstellen (Phase-6-DROP-Vorbereitung). vitest (Routing-Case Bucket B + Disjunktheit). tsc+Build. Re-Grep 0 für Bucket A+B (zahlung_erwartet_am dokumentierte Ausnahme bis Phase 6).
- **PR3 (Catch-up):** COALESCE-Catch-up Bucket B claims<-faelle. Bucket A (claim_payments) catch-up nur falls Daten (pre-launch 0 → no-op).

## 6 · Error-Handling
Result-Object in Actions; throw in state-machine/process-event. claim_payments- + claims-Writes `{ error }`-geguarded. Bucket-A-Writer: create-or-update fehlerrobust (kein 500 wenn keine Row).

## 7 · Testing
- **vitest** (`claim-duplicate-columns.test.ts`): Routing-Case für die 8 Bucket-B-Spalten (→ claimsUpdate); Disjunktheit zu AUFTRAEGE_OWNED_COLUMNS bleibt grün; **die 3 Bucket-A-Spalten dürfen NICHT in CLAIM_OWNED_DUPLICATE_COLUMNS sein** (sonst falsch auf claims geroutet) — als Assertion.
- **5-Portal-Smoke** (`smoke-cmm44-spj.mjs`): Admin-Finance/Abrechnung, SV-Abrechnung, Fallakte-Regulierung/Zahlung. Screenshots in-turn.

## 8 · Risiken & Non-Goals
- **Bucket A ist der heikle Teil** (Rename + 1:N create-or-update + state-machine-Writer). Genau spezifizieren im Plan; Smoke auf den Zahlungs-Flow.
- **Finance-Domain in Flux** (billing/finance-hub/stripe-Branches) → Drift-Recheck vor PR2.
- **Non-Goal:** `abrechnungen` umbauen; SV-Payout-Tabelle neu modellieren (auszahlung_* gehen pragmatisch auf claims, Verfeinerung später).
- **`zahlung_erwartet_am`:** bewusst nicht migriert; Phase-6-DROP. Falls ein Reader es nutzt → auf `null` / entfernen in PR2 (mit Kommentar).

## 9 · Definition of Done
- [ ] Bucket B: 8 Spalten live auf claims (Typen/FK gespiegelt), Backfill verifiziert; 3 Views repointed.
- [ ] Bucket A: 3 Reads/Writes auf claim_payments (Rename, create-or-update) umgestellt; state-machine zahlung-Write → claim_payments.
- [ ] 8 Bucket-B-Spalten in CLAIM_OWNED_DUPLICATE_COLUMNS; die 3 Bucket-A NICHT; vitest grün.
- [ ] Re-Grep 0 live faelle-Zugriffe der 11 (A+B); `zahlung_erwartet_am` dokumentierte Phase-6-Ausnahme; Build grün.
- [ ] PR3 Catch-up (Bucket B) appliziert.
- [ ] 5-Portal-Smoke 0 SP-J-Regression (Screenshots).
- [ ] Phase-1-Mapping (Verdikt-Korrektur) + Handoff + Memory nachgezogen.

🤖 Aaron Sprafke + Claude Opus 4.7 (1M context)
