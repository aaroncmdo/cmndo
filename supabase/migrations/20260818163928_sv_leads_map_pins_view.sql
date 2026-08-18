-- Explizite Karten-Projektion fuer den oeffentlichen Gutachter-Finder.
--
-- KONTEXT / KORREKTUR: Diese View war als Schritt 1 zum Schliessen eines
-- angenommenen Leselecks gedacht (CONTEXT §9: "anon kann alle 62 Zeilen
-- vollstaendig lesen"). Beim Verifizieren mit dem echten anon-Key zeigte sich,
-- dass es dieses Leck NICHT GIBT: anon hat auf sv_leads nur Spalten-GRANTs auf
-- id, lat, lng, ist_aktiv. Jeder Zugriff auf email/telefon/notizen scheitert
-- mit `permission denied for table sv_leads`. Neue Spalten erben von sich aus
-- keinen Grant, die Anreicherung exponiert also nichts.
--
-- Die View bleibt trotzdem sinnvoll — aber als HAERTUNG, nicht als Fix:
--   1. Sie macht den Vertrag explizit (drei Spalten, nicht "die Tabelle minus
--      dem, was der Grant gerade verbietet").
--   2. Sie entkoppelt den Finder von der Policy-Klausel `OR ist_aktiv = true`.
--      Erst damit laesst sich diese Klausel spaeter ueberhaupt entfernen, ohne
--      die Dead-Pins im Kunden-Embed zu loeschen.
--
-- security_invoker = off (Postgres-Default, hier explizit): die View liest mit
-- Owner-Rechten. anon bekommt Zugriff auf die VIEW, nie auf die Tabelle.
--
-- Verifiziert 18.08.2026 mit dem anon-Key: View liefert 62 Zeilen,
-- sv_leads.email liefert permission denied.
--
-- Spec: docs/superpowers/specs/2026-08-18-sv-levelup-design.md §2.6

create view public.sv_leads_map_pins with (security_invoker = off) as
  select id, lat, lng
  from public.sv_leads
  where ist_aktiv = true;

comment on view public.sv_leads_map_pins is
  'Dead-Pins fuer den oeffentlichen Gutachter-Finder. NUR id/lat/lng — nie Kontaktdaten. Haertung, kein Leck-Fix (Design-Spec §2.6).';

-- Neue public-Objekte granten anon von sich aus NICHTS (Default-Privileges),
-- deshalb ist dieses GRANT Pflicht.
grant select on public.sv_leads_map_pins to anon, authenticated;
