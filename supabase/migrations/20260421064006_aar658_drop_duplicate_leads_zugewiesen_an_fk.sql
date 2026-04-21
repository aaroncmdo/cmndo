-- AAR-658: Duplicate-FK auf leads.zugewiesen_an bereinigen.
--
-- DB hatte zwei FKs auf derselben Spalte:
--   leads_zugewiesen_an_fk   FOREIGN KEY (zugewiesen_an) REFERENCES profiles(id) ON DELETE SET NULL
--   leads_zugewiesen_an_fkey FOREIGN KEY (zugewiesen_an) REFERENCES profiles(id)
--
-- Dadurch wird jeder PostgREST-Nested-Embed `leads.select('profiles(...)')`
-- ambiguous (PGRST201). Aktuell nutzt kein Code diesen Embed, aber sobald
-- jemand das baut, gibt's dieselbe Klasse von Silent-Bugs wie in AAR-657.
--
-- Gedroppt: leads_zugewiesen_an_fkey (ohne ON DELETE-Verhalten).
-- Behalten: leads_zugewiesen_an_fk (mit ON DELETE SET NULL — sauberer
-- Cascade wenn ein Admin-Profil gelöscht wird).

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_zugewiesen_an_fkey;
