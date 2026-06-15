-- AAR-956 Self-Service #3b: leads -> REPLICA IDENTITY FULL.
-- Damit Supabase Realtime die UPDATE-Events der leads-Row unter der column-
-- gegateten anon-Policy "Flow anon select leads" (status='flow-gesendet') an den
-- anonymen /flow-Client liefert (Live-Aktualisierung). Konsistent mit claims +
-- gutachter_termine, die aus demselben Grund bereits FULL sind (sv_live_position
-- bleibt default, weil nur INSERT abonniert wird). Die Dispatcher-Seite ist
-- rollenbasiert und braucht das nicht -- FULL schadet ihr aber nicht.
ALTER TABLE public.leads REPLICA IDENTITY FULL;
