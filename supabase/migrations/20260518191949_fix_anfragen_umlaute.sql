-- 2026-05-18: Korrigiert ASCII-Ersatz in den COMMENT-Strings der
-- anfragen-Tabelle (AGENTS.md §Sprache verlangt echte Umlaute).
-- Re-running COMMENT ON ist idempotent.

COMMENT ON TABLE public.anfragen IS
  'Inbox für rohe Eingangs-Anfragen aus allen Channels (LP-Forms, Rückruf-Modal, Telefon-Bot, WA, Partner-APIs). Atomar konvertiert zu leads via convert_anfrage_zu_lead(). Audit-Trail-Tabelle, niemals DELETE — nur disqualifizieren.';

COMMENT ON COLUMN public.anfragen.quelle IS
  'Maschinenlesbarer Channel-Slug. Eine Quelle = ein Slug (z.B. kfzgutachter-ads-lp).';

COMMENT ON COLUMN public.anfragen.payload IS
  'Channel-spezifischer Rohdaten-Puffer. Felder die regelmäßig abgefragt werden, sollten später zu echten Spalten promoviert werden.';

COMMENT ON COLUMN public.anfragen.konvertier_status IS
  'pending | success | failed | disqualifiziert — vollständiger Convert-Audit-Trail inkl. Fehlerfällen.';
