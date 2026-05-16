# Claim-SSoT — RLS-Audit

**Datum:** 2026-05-16
**Zweck:** RLS-Bestandsaufnahme für die `faelle`→`claims`-Vollmigration. Teil-Audit von `claim-ssot-vollmigration-audit-strategie.md` (§3.1d).
**Methodik:** Statische Analyse der Migration-Files (`supabase/migrations/` + `supabase/_archive/migrations-pre-tracking/`) — DB war beim Audit nicht erreichbar (Supabase-522). **Live-Verifikation gegen `pg_policies`/`pg_proc` steht noch aus.**

---

## 1 · Policy-Stand der beteiligten Tabellen (kompakt)

| Tabelle | Staff/Admin-Policy | Kunde/SV/Kanzlei-SELECT | anon? | referenziert `faelle`? |
|---|---|---|---|---|
| `faelle` | `faelle_staff_all_consolidated` (ALL, `authenticated`) | `…kunde_sv_kanzlei_select_consolidated` + `faelle_makler_read` | nein (anon-Policies gedroppt #888) | eigene Spalten |
| `claims` | `claims_staff_all_consolidated` (ALL, `authenticated`) | `…kunde_sv_dispatch_select_consolidated` | nein | **ja — via `is_sv_for_claim()`** |
| `claim_parties` | `cp_staff_all` (ALL, `authenticated`) | `cp_select_consolidated` + `cp_sv_assigned_insert` | nein | **ja — `is_sv_for_claim()` + direkter JOIN** |
| `gutachten` | `gutachten_all_consolidated` (ALL, **`public`**) | + `gutachten_buero_admin_select` | nein | nein |
| `auftraege` | `auftraege_admin_all` (ALL, **`public`**) | `auftraege_select_consolidated` | nein | **ja — Kunde-Branch** |
| `kanzlei_faelle` | `kanzlei_faelle_admin_all` (ALL, **`public`**) | `kanzlei_faelle_select_consolidated` | nein | **ja — Kunde+SV-Branch** |
| `gutachter_termine` | `…admin_sv_all_consolidated` + `staff_fall_scoped` | `…kunde_select_consolidated` + `Kanzlei liest…` | nein | **ja — 4 Policies** |
| `vehicles` | `vehicles_staff_all` (ALL, `public`) | `vehicles_kunde_own_select` + `vehicles_sv_assigned_select` | nein | **ja — SV-JOIN** |

---

## 2 · SECURITY-DEFINER-Helper (in RLS-Policies konsumiert)

11 Helper, alle nach `aar921` (`20260515110633`) mit `GRANT EXECUTE TO authenticated + service_role` idempotent abgesichert. CI-Drift-Bremse: `scripts/check-rls-function-grants.mjs`.

| Funktion | liest | ref. `faelle` | Sprengweite |
|---|---|---|---|
| `is_admin/is_staff/is_dispatcher/is_kundenbetreuer/is_sv/is_kanzlei` | `profiles` | nein | breit, aber faelle-frei |
| `get_sv_id()` | `sachverstaendige` | nein | — |
| `is_claim_user_party(uuid)` | `claim_parties` | nein | claims + claim_parties SELECT |
| **`is_sv_for_claim(uuid)`** | **`faelle` JOIN `sachverstaendige`** | **JA** | claims-SELECT + cp-SELECT |
| **`can_access_fall(uuid)`** | **`faelle` JOIN `profiles`** | **JA** | **19 Policies** |
| `dispatcher_owns_lead(uuid)` | `leads` | nein | claims-SELECT |

> Incident-Klasse AAR-894 (14.05.): `is_claim_user_party`, `is_sv_for_claim`, `get_sv_id` verloren ihre Grants durch `CREATE OR REPLACE` → SV-Plan leer, Cron-Reminder silent. Bei jedem Helper-Refactor: Grants prüfen ([[feedback_rls_function_grants]]).

---

## 3 · Kern-Problem: `claims` hat kein `sv_id` / `kunde_id`

Die meisten Sub-Tabellen-Policies hängen an **zwei `faelle`-Spalten**: `faelle.sv_id` (SV-Zuordnung) und `faelle.kunde_id` (Kunde-Zuordnung). `claims` hat **keine davon nativ**:
- Kunde → über `claim_parties.user_id` / `claims.geschaedigter_user_id`
- **SV → gar nicht auf Claim-Ebene.** Nur `faelle.sv_id`, sowie `gutachten.sv_id` + `auftraege.sv_id` als Sub-Tabellen-Felder.

**→ Vor dem `faelle`-Drop muss ein claim-natives SV-Mapping existieren** (Kandidat: `auftraege.sv_id` als kanonische SV-Quelle, oder eine `claims.sv_id`-Spalte). Ohne das lassen sich `is_sv_for_claim`, `cp_sv_assigned_insert`, `vehicles_sv_assigned_select`, `apply_gutachten_ocr` nicht migrieren.

---

## 4 · Bruchstellen bei `faelle`-Drop

### Helper (1 Fix → viele Policies)
1. **`can_access_fall(uuid)`** — JOIN auf `faelle`; speist **19 Policies** (`fall_dokumente`, `pflichtdokumente`, `nachrichten`, `timeline`, `tasks`, `qc_checkliste`, `zahlungs*`, `forderungspositionen`, `gutachter_termine` u.a.). Umstellen auf `claims.kundenbetreuer_id`; ggf. Signatur `p_fall_id`→`p_claim_id` (berührt alle 19 Caller).
2. **`is_sv_for_claim(uuid)`** — JOIN auf `faelle.sv_id`; speist `claims`-SELECT + `cp`-SELECT. Braucht claim-natives SV-Mapping (§3).

### Policies mit direktem `faelle`-JOIN
3. `claim_parties.cp_sv_assigned_insert` — `faelle`-JOIN für SV-Insert von Zeugen.
4. `auftraege.auftraege_select_consolidated` — Kunde-Branch joint `faelle`. `auftraege` hat `claim_id` → auf `claims`/`claim_parties` umstellen.
5. `kanzlei_faelle.kanzlei_faelle_select_consolidated` — Kunde+SV-Branch joinen `faelle`. `kanzlei_faelle` hat `claim_id` → umstellen.
6. `gutachter_termine` — **4 Policies** joinen `faelle` (`…kunde_select`, `staff_fall_scoped`, `Kanzlei liest…`). **`gutachter_termine` hat KEIN `claim_id`** → struktureller Blocker.
7. `vehicles.vehicles_sv_assigned_select` + `vehicle_ownership_history.voh_sv_assigned_select` — `faelle.vehicle_id`-JOIN. `claims` HAT `vehicle_id` → umstellen.

### Views/RPCs (kein RLS, brechen mit)
- `v_claim_full` — `LEFT JOIN faelle` für `fall_id/fall_nummer/sv_id/service_typ`.
- `apply_gutachten_ocr()` — `SELECT f.sv_id FROM faelle WHERE claim_id=…` (SV-Quelle für `gutachten.sv_id`).

---

## 5 · Risiken / Asymmetrien (eigenständige Findings)

| # | Befund | Schweregrad |
|---|---|---|
| R1 | **`gutachter_termine` hat kein `claim_id`** — einzige Sub-Tabelle ohne claim-FK. Struktureller Blocker für den `faelle`-Drop. Braucht FK + Backfill + Sync (analog `auftraege`/`kanzlei_faelle`). | **HOCH** |
| R2 | `auftraege`/`kanzlei_faelle`/`gutachten`/`vehicles`/`gutachter_termine` Staff-Policies sind noch `TO public` — die Defense-in-Depth-Migration #1322 (`…_to_authenticated`) hat nur `claims`/`faelle`/`claim_parties` gezogen. Bei Helper-Grant-Drift brechen anon-Reads silent (42501). | MITTEL |
| R3 | **`gutachten` hat keine Kunde-Lese-Policy.** Wenn `gutachten` zur Single-Source der Gutachten-Werte wird (Cluster F+G), hat das Kunde-Portal keinen direkten RLS-Pfad auf seine eigenen Gutachten-Daten. Lücke wird mit dem `faelle`-Drop akut. | MITTEL |
| R4 | `claim_parties.cp_select_consolidated` gibt jeder aktiven Party Lesezugriff auf **alle** Parties desselben Claims — inkl. `geburtsdatum`, `fuehrerscheinnummer`, `versicherungsnummer` der Gegenseite. Die spaltenlimitierte Sicht (`v_claim_for_gast`) wird nicht erzwungen. **DSGVO-Über-Exposition.** | **HOCH** |
| R5 | `claims_staff_all_consolidated` hat keinen `WITH CHECK`-Spaltenschutz — KB kann beliebige `created_by_user_id` setzen, nur durch Trigger `guard_claims_created_by` (`aar919`) entschärft (Pflaster, keine Policy-Härtung). | MITTEL |

---

## 6 · Nächste Schritte (RLS-Teil der Migration)

1. **`gutachter_termine.claim_id`** anlegen (FK + Backfill + Sync) — Voraussetzung, bevor irgendeine `gutachter_termine`-Policy migriert werden kann.
2. **Claim-natives SV-Mapping** festlegen (`auftraege.sv_id` kanonisch, oder `claims.sv_id`) — Voraussetzung für `is_sv_for_claim` etc.
3. `can_access_fall` + `is_sv_for_claim` auf `claims` umschreiben (größter Hebel — 1 Fix wirkt auf 19 bzw. 2 Policies).
4. Die 7 `faelle`-JOIN-Policies einzeln auf `claim_id` umstellen.
5. `auftraege`/`kanzlei_faelle`/`gutachten`/`vehicles`/`gutachter_termine`-Staff-Policies auf `TO authenticated` ziehen (R2).
6. `gutachten` Kunde-Lese-Policy ergänzen (R3).
7. `v_claim_full` + `apply_gutachten_ocr` von `faelle` lösen.
8. **Nach jeder Policy-Änderung:** Helper-Grants prüfen, `scripts/check-rls-function-grants.mjs` laufen lassen, RLS-Smoke pro Rolle.

> **Live-Spot-Check 16.05.2026** bestätigt die strukturellen Kern-Befunde: `gutachter_termine.claim_id` existiert nicht (0), `claims.sv_id` existiert nicht (0), `claims` 2 Policies / `faelle` 3 Policies, `can_access_fall` + `is_sv_for_claim` existieren. Eine vollständige Policy-für-Policy-`pg_policies`-Verifikation (USING-Klauseln) steht für die Umsetzungsphase noch aus.

---

## 7 · Quellen

Migration-File-Analyse 16.05.2026. Kontext: `docs/12.05.2026/rls-permissions-audit.md`, `docs/15.05.2026/abrechnungen-rls-audit.md`, Incident AAR-894/AAR-921. Ergänzt `claim-ssot-vollmigration-audit-strategie.md`.
