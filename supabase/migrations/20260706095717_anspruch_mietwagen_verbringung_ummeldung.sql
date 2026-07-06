-- Item 4 (volle Positionen): Mietwagen-Tagessaetze pro Segment als Alternative zum Nutzungsausfall,
-- plus Verbringung + Ummeldung als Fix-Positionen. Werte illustrativ (wie WBW-Baender) -> spaeter kalibrieren.
alter table public.nutzungsausfall_segment_saetze add column if not exists mietwagen_min_eur numeric;
alter table public.nutzungsausfall_segment_saetze add column if not exists mietwagen_max_eur numeric;

update public.nutzungsausfall_segment_saetze as s
set mietwagen_min_eur = v.mn, mietwagen_max_eur = v.mx
from (values
  ('kleinwagen', 35, 49),
  ('kompakt', 45, 65),
  ('mittelklasse', 60, 85),
  ('oberklasse', 100, 150),
  ('suv', 80, 120),
  ('transporter', 70, 110)
) as v(seg, mn, mx)
where s.segment = v.seg;

insert into public.anspruch_config (key, wert)
select v.key, v.wert
from (values ('verbringung_eur', 130), ('ummeldung_eur', 75)) as v(key, wert)
where not exists (select 1 from public.anspruch_config c where c.key = v.key);
