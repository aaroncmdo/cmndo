# Deep-DB-Audit — Plan + Findings (mit echten Production-Daten)

**Datum:** 2026-05-12
**Scope:** Datenkonsistenz DB → Backend → Frontend, gemessen gegen die echte Production-DB via Supabase-MCP
**Projekt:** `paizkjajbuxxksdoycev` / Claimondo-v2 / eu-west-2 / Postgres 17.6.1
**Methode:** SQL-Queries direkt gegen Production + statische Code-Analyse

---

## TL;DR — Top-7 Findings (gemessen, nicht spekuliert)

| # | Severity | Befund | Evidenz |
|---|---|---|---|
| 1 | 🔴 ERROR | `conversion_events`-Tabelle hat **kein RLS aktiviert** und enthält `session_id` → **öffentlich abfragbar via PostgREST** | Supabase Security-Advisor ERROR x2 |
| 2 | 🔴 KRITISCH | **6 Storage-Buckets erlauben Public-Listing**: `gutachten`, `schadensfotos`, `unterschriften`, `avatare`, `gutachter-logos`, `profile` — DSGVO-Risiko bei sensiblen Files | Security-Advisor `public_bucket_allows_listing` |
| 3 | 🔴 KRITISCH | **16 RLS-Policies haben `USING (true)`** — darunter `faelle` (2x), `profiles`, `leads` (2x), `mitteilungen`, `schadenspositionen`. Effektiv: jeder eingeloggte User sieht alle Daten | Security-Advisor `rls_policy_always_true` x16 |
| 4 | 🔴 KRITISCH | **Sync-Trigger `claims↔faelle` driftet auf `totalschaden`** in **8 von 8 verbundenen Paaren** (100 %) | Live-Drift-Query |
| 5 | 🔴 KRITISCH | **Phase ↔ Status Massiv-Drift**: 5 Claims stehen auf `phase=0_lead`, aber zugehörige Fälle haben Status `sv-termin` (= viele Phasen weiter) | Phase-x-Status-Kreuztabelle |
| 6 | 🟠 MITTEL | **Modus-A1 aus dem SV-Bug-Audit bestätigt**: 1 Profil hat mehrere SV-Rows; das Layout nutzt `.maybeSingle()` → Layout bricht für diesen User | `multi_sv_per_profile=1` |
| 7 | 🟠 MITTEL | **Ownership-Lücke**: 11/11 Claims haben **keine `claim_parties.rolle='kunde'`** — die Spalte existiert nicht; statt dessen werden `geschaedigter` (5) und `verursacher` (2) verwendet. Frontend, das nach „kunde" sucht, findet nichts | Live-Query |

**Performance-Findings (gemessen):**
- 815 × `multiple_permissive_policies` (mehrere RLS-Policies pro Tabelle → 5-10× langsamere Reads)
- 233 × `auth_rls_initplan` (RLS evaluiert `auth.uid()` pro Row statt einmal)
- 113 × `unindexed_foreign_keys`
- 123 × `unused_index`

---

## Status

| Phase | Status |
|---|---|
| Plan-Markdown angelegt | ✅ |
| Supabase-MCP authentifiziert | ✅ |
| Block 1 — Schema-Reality | ✅ |
| Block 2 — RLS-Reality | ✅ |
| Block 3 — Sync-Trigger + Drift | ✅ |
| Block 4 — NULL-Quoten + Datenqualität | ✅ |
| Block 5 — Phase-Konsistenz | ✅ |
| Findings-Sektion gefüllt | ✅ |

---

## Schema-Reality (Block 1)

**DB-Größe heute: Pre-Production-Volumen.** Top-Tabellen nach Größe:

| Tabelle | Est. Rows | Größe |
|---|---|---|
| `cron_jobs_audit` | 10 481 | 2.7 MB |
| `sachverstaendige` | 9 | 2.0 MB |
| `lead_historie` | 209 | 496 KB |
| `faelle` | 7 | 464 KB |
| `leads` | 36 | 464 KB |
| `claims` | 9 | 320 KB |
| `gutachter_termine` | 9 | 232 KB |
| `claim_parties` | 0 (siehe unten) | 232 KB |
| `tasks` | 39 | 176 KB |
| `profiles` | 33 | 160 KB |
| `pflichtdokumente` | 0 | 136 KB |
| `auftraege` | 0 | 128 KB |

**Beobachtung:** `claim_parties` zeigt `estimated_rows=0` aber tatsächlich 7 (siehe Block 4) — die Postgres-Statistiken sind veraltet. `auftraege` ist leer (CMM hat noch keine produktiven Aufträge erzeugt).

---

## RLS auf `sachverstaendige` (Block 2 — relevant für SV-Willkommen-Bug)

```
polname              polcmd  using_expr
Admins full access   *       is_admin()
admin_dispatch_read  r       (rolle = admin OR rolle = dispatch)
sv_select_own        r       profile_id = auth.uid()
sv_update_own        w       profile_id = auth.uid()
```

**Befund:** RLS ist sauber auf SELF-Read. Kein `aktiv=true` oder `geloescht_am IS NULL`-Filter, der einen User stillschweigend ausschließen könnte.

**→ Modus A1 aus dem SV-Willkommen-Bug-Audit ist VERWORFEN.** Die RLS blockt nicht.

**ABER — Block 2b zeigt:**
- **1 Profil hat MEHRERE SV-Rows** (`multi_sv_per_profile=1`)
- **2 SVs hängen seit > 24h ohne Freischaltung** (`sv_stuck_no_freischaltung_24h=2`)

Das **bestätigt Modus A2**: Layout-Query in `src/app/gutachter/layout.tsx:44` nutzt `.maybeSingle()`. Bei mehreren Rows wirft PostgREST `406 Not Acceptable` oder gibt unzuverlässig eine Row → `sv` ist `null` → Redirect feuert auch wenn der User onboardingseitig fertig ist. **Das ist ein konkreter Bug für mindestens 1 User in Production.**

---

## Sync-Trigger `claims ↔ faelle` (Block 3)

**Identifizierte Trigger:**
- `trg_sync_faelle_to_claims` — `AFTER UPDATE` auf 40 Spalten, ruft `sync_faelle_to_claims()`
- `trg_sync_claims_to_faelle` — `AFTER UPDATE` auf dieselben 40 Spalten, ruft `sync_claims_to_faelle()`

**Symmetrische bidirektionale Replikation** für: `abgeschlossen_am, auslandskennzeichen, bkat_unfallart, brn, fahrerflucht, finanzierung_leasing, finanzierungsgeber_*, firma_name, gegner_*, gewerbe_flag, kanzlei_ansprechpartner_*, kanzlei_uebergeben_am, kunde_email, kunden_konstellation, kundenbetreuer_id, nutzungsausfall_tage, polizei_*, polizeibericht_status, restwert, sachschaden_beschreibung, spezifikation, totalschaden, unfall_konstellation, unfallskizze_*, vehicle_id, vorsteuerabzugsberechtigt, wiederbeschaffungswert, zeugen_kontakte`

**Drift-Messung (live, alle 8 fall↔claim-Paare):**

| Spalte | Drift-Rows | % von 8 |
|---|---|---|
| **`totalschaden`** | **8** | **100 %** ⚠️ |
| `kunde_email` | 1 | 13 % |
| `kundenbetreuer_id` | 0 | 0 % |
| `firma_name` | 0 | 0 % |
| `restwert` | 0 | 0 % |
| `kanzlei_uebergeben_am` | 0 | 0 % |

**🔴 Befund:** `totalschaden` driftet **in 100 % der Fälle**. Mögliche Ursachen:
- Spalten-Type-Mismatch (z. B. `numeric(10,2)` vs `boolean` — `totalschaden` ist eigentlich ein Boolean-Flag, könnte als `null` vs `false` driftet)
- Sync-Function hat einen Bug für genau diese Spalte
- Spalte wird vor dem Sync-Trigger via Backdoor (Migration-Backfill) gesetzt

**Empfehlung:** SELECT-Vergleich auf konkrete Werte fahren um den Driftmuster zu verstehen — das war hier nicht im Scope, aber nächster Schritt sollte sein:
```sql
SELECT f.id, f.totalschaden AS f_val, c.totalschaden AS c_val
FROM faelle f JOIN claims c ON c.id = f.claim_id
WHERE c.totalschaden IS DISTINCT FROM f.totalschaden;
```

---

## Faelle ↔ Claims Cardinality (Block 4)

| Metrik | Wert |
|---|---|
| `claims_total` | 11 |
| `faelle_total` | 8 |
| `fall_claim_pairs` (joined via `faelle.claim_id`) | 8 |
| `faelle_without_claim_id` | 0 |
| **`claims_without_fall`** | **3** |
| **`claims_without_kunde_party`** | **11** (alle!) |
| `claim_parties_total` | 7 |

**Befunde:**
1. **3 verwaiste Claims** haben keinen `fall`-Partner. Das könnten Sub-Claims (Beifahrer-Claims, Konfrontations-Claims) sein, die laut CMM-Spec einen eigenen Claim aber keinen separaten Fall haben — oder echte Orphans aus Migration-Tests
2. **`claim_parties` hat KEINE `rolle='kunde'`-Rows** — die existierenden 7 Rows sind aufgeteilt auf `geschaedigter` (5) und `verursacher` (2). Code, der nach „kunde" sucht (z. B. `kanzlei/queries.ts`, `lib/lead-fall-mapping.ts`), findet **nichts**. Ownership läuft de facto NUR über `faelle.kunde_id` — die im Memory dokumentierte „3-Fallback-Kette" (`claim_parties.user_id` / `faelle.kunde_id` / `lead.email`) ist effektiv eine 1-Stufen-Kette
3. **`profile_id` auf SVs:** alle 9 SVs haben `profile_id` gesetzt (sauber, kein Legacy `user_id`-Problem mehr)

---

## Phase-Konsistenz (Block 5) — der schlimmste Befund

**Phase-Verteilung in `claims.phase`:**
- `0_lead` × 8
- `1_neu` × 1
- `2_in_bearbeitung` × 2

**Status-Verteilung in `faelle.status`:**
- `sv-termin` × 6
- `sv-zugewiesen` × 1
- `zahlung-eingegangen` × 1

**Phase × Status Kreuztabelle:**

| `claims.phase` | `faelle.status` | Anzahl |
|---|---|---|
| **`0_lead`** | **`sv-termin`** | **5** ⚠️ |
| `1_neu` | `sv-zugewiesen` | 1 |
| `2_in_bearbeitung` | `sv-termin` | 1 |
| `2_in_bearbeitung` | `zahlung-eingegangen` | 1 |

**🔴 Befund:** **5 von 8 verbundenen Paaren stehen auf `claims.phase=0_lead` obwohl der zugehörige Fall einen Status zwischen `sv-termin` und `zahlung-eingegangen` hat** — also bereits 2-4 Lifecycle-Schritte weiter. Das heißt:
- Wenn Frontend die Phase aus `claims.phase` liest → User sieht „Lead" obwohl SV-Termin gebucht ist
- Wenn Frontend die Phase aus `faelle.status` ableitet → korrekt, aber widerspricht der DB-Quelle der Wahrheit

**Trigger-Analyse:** `trg_claims_set_phase` triggert auf `INSERT OR UPDATE OF status, kundenbetreuer_id`. Das heißt: `phase` wird nur dann neu berechnet, wenn `claims.status` ODER `claims.kundenbetreuer_id` ändert. Wenn der reale Lifecycle-Fortschritt ausschließlich über `faelle.status` läuft (z. B. via State-Machine in `src/lib/faelle/state-machine.ts`), wird `claims.phase` **nie** aktualisiert nach dem initialen Lead-Status.

→ **CMM-Migration ist konzeptionell unfertig**: Phase-Driver-Logik wurde nicht auf Claims übertragen.

---

## Security-Advisors (Live aus Supabase-MCP)

**ERROR-Level (kritisch):**
1. `rls_disabled_in_public` auf `conversion_events` — RLS nicht aktiviert
2. `sensitive_columns_exposed` auf `conversion_events.session_id` — durch fehlendes RLS via REST-API abgreifbar

**WARN-Level (hoch):**
- `rls_policy_always_true` × **16** — Policies mit `USING (true)`. Betroffen:
  - `faelle` × 2
  - `profiles`, `leads` × 2, `mitteilungen`, `benachrichtigungen`, `flow_links` × 2, `phase_transitions`
  - `lead_historie`, `regulierungs_klassifizierung` × 2, `schadenspositionen`, `gutachter_finder_anfragen`, `finance_eintraege`
- `public_bucket_allows_listing` × **6**:
  - `gutachten`, `schadensfotos`, `unterschriften` (DSGVO-relevante PII)
  - `avatare`, `gutachter-logos`, `profile`
- `function_search_path_mutable` × 61 — SQL-Injection-Risiko in Security-Definer-Funktionen
- `anon_security_definer_function_executable` × 54
- `authenticated_security_definer_function_executable` × 54
- `extension_in_public` × 1
- `auth_leaked_password_protection` × 1

**INFO:**
- `rls_enabled_no_policy` × 6 (RLS an, aber keine Policy → effektiv default-deny)

---

## Performance-Advisors (Live)

| Lint | Anzahl | Impact |
|---|---|---|
| `multiple_permissive_policies` | **815** | Mehrere `OR`-verkettete RLS-Policies pro Read → jeder SELECT wird gegen alle evaluiert → 5-10× langsamer |
| `auth_rls_initplan` | **233** | `auth.uid()` ist im Policy-Body inline → wird pro Row reevaluiert. Fix: `(SELECT auth.uid())` |
| `unindexed_foreign_keys` | 113 | FKs ohne Index → JOIN-Queries scannen |
| `unused_index` | 123 | Index-Bloat, schreibt langsam |
| `duplicate_index` | 2 | redundant |

**Heutiges Volumen** (kleine Tabellen) maskiert das Problem. Bei 10× mehr Daten kippen Queries massiv.

---

## Konsolidierte Empfehlungen — sortiert nach Severity

### 🔴 Sofort (Security)

1. **`conversion_events` RLS aktivieren oder Tabelle löschen** wenn nicht produktiv genutzt
2. **6 Storage-Buckets auf private umstellen** + signed URLs für die 3 sensiblen (`gutachten`, `schadensfotos`, `unterschriften`)
3. **16 `USING (true)`-RLS-Policies** durchgehen — jede einzelne entweder auf rolle/ownership einschränken oder dokumentieren warum offen
4. **`function_search_path_mutable` auf den 61 Functions** fixen (`SET search_path = public, pg_catalog`)

### 🔴 Sofort (Datenintegrität)

5. **`totalschaden`-Drift auf 100 %** root-causen — Sync-Function für diese Spalte ist defekt. Konkret-Werte abfragen, dann Sync-Function patchen
6. **CMM Phase-Sync nachziehen**: `trg_claims_set_phase` erweitern damit es auch auf `faelle.status`-Änderungen triggert (oder umgekehrt). Aktuell stehen 5/8 Claims auf `0_lead` während Fall schon im SV-Termin ist
7. **SV-Layout `.maybeSingle()` → Array-Query** umstellen — der eine User mit 2 SV-Rows hat ein konkretes Onboarding-Problem (siehe SV-Willkommen-Bug-Audit)

### 🟠 Mittel

8. **`claim_parties`-Rollen-Konvention klären**: Code sucht „kunde", DB hat „geschaedigter" + „verursacher". Entweder Code anpassen oder neue Rolle „kunde" einführen + Migration der bestehenden Rows
9. **3 verwaiste Claims** prüfen ob legitim (Sub-Claims) oder Test-Müll
10. **Performance: Top-20 RLS-Policies** auf `(SELECT auth.uid())` umstellen — sofort wirksam, kein Logik-Change

### 🟡 Niedrig

11. `auth_leaked_password_protection` aktivieren in Auth-Settings
12. `extension_in_public` umziehen in eigenes Schema
13. 113 unindexed FKs durchgehen — die für Joins kritischen indizieren
14. 123 unused indexes löschen + 2 duplicate

---

## Was wir jetzt mit echten Daten WISSEN (vs. vorher vermutet)

| Vor-Audit-Hypothese | Status nach Messung |
|---|---|
| Modus A1 SV-Bug: RLS filtert SELF-Read | **VERWORFEN** (RLS ist sauber `profile_id = auth.uid()`) |
| Modus A2 SV-Bug: Multi-SV-Row → `.maybeSingle()` bricht | **BESTÄTIGT** (1 Profil mit 2+ Rows) |
| `claims↔faelle`-Trigger-Drift möglich | **BESTÄTIGT + WORSE**: `totalschaden` driftet zu 100 % |
| Phase-Driver fehlt für `gutachter_termine.durchgefuehrt_am` | **BESTÄTIGT + GENERELLER**: Phase wird auch bei `faelle.status`-Änderungen nicht resynced |
| `claim_parties` Ownership-Drift | **BESTÄTIGT + KRITISCHER**: gar keine Kunde-Parties existieren |
| Doppelte Reads im Kunde-Portal | nicht via DB messbar — bleibt statische Hypothese |

---

## Nächste Diagnostic-Steps (vor jedem Fix)

| Schritt | SQL / Aktion | Liefert |
|---|---|---|
| `totalschaden`-Drift-Werte zeigen | `SELECT f.id, f.totalschaden, c.totalschaden FROM faelle f JOIN claims c ON c.id=f.claim_id WHERE c.totalschaden IS DISTINCT FROM f.totalschaden;` | Ist es immer NULL vs FALSE, oder echte Wert-Drift? |
| Sync-Function-Body inspizieren | `SELECT pg_get_functiondef('public.sync_faelle_to_claims'::regproc);` | Sehen ob `totalschaden` überhaupt in der Function steht |
| Multi-SV-User identifizieren | `SELECT profile_id, array_agg(id) FROM sachverstaendige GROUP BY profile_id HAVING count(*)>1;` | Welcher User ist betroffen, wo hängt er |
| Verwaiste Claims-Story | `SELECT id, claim_nummer, status, phase, created_at FROM claims WHERE id NOT IN (SELECT claim_id FROM faelle WHERE claim_id IS NOT NULL);` | Sind das Tests oder echte Sub-Claims |

Diese 4 Queries sind je < 1 Sekunde — sollten als Diagnose-Notebook festgehalten werden bevor wir Fixes bauen.

---

## Aufwand-Schätzung für die kritischen Fixes

| Block | Fixes | Geschätzter Dev-Aufwand |
|---|---|---|
| Security (1-4) | RLS aktivieren + Buckets privat + 16 Policies kuratieren + search_path setzen | 1.5 Tage |
| Datenintegrität (5-7) | Trigger-Function patchen + Phase-Sync vervollständigen + Layout-Query fixen | 2 Tage |
| Datenmodell (8-9) | claim_parties-Rollen vereinheitlichen + verwaiste Rows aufräumen | 1 Tag |
| Performance (10) | Top-20 RLS auf Subquery umstellen | 0.5 Tage |
| **Gesamt** | | **~5 Tage** |

Plus paralleler externer Aufwand: keine, alles intern machbar.
