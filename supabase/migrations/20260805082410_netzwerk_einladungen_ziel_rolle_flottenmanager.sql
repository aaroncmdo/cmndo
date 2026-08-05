-- #5010-Hotfix: Kalt-Einladung Rolle 'flottenmanager' (Flotten-Self-Signup) wurde vom
-- ziel_rolle-CHECK abgelehnt -- der PR kam ohne Migration, der CHECK kannte nur die 3
-- alten Rollen. Regel-4-Smoke-Fund 05.08.
ALTER TABLE public.netzwerk_einladungen
  DROP CONSTRAINT netzwerk_einladungen_ziel_rolle_check;
ALTER TABLE public.netzwerk_einladungen
  ADD CONSTRAINT netzwerk_einladungen_ziel_rolle_check
  CHECK (ziel_rolle = ANY (ARRAY['sachverstaendiger'::text, 'werkstatt'::text, 'makler'::text, 'flottenmanager'::text]));
