-- Hoechstdauern fuer Ersatzfahrzeug-Positionen im Anspruchspruefer als SSoT in anspruch_config.
-- nutzungsausfall_max_tage: max. Nutzungsausfall-Tage im Reparaturfall (gesetzl. Praxis ~12).
-- mietwagen_max_tage:      max. Mietwagen-Tage (~14).
-- Code liest sie via num(cfg, key, fallback) in rates.ts mit denselben Fallbacks (12/14).
-- ON CONFLICT DO NOTHING respektiert spaetere Admin-Tuning-Werte bei Re-Runs.
INSERT INTO public.anspruch_config (key, wert) VALUES
  ('nutzungsausfall_max_tage', 12),
  ('mietwagen_max_tage', 14)
ON CONFLICT (key) DO NOTHING;
