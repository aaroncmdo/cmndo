# AAR-914 — Finanztabellen RLS-Audit

**Datum:** 15.05.2026
**Branch:** `kitta/aar914-abrechnungen-rls`
**Scope:** Defense-in-Depth-Härtung von **20 Finanztabellen** gegen `anon`-Zugriff. Folge zum 14.05.-RLS-Sprint (AAR-851 hat 14 Tabellen revoked, davon nur `claim_payments` aus dem Finanz-Cluster).

## Befund-Zusammenfassung

| Aspekt | Status | Risiko |
|---|---|---|
| Alle 20 Tabellen haben RLS=ON | ✅ | — |
| RLS-Policies blocken `anon` funktional (`auth.uid()` NULL) | ✅ | — |
| Table-GRANTs für `anon`: 19 von 20 haben **FULL** privs (SELECT/INSERT/UPDATE/DELETE) | ⚠ | Defense-in-Depth-Lücke |
| `claim_payments` hat bereits `REVOKE SELECT FROM anon` (AAR-851) | ✅ | partial |
| Code-Caller nutzen ausschließlich `createClient()` (authenticated) oder `createAdminClient()` (service_role) | ✅ | kein anon-Pfad würde brechen |
| `claim_payments.with_check` deckt nur Kundenbetreuer-INSERT/UPDATE, nicht Admin | ⚠ | latenter Bug (Admin schreibt via service_role) |
| `gutachter_monatsabrechnungen` + `gutachter_abrechnungspositionen` haben SV-`ALL`-Policy | ⚠ | mass-assignment — outsourced to AAR-913 |

## Die 20 Finanztabellen

| Tabelle | RLS | Policies | anon-Grants (vorher) | Code-Caller |
|---|---|---|---|---|
| `abrechnungen` | ON | 1 (SELECT consolidated) | FULL | createClient + createAdminClient |
| `abrechnung_positionen` | ON | 1 (staff_fall_scoped ALL) | FULL | createAdminClient |
| `abrechnung_reminders` | ON | 1 (admin_only ALL) | FULL | createAdminClient (Cron) |
| `claim_payments` | ON | 1 (kundenbetreuer ALL) | INSERT/UPDATE/DELETE (kein SELECT, AAR-851) | createAdminClient |
| `finance_eintraege` | ON | 1 (admin SELECT) | FULL | createAdminClient + createClient |
| `finance_monatsberichte` | ON | 1 (admin ALL) | FULL | createAdminClient (Cron) |
| `gutachter_abrechnungen` | ON | 2 (admin ALL + sv SELECT) | FULL | createAdminClient + createClient |
| `gutachter_abrechnungspositionen` | ON | 1 (SV+admin ALL) | FULL | createAdminClient |
| `gutachter_monatsabrechnungen` | ON | 1 (SV+admin ALL) | FULL | createAdminClient (Cron) + createClient |
| `incentive_auszahlungen` | ON | 2 (admin ALL + own SELECT) | FULL | createAdminClient |
| `incentives` | ON | 2 (admin ALL + staff SELECT) | FULL | createClient + createAdminClient |
| `kanzlei_abrechnungen` | ON | 2 (admin write + admin/dispatch read) | FULL | createAdminClient |
| `kanzlei_abrechnung_positionen` | ON | 2 (admin write + admin/dispatch read) | FULL | createAdminClient |
| `kanzlei_abrechnung_reminders` | ON | 1 (admin_only ALL) | FULL | createAdminClient (Cron) |
| `makler_provisionen` | ON | 2 (admin/kb ALL + makler SELECT) | FULL | createAdminClient + createClient |
| `provisionen_maik` | ON | 1 (admin/kb/dispatch ALL) | FULL | createAdminClient (Cron) |
| `rechnungs_konfiguration` | ON | 1 (service_only) | — (bereits revoked, AAR-709) | createAdminClient |
| `rechnungs_nr_counter` | ON | 1 (service_only) | — (bereits revoked, AAR-709) | createAdminClient |
| `sv_onboarding_rechnungen` | ON | 1 (service_only) | — (bereits revoked, AAR-709) | createAdminClient |
| `sv_payment_reminders` | ON | 1 (admin_only ALL) | FULL | createAdminClient (Cron) |

## SOLL-Matrix (nach Migration)

| Rolle | Sicht/Schreib |
|---|---|
| `anon` | **NICHTS** auf allen 20 Tabellen — table-grant revoked |
| `authenticated` (admin) | gemäß Policies (FULL bei admin, scoped bei makler/sv/kanzlei) |
| `service_role` | bypassed RLS (Crons, Background-Jobs) |

## Migration

Eine einzige Migration `20260514XXXXXX_aar914_revoke_anon_finanztabellen.sql` macht `REVOKE ALL FROM anon` auf alle 20 Tabellen idempotent.

## SQL-Proofs (post-migration, im PR-Body)

```sql
-- A: anon → 42501 auf abrechnungen
SET ROLE anon;
SELECT count(*) FROM abrechnungen;  -- erwartet: 42501 permission denied

-- B: anon → 42501 auf claim_payments (SELECT war schon vorher dicht)
SELECT count(*) FROM claim_payments;  -- 42501 (unverändert)

-- C: authenticated als Test-Admin → pass
SET SESSION AUTHORIZATION DEFAULT;  -- back to superuser for SET
SET ROLE authenticated;
SET request.jwt.claims = '{"sub": "<admin-uuid>", "role": "authenticated"}';
SELECT count(*) FROM abrechnungen;  -- > 0

-- D: authenticated als Test-Makler → 0 oder eigene Zeilen
SET request.jwt.claims = '{"sub": "<makler-uuid>", "role": "authenticated"}';
SELECT count(*) FROM abrechnungen WHERE empfaenger_typ='makler';  -- nur eigene
```

## Was NICHT in AAR-914 geht

- **`gutachter_monatsabrechnungen` + `gutachter_abrechnungspositionen` mass-assignment** — SV hat aktuell `ALL` auf eigenen Abrechnungen, kann theoretisch Beträge ändern oder löschen. Saubere Fix: SV-Policy auf `SELECT` runter, Admin-Policy bleibt `ALL`. **Outsourced zu AAR-913** (sammelt alle mass-assignment-Fixes).
- **`claim_payments.with_check`** Admin-INSERT-Lücke — latent, weil Admin nur via service_role schreibt. **Folge-Ticket** falls jemals ein nicht-service-role-Admin-Pfad gebaut wird.

## Recovery-Pfad

Migration via `supabase db push` beim staging-Merge (CI). Falls Drift: Recovery via `supabase db query --linked --file <sql>` + `migration repair --status applied <version>`.

## Post-Migration-Smoke

Memory `feedback_post_drop_smoke` — bei Schema-Drops volle Portal-Smoke. Hier KEIN Drop, nur GRANT-Revoke. Statt voller Smoke:

1. SQL-Proof A–D (oben)
2. Login admin → `/admin/finance` Tab lädt ohne 5xx
3. Login SV → `/gutachter/abrechnung` lädt ohne 5xx
4. Login Makler → `/makler/abrechnungen` lädt ohne 5xx (falls Makler-Portal aktiv ist)

## Memory-Update nach Merge

`project_live_rls_audit` aus dem HIGH-Backlog: „abrechnungen RLS — finanzkritische Daten, Policies nicht durch-auditiert" → **closed**. Mass-assignment-Sub-Punkt verbleibt zu AAR-913.
