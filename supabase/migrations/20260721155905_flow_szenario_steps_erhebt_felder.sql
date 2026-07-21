-- Spec 2026-07-21 (FlowLink operative Vollstaendigkeit): erhebt_felder haelt die operativen
-- Rohspalten, die ein Step einsammelt. Der Step bleibt sichtbar, solange >=1 davon leer ist
-- (Ersatz fuer die kaputten Ein-Feld-Stellvertreter-bedingungen). Additiv + inert: Default '{}'
-- => berechneAktiveSteps sieht "kein Gate" bis die Matrix befuellt ist (eigene Folge-Migration).
ALTER TABLE public.flow_szenario_steps
  ADD COLUMN IF NOT EXISTS erhebt_felder text[] NOT NULL DEFAULT '{}'::text[];
