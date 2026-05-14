# Prod-Breaker: /gutachter-finden zeigt 0 Sachverständige

**Datum:** 14.05.2026
**Schwere:** P0 — Marketing-Karte (Top-Conversion-Page) komplett unbenutzbar
**Status:** Hotfix-Migration `20260514132037_aar_hotfix_anon_is_admin_grant.sql` bereit

## Symptom

Auf https://claimondo.de/gutachter-finden und https://app.claimondo.de/gutachter-finden steht im Status-Pill statt z.B. „7 Premium-Partner + 62 weitere Sachverständige bundesweit verfügbar" nur **„0 Sachverständige bundesweit verfügbar"** — die Mapbox-Karte rendert, aber **keine Marker**.

Verifikation Prod:

```
curl -s https://claimondo.de/gutachter-finden | grep -oE '[0-9]+\s+Sachverst[^<"]*' | head -3
→ 0 Sachverständige bundesweit verfügbar
```

## Reproduktion (anon-Query)

```
node --env-file=.env.local -e "
const c = require('@supabase/supabase-js').createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);
c.from('sv_leads').select('id').eq('ist_aktiv', true).limit(1)
 .then(r => console.log(r.error?.message));
"
→ permission denied for function is_admin
```

## Datenstand (würde sichtbar sein wenn der Bug weg ist)

| Source | Count | Sichtbar für anon (Policy) |
|---|---:|---|
| `sachverstaendige` (Tier-1, Iso-Halo + Premium-Marker) | 7 | `sachverstaendige_anon_select_map_ready` |
| `sv_leads` (Tier-3, kleine graue Marker) | 62 | `sv_leads_select_public` |

## Root Cause

Migration **`20260514101645_aar_fn_revoke_execute_security_definer.sql`** revoked EXECUTE auf 16 SECDEF-Funktionen `FROM PUBLIC, anon, authenticated` — darunter `is_admin()`. Die Migration begründet das damit, dass RLS-Policy-Evaluierung mit Owner-Privilegien laufe — das ist falsch. Postgres prüft EXECUTE-Permissions des **Callers** auch bei SECURITY DEFINER; nur der Function-**Body** läuft als Owner.

Folge-Migrationen (`20260514102431_fix_is_staff_grant_authenticated.sql`, `20260514115529_aar_grant_is_sv_kanzlei_claim_functions.sql`) haben einige Functions an `authenticated` zurückgegrantet, aber `is_admin()` an `anon` blieb revoked.

Die Karten-Reads schlagen fehl, weil:
- `sv_leads.sv_leads_admin_all` hat `polroles={-}` (PUBLIC) und `is_admin() OR ...` im USING-Clause → anon-Read evaluiert die Policy → `permission denied for function is_admin` → 42501 → ganze Query stirbt
- `sachverstaendige."Admins full access"` analog

## Fix

Eine Zeile (siehe Migration):

```sql
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon;
```

**Sicherheitsbewertung:** `is_admin()` returnt für anon konstant `false` (kein `auth.uid()` → kein Profile-Eintrag → kein Admin-Match). Anon EXECUTE ist informationstheoretisch leak-frei.

## Defense-in-Depth (Folge-PR, nicht Hotfix-Scope)

Die saubere Lösung ist `ALTER POLICY ... TO authenticated` für alle `is_admin()`-aufrufenden Policies mit `polroles={-}`. Anon evaluiert sie dann gar nicht erst. ~25 Policies betroffen — separater PR.

## Verifikation des Fixes

```
set role anon;
select count(*) from sv_leads where ist_aktiv = true;
→ 62
select count(*) from sachverstaendige
  where verifiziert and ist_aktiv and isochrone_polygon is not null;
→ 7
```

Karte zeigt dann wieder „7 Premium-Partner + 62 weitere Sachverständige bundesweit verfügbar" im Status-Pill.

## Screenshots Vor-Apply (broken state)

* `screens/01-desktop-vollbild.png` — Karte rendert (Köln-Region), aber keinerlei SV-Marker. Status-Pill: „0 Sachverständige in Ihrer Nähe".
* `screens/03-mobile-vollbild.png` — Mobile-View, gleicher Stand.
* `screens/04-mobile-sheet-open.png` — Mobile Bottom-Sheet expanded, Wizard rendert leer (kein SV im Pool).
