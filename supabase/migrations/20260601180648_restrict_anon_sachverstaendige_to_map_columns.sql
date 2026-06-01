-- Security CRITICAL (Personal-Audit #2173, anon-Leak): anon hatte table-level GRANT ALL
-- auf sachverstaendige -> die Map-Policy (sachverstaendige_anon_select_map_ready, filtert
-- nur Zeilen) gab anon GANZE Zeilen inkl. stripe_customer_id/ust_id/steuernummer/hrb/
-- vertrag_*/werbebudget/paket_preis/notizen/sa_vorlage_* etc. (RLS ist zeilen-, nicht
-- spaltenbasiert; column-REVOKE wirkte nicht wegen table-GRANT).
--
-- Fix: table-GRANT von anon entfernen, dann NUR die Public-Map-Spalten als column-SELECT
-- granten. Das sind exakt die Spalten, die der einzige anon-Rollen-Reader liest
-- (ladeAktiveSVs in src/lib/actions/gutachter-finder-actions.ts; alle anderen Reader =
-- Admin-/Service-Client, RLS-Bypass, nicht anon-betroffen). Die RLS-Policy bleibt (Zeilen-
-- Filter: verifiziert/ist_aktiv/geloescht_am/standort/isochrone) — Policy-USING-Spalten
-- werden vom System ausgewertet, brauchen kein column-GRANT fuer anon. Schreib-Grants
-- (INSERT/UPDATE/DELETE/TRUNCATE) fallen mit weg (Defense-in-Depth; waren eh RLS-blockiert).
REVOKE ALL ON public.sachverstaendige FROM anon;
GRANT SELECT (
  id, paket, profile_id, firmenname,
  standort_lat, standort_lng, standort_adresse,
  spezifikationen, isochrone_polygon
) ON public.sachverstaendige TO anon;
