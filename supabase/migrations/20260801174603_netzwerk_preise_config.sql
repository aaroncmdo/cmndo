alter table public.rechnungs_konfiguration
  add column netzwerk_monat_cent   integer,
  add column netzwerk_setup_cent   integer,
  add column werkstatt_setup_cent  integer;
comment on column public.rechnungs_konfiguration.netzwerk_monat_cent is
  'Netzwerkpartner Monats-Flatrate in Cent (config-getrieben, versioniert). TBD-Aaron: 2999 Platzhalter.';
comment on column public.rechnungs_konfiguration.netzwerk_setup_cent is
  'Netzwerkpartner einmalige Einrichtungsgebuehr in Cent. TBD-Aaron: 3990 Platzhalter.';
comment on column public.rechnungs_konfiguration.werkstatt_setup_cent is
  'Werkstatt-Setup-Fee in Cent (E7, spaetere Phase — hier nur angelegt, nicht scharf).';
-- AB2: Platzhalter in die AKTUELL gueltige Config-Row (gueltig_bis IS NULL) seeden.
-- Aaron bestaetigt final via reiner Config-UPDATE (kein Code-Change).
update public.rechnungs_konfiguration
   set netzwerk_monat_cent = coalesce(netzwerk_monat_cent, 2999),
       netzwerk_setup_cent = coalesce(netzwerk_setup_cent, 3990)
 where gueltig_bis is null;