# Security-Hotfix: sv_leads anon-PII-Leak schließen

**Datum:** 2026-06-02 · **Branch:** `kitta/sv-leads-anon-leak-fix` · **Migration:** `20260601223604_restrict_anon_sv_leads_to_map_columns`
**Klasse:** identisch zu #2177 (`20260601180648` restrict_anon_sachverstaendige) · **Gefunden:** beim Live-RLS-Check zum SV-Basic-Tier-P1-Kickoff.

## Befund (HIGH — externally exploitable PII-Leak)

`anon` hatte **table-level GRANT ALL** (`arwdDxtm`) auf `public.sv_leads`. Die einzige Lese-RLS-Policy `sv_leads_select_public` filtert nur **Zeilen** (`ist_aktiv = true`), nicht Spalten. Ergebnis: jeder anonyme Nutzer konnte den **gesamten DAT-Kaltpool mit allen PII** über den öffentlichen REST-Endpoint auslesen:

```
GET /rest/v1/sv_leads?select=*        (anon apikey)  -> alle aktiven Zeilen inkl.
name, vorname, nachname, firma, telefon, email, adresse, plz, ort,
dat_id, dat_expert_nr, dat_url, bvsk_nr, oebuv_nr, qualifikationen, fachschwerpunkte
```

RLS ist zeilen-, nicht spaltenbasiert — der table-GRANT war die Quelle. `relacl` listete `anon=arwdDxtm`, **keine** column-level `attacl` → der table-GRANT war die einzige Quelle (kein column-REVOKE nötig). Die least-privilege-Migration `20260531152932` deckte nur `consent_records`/`content_translations` ab; `sv_leads` war die verbleibende Lücke.

## Fix (mirror #2177)

```sql
REVOKE ALL ON public.sv_leads FROM anon;
GRANT SELECT (id, lat, lng, ist_aktiv) ON public.sv_leads TO anon;
```

- Nur die **Map-Pin-Spalten** bleiben anon-lesbar. `ist_aktiv` ist mit drin, weil der einzige anon-Reader `ladeSvLeads` (`src/lib/actions/gutachter-finder-actions.ts`) `.eq('ist_aktiv', true)` filtert (Filter-Spalte braucht column-GRANT) — harmlos/RLS-redundant, da RLS eh nur `ist_aktiv=true` liefert.
- Schreib-Grants (INSERT/UPDATE/DELETE/TRUNCATE) fallen mit weg (Defense-in-Depth; waren eh RLS-blockiert, keine anon-Write-Policy).

## Regression-Analyse (alle sv_leads-Reader geprüft)

| Reader | Client | Spalten | Betroffen? |
|---|---|---|---|
| `ladeSvLeads` (Marketing-Karte) | `createClient()` = **anon** | id,lat,lng + Filter ist_aktiv | **Ja → exakt re-granted** ✓ |
| `findSvsForLocation` (Funnel) | `createAdminClient()` | viele | nein (service-role) |
| `svMatching` (Wizard-Match) | `createAdminClient()` | id,name,vorname,lat,lng | nein (service-role) |
| `gutachter-verfuegbar` (LP) | `createServiceClient()` | id,isochrone_polygon | nein (service-role) |
| `gutachter-finder-actions:claim` | `admin` | name,telefon | nein (service-role) |
| Dispatch `gutachter-finder` (nested) | `authenticated` | name,telefon,email | nein (authenticated-GRANT bleibt) |

## Verifikation

**1. DB-Privilegien** (`has_column_privilege`, post-apply):
`anon` email/name/telefon/adresse/dat_id = `false` · id/lat/lng/ist_aktiv = `true` · anon INSERT = `false` · authenticated SELECT = `true`.

**2. Externer HTTP-Probe** (live PostgREST, anon apikey):
- `select=name,email,telefon` → **HTTP 401 (denied)**
- `select=*` (Scrape) → **HTTP 401 (denied)**
- `select=id,lat,lng` → **HTTP 200 + Pin-Daten**

**3. Funktionaler Smoke** (exakte `ladeSvLeads`-Query als anon):
`select=id,lat,lng&ist_aktiv=eq.true` → **HTTP 206, Content-Range `0-0/62`**. Ground-Truth (service-role `count(*) where ist_aktiv`) = **62**. Match → anon liest alle aktiven Pins, 0 Zeilen verloren, Marketing-Karte unverändert.

## Scope

Standalone-Hotfix (Aaron-Entscheidung 2026-06-01: „Standalone-Hotfix zuerst"), separat vom SV-Basic-Tier-P1-Feature. P1 baut anschließend auf der nun sicheren Tabelle auf (service-role-Suche, leakt selbst nichts).
