-- KFZ-68: Supabase Realtime fuer Kern-Tabellen aktivieren
-- (bereits via SQL Editor ausgefuehrt)
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS nachrichten;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS benachrichtigungen;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS faelle;
ALTER PUBLICATION supabase_realtime ADD TABLE IF NOT EXISTS leads;
