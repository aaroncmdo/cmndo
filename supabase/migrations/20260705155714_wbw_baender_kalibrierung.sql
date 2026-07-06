-- Anspruch-Totalschaden: WBW-Baender kalibriert (Aaron-Freigabe 2026-07-05).
-- Illustrative Startwerte (Migration 20260704100012) -> marktnahe Schaetzungen
-- (repraesentative dt. Modelle je Segment/Alter). Nur wbw_min_eur/wbw_max_eur;
-- restwert_faktor unveraendert. Behebt systematisch zu niedrige Baender (v.a. junge
-- Fzg) = weniger Falsch-Totalschaden. Keine DDL/Struktur, reine Config-Werte.
-- Applied via Supabase-Plugin apply_migration; tracked version 20260705155714 == Dateiname.
update public.wbw_segment_alter as w
set wbw_min_eur = v.wmin, wbw_max_eur = v.wmax
from (values
  ('kleinwagen',3,11000,18000),('kleinwagen',8,6000,12000),('kleinwagen',99,1500,5500),
  ('kompakt',3,16000,28000),('kompakt',8,8000,17000),('kompakt',99,2500,8000),
  ('mittelklasse',3,22000,40000),('mittelklasse',8,11000,24000),('mittelklasse',99,3500,11000),
  ('oberklasse',3,38000,75000),('oberklasse',8,17000,42000),('oberklasse',99,6000,18000),
  ('suv',3,24000,58000),('suv',8,13000,34000),('suv',99,5000,16000),
  ('transporter',3,20000,40000),('transporter',8,10000,23000),('transporter',99,3000,11000)
) as v(segment, alter_bis_jahre, wmin, wmax)
where w.segment = v.segment and w.alter_bis_jahre = v.alter_bis_jahre;
