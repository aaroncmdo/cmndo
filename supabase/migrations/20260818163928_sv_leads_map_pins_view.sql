-- Schritt 1 von 2 zum Schliessen des sv_leads-Leselecks.
--
-- Der oeffentliche Gutachter-Finder (src/app/embed/gutachter-finder + die
-- Marketing-Seite vermittlungsportale-vergleich) rendert die 62 sv_leads als
-- Dead-Pins auf der Karte. ladeSvLeads() liest dafuer heute die BASISTABELLE
-- ueber den anon-Client und braucht dazu die Policy-Klausel `OR ist_aktiv = true`.
--
-- Diese View gibt genau die drei Spalten frei, die die Karte braucht — und
-- waechst NICHT mit der Anreicherung mit: email, telefon, notizen und alle
-- kuenftigen Kontaktfelder bleiben aussen vor.
--
-- security_invoker = off (Postgres-Default, hier explizit): die View liest mit
-- den Rechten des Owners, anon bekommt Zugriff auf die VIEW und nie auf die
-- Tabelle. Genau deshalb kann Schritt 2 die Tabellen-Policy zumachen.
--
-- ⚠ Schritt 2 (Policy-Verschaerfung) darf ERST NACH dem Deploy des
-- umgestellten ladeSvLeads() laufen. Sonst ist die Karte im Kunden-Embed
-- zwischen Migration und Deploy leer.
--
-- Spec: docs/superpowers/specs/2026-08-18-sv-levelup-design.md §2.6

create view public.sv_leads_map_pins with (security_invoker = off) as
  select id, lat, lng
  from public.sv_leads
  where ist_aktiv = true;

comment on view public.sv_leads_map_pins is
  'Dead-Pins fuer den oeffentlichen Gutachter-Finder. NUR id/lat/lng — nie Kontaktdaten. Ersetzt den anon-Lesezugriff auf sv_leads (Design-Spec §2.6).';

-- Neue public-Objekte granten anon von sich aus NICHTS (Default-Privileges),
-- deshalb ist dieses GRANT Pflicht.
grant select on public.sv_leads_map_pins to anon, authenticated;
