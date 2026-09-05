-- Index fuer den Resend-Webhook-Lookup (Kasko-WB Phase 2, 05.09.2026).
--
-- Der Webhook schlaegt jedes Zustell-Ereignis ueber die Resend-Message-ID nach. Ohne Index ist das
-- ein Seq-Scan auf email_log — bei 1.032 Zeilen heute belanglos, aber die Tabelle waechst um rund
-- 542 Zeilen je 30 Tage, und der Lookup laeuft VIER MAL je Mail (sent/delivered/bounced/complained).
--
-- Bewusst NICHT UNIQUE: die Spalte ist heute faktisch eindeutig (1.029 von 1.029 nicht-NULL sind
-- distinct), aber ein Unique-Constraint wuerde einen kuenftigen Insert HART ablehnen, statt nur den
-- Lookup mehrdeutig zu machen. Der Code nimmt darum den juengsten Treffer (.limit(1)).
-- Partiell auf NOT NULL: 3 Zeilen ohne message_id gehoeren nicht in den Index.
CREATE INDEX IF NOT EXISTS idx_email_log_message_id
  ON public.email_log USING btree (message_id)
  WHERE message_id IS NOT NULL;