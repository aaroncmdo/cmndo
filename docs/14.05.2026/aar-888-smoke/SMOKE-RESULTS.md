# AAR-888 — Post-Apply Smoke-Ergebnisse

Datum: 2026-05-14, Branch `kitta/aar-888-rls-anon-policies`, PR #1044.

Migration `20260514080823_aar-888-drop-wide-open-anon-policies` ist live in der Prod-DB (Recovery-Pfad via `supabase db query --linked --file` + `migration repair --status applied` wegen Drift bei `20260513183014`/`183406`, nicht durch diesen PR verursacht).

## SQL-Beweise — `profiles.Profil erstellen` (getighteted Policy)

Drei deterministische Postgres-Smokes via Supabase-MCP. Policy nach Migration: `FOR INSERT TO authenticated WITH CHECK (id = auth.uid())`.

| Test | Setup | Erwartung | Ergebnis |
| --- | --- | --- | --- |
| A | `SET LOCAL role = anon`, INSERT mit beliebiger id | RLS-Block (42501) | ✓ `ERROR: 42501: new row violates row-level security policy for table "profiles"` |
| B | `SET LOCAL role = authenticated`, JWT-claim `sub` = `99999999-…`, INSERT mit `id = 99999999-…` | Policy lässt durch, späterer Constraint-Fail | ✓ `ERROR: 23503: insert or update on table "profiles" violates foreign key constraint "profiles_id_fkey"` (RLS ist passiert, FK auf `auth.users(id)` blockt) |
| C | `SET LOCAL role = authenticated`, JWT-claim `sub` = `99999999-…`, INSERT mit `id = 11111111-…` (mismatch) | RLS-Block (42501) | ✓ `ERROR: 42501: new row violates row-level security policy for table "profiles"` |

→ Policy verhält sich genau wie spezifiziert. Authentifizierte User können nur ihr eigenes Profil erstellen, anon ist komplett blockiert.

## UI-Smokes — Token-Pfade

Skript: `scripts/smoke-aar-888.mjs` mit `headless: false` + `slowMo: 600ms`, Basic-Auth `aaroncmdo` für `staging.claimondo.de`.

### Smoke 1 — Login als `test-dispatch@claimondo.de`

- Screenshots: `10-login-page.png`, `11-login-filled.png`, `12-after-login.png`
- Ergebnis: ✓ Login erfolgreich, Redirect zu `/dispatch/dashboard`, kein 5xx. Dispatch Dashboard rendert mit 6 offenen Rückrufen, Rückrufe-Timeline + Leads-Liste sichtbar.

### Smoke 2 — Magic-Link `/flow/<token>` (Token aus DB)

- Token: `5b0fe6baf3ba716dba3596210f0c1d26` (Lead "Smoke Multi 1778705886472", erstellt 2026-05-13 21:10)
- Screenshots: `20-flow-token-landing.png`, `21-flow-token-scrolled.png`
- Ergebnis: ✓ Page lädt, Step-Indicator 1/4 sichtbar, Stammdaten (Vorname, Nachname, Telefon, E-Mail) vorgefüllt, Datenschutz-Checkbox + "Weiter"-Button bereit. Kein 5xx, keine Error-Texte.

→ Token-Auflösung läuft über service_role wie erwartet. DROP der anon-Policies hat keinen aktiven Code-Pfad gebrochen.

## Nicht autonom testbar

| Flow | Grund |
| --- | --- |
| Kunde-Email-OTP nach SA | OTP wird per Email zugestellt, Skript hat keinen Mailbox-Zugang |
| ZB1/Dokumente-Upload mit File | Selber Service-Role-Pfad wie Magic-Link, niedrige Smoke-Aussagekraft |
| Voller Onboarding bis `profiles.insert` | OTP-blockiert. Effektiv durch SQL-Test B+C oben verifiziert (Policy lässt korrekten Insert durch). |

## Fazit

- 3 SQL-Tests auf `profiles`-Policy: ✓ alle wie spezifiziert
- 2 UI-Smokes auf staging: ✓ beide ohne 5xx, Stammdaten-Auflösung läuft
- `pg_policies` post-apply (vor Smoke gemacht): 6× DROP weg, 1× TIGHTEN wie spezifiziert, einzige verbliebene Wide-Open-Policy = `gutachter_finder_anfragen.gfa_insert_public` (beabsichtigt)

**AAR-888 verifiziert.** PR #1044 ready für Review-Merge.
