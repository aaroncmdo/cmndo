-- normalized_name Dedup-Keys (additiv)
alter table public.firmen               add column if not exists normalized_name text;
alter table public.versicherungen       add column if not exists normalized_name text;
alter table public.werkstaetten         add column if not exists normalized_name text;
alter table public.mietwagenunternehmen add column if not exists normalized_name text;
alter table public.vehicles             add column if not exists kennzeichen_normalized text;

-- Firma -> Default-Ansprechpartner (stehende Beziehung, claim-unabhaengig)
alter table public.firmen add column if not exists ansprechpartner_person_id uuid
  references public.personen(id) on delete set null;

-- Backfill: normalized_name fuer Bestand. MUSS normalizeName() (TS) exakt spiegeln:
--   lower -> [._/-,]+ -> ' ' -> \s+ -> ' ' -> btrim ; '' -> NULL
update public.versicherungen set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;
update public.firmen set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;
update public.werkstaetten set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;
update public.mietwagenunternehmen set normalized_name =
  nullif(btrim(regexp_replace(regexp_replace(lower(name), '[._/,-]+', ' ', 'g'), '\s+', ' ', 'g')), '')
  where normalized_name is null and name is not null;

-- Lookup-Indexe fuer find-or-create
create index if not exists idx_firmen_normalized_name               on public.firmen(normalized_name);
create index if not exists idx_versicherungen_normalized_name       on public.versicherungen(normalized_name);
create index if not exists idx_werkstaetten_normalized_name         on public.werkstaetten(normalized_name);
create index if not exists idx_mietwagenunternehmen_normalized_name on public.mietwagenunternehmen(normalized_name);
create index if not exists idx_vehicles_kennzeichen_normalized      on public.vehicles(kennzeichen_normalized);
create index if not exists idx_firmen_ust_id                        on public.firmen(ust_id);

-- claim_parties.rolle += 'ansprechpartner' (abweichender Firma-Kontakt pro Claim; §3).
-- Alle Bestandswerte erhalten (Stand inkl. 'halter' aus Mig 20260603205846; 'ansprechpartner'
-- war bereits live -> dieser drop+readd ist ein idempotenter No-op, der den Wert-Set fixiert).
alter table public.claim_parties drop constraint if exists claim_parties_rolle_check;
alter table public.claim_parties add constraint claim_parties_rolle_check
  check (rolle = any (array[
    'geschaedigter','verursacher','fahrer_nicht_halter','beifahrer','zeuge',
    'gegner_airdrop','gutachter_gegen','versicherungssachbearbeiter','halter','ansprechpartner'
  ]));
