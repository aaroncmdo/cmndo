-- Admin-Support-Seite embeddet profiles(...) von technische_probleme — ohne FK wirft
-- PostgREST PGRST200 (Relation nicht auffindbar, Seite seit Anlage tot; Query-Parse-Sweep).
-- user_id ist NOT NULL, Tabelle leer (0 rows, verifiziert 16.07.) -> FK risikofrei.
-- CASCADE: Support-Ticket stirbt mit dem User (DSGVO-Loeschung sauber). Muster: die
-- Tabelle hat bereits technische_probleme_claim_id_fkey.
ALTER TABLE public.technische_probleme
  ADD CONSTRAINT technische_probleme_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
