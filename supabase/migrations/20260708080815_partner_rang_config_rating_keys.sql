insert into public.partner_rang_config (schluessel, wert, beschreibung) values
  ('rating_norm_floor', 3, 'Rating-Normalisierung: durchschnitt <= floor -> 0 Punkte'),
  ('rating_norm_span', 2, 'Rating-Normalisierung: (durchschnitt - floor) / span -> [0..1]'),
  ('sinnsatz_top_rating', 4.3, 'Ab diesem Durchschnitt zeigt der Sinnsatz "top bewertet"')
on conflict (schluessel) do nothing;
