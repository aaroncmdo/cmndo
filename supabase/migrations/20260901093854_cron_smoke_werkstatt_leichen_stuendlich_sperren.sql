-- URSACHE zum Einmal-Fix aus Migration 20260831225956.
--
-- Die vier Seed-Skripte (kasko-reparatur, reparatur-funnel, reparatur-weg-e2e,
-- werkstatt-finder) raeumen durchaus auf — aber erst BEIM NAECHSTEN LAUF ihrer
-- eigenen Sorte ("Leichen abgestuerzter Vorlaeufe zuerst entfernen"). Laeuft ein
-- Seed tagelang nicht, steht seine Wegwerf-Werkstatt genauso lange im PRODUKTIVEN
-- Angebot. Genau so gemessen 31.08.: beide gefundenen Leichen waren ~14 h alt, beide
-- haetten einen Purge im zugehoerigen Seed gehabt — der lief nur nicht.
--
-- Aufraeumen am Lauf-Anfang schuetzt also nicht die Zeit ZWISCHEN den Laeufen.
-- Dieser Job schliesst genau dieses Fenster: stuendlich statt "irgendwann".
--
-- Sperren, nicht loeschen: 'gesperrt' nimmt sie aus beiden Matching-Pfaden
-- (lade-vorschlaege.ts + finder.ts filtern .eq('status','aktiv')), laesst aber alle
-- Fremdschluessel intakt — ein DELETE koennte an reparatur_termine/Vermittlungen
-- haengen. Die Seeds loeschen ihre eigenen Eintraege weiterhin selbst; ein gesperrter
-- Datensatz stoert sie nicht (sie greifen ueber name/user_id, nicht ueber status).
--
-- Dieselben drei Schutzbedingungen wie beim Einmal-Fix:
--   1. nur der maschinelle Praefix '^SMOKE '
--   2. keine Claims daran
--   3. aelter als 6 h — kein laufender Smoke wird unterbrochen (ein Test laeuft nie 6 h)

select cron.schedule(
  'smoke-werkstatt-leichen-sperren',
  '0 * * * *',
  $$
  update public.werkstaetten
     set status = 'gesperrt'
   where name ~ '^SMOKE '
     and status = 'aktiv'
     and created_at < now() - interval '6 hours'
     and not exists (
       select 1 from public.claims c where c.werkstatt_id = werkstaetten.id
     )
  $$
);
