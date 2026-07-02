-- email_log.empfaenger_typ additiv um 'werkstatt' erweitern (Werkstatt-Login-Mail).
ALTER TABLE public.email_log DROP CONSTRAINT email_log_empfaenger_typ_check;
ALTER TABLE public.email_log ADD CONSTRAINT email_log_empfaenger_typ_check
  CHECK (empfaenger_typ = ANY (ARRAY['kunde'::text, 'sv'::text, 'kanzlei'::text, 'admin'::text, 'werkstatt'::text]));
