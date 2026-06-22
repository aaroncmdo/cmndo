-- Werkstatt-Vermittler Final-Review Critical #1: werkstaetten-Self-RLS (spiegelt makler_self_*).
-- WP-A (20260622130623) gab nur werkstatt_provisionen Policies; ohne diese liest
-- getWerkstattByUserId (Auth-Client) 0 Rows -> Portal-Layout redirectet JEDEN Werkstatt-User
-- auf /pending -> das gesamte Portal ist in Prod unerreichbar. Live-Gap gefunden im
-- Final-Whole-Branch-Review (RLS wurde von keinem Unit-Test geuebt).
CREATE POLICY werkstaetten_self_read ON public.werkstaetten FOR SELECT
  USING (user_id = (SELECT auth.uid()));
CREATE POLICY werkstaetten_self_update ON public.werkstaetten FOR UPDATE
  USING (user_id = (SELECT auth.uid()));
