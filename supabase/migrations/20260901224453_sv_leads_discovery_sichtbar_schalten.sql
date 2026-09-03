-- Die 9.957 per Places-Discovery entdeckten Sachverstaendigen-Leads sichtbar und
-- claimbar schalten. Entscheidung Aaron 02.09.2026.
--
-- WARUM SIE AUF false STANDEN: Der Discovery-Plan (docs/superpowers/plans/
-- 2026-08-20-sv-levelup-p7-lead-discovery.md, Aufgabe 2) hat das ausdruecklich
-- als eigene Entscheidung offengelassen:
--
--   "Ein Discovery-Lauf, der tausende Datensaetze aktiv einfuegt, fuellt diese
--    Karten schlagartig mit Bueros, die nie zugestimmt haben. Sichtbarkeit ist
--    eine eigene Entscheidung, kein Nebeneffekt der Erhebung."
--
-- Der Spalten-Default ist `true`; die Zeilen wurden also AKTIV auf false gesetzt.
-- Diese Migration hebt das auf — nicht weil es ein Fehler war, sondern weil die
-- Entscheidung jetzt getroffen ist.
--
-- WAS DAMIT LIVE GEHT (alle vier Consumer haengen an derselben Spalte):
--   * claim-actions.ts       -> auf /gutachter-partner beanspruchbar
--   * gutachter-finder-actions.ts -> Pins im oeffentlichen Finder-Embed
--   * gutachter-verfuegbar (2x) -> Verfuegbarkeits-Fallback … ABER erst, wenn
--     `isochrone_polygon` gefuellt ist. Aktuell: 0 von 9.957. Der Backfill-Cron
--     (api/cron/isochrone-backfill) filtert selbst auf ist_aktiv=true und holt
--     20 pro Lauf — er sieht sie also erst ab jetzt.
--
-- ENG GEFASST: nur quelle='places_discovery'. Kaeme spaeter eine andere Quelle
-- mit bewusst inaktiven Zeilen dazu, bleibt sie unberuehrt.
update public.sv_leads
   set ist_aktiv = true
 where ist_aktiv is false
   and quelle = 'places_discovery'
   -- Schutz: ohne Koordinaten waere der Eintrag im Finder ein Geisterstift
   -- (Formulierung aus dem Plan, Aufgabe 2 Punkt 4).
   and lat is not null
   and lng is not null;
