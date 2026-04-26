-- AAR-826.1: pg_cron + pg_net Extensions aktivieren

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL ON ALL TABLES IN SCHEMA cron TO postgres;

DO $$
BEGIN
  RAISE NOTICE '
    AAR-826.1 Extensions aktiviert:
      pg_cron (Schema: cron)  — SQL-only Cron-Jobs via cron.schedule()
      pg_net  (Schema: extensions) — async HTTP via net.http_post()

    Alle Cron-Jobs dieses Tickets nutzen pg_cron für SQL-only Jobs.
    Edge-Functions und Vercel-Cron für externe API-Calls (Cardentity, Resend, Salesforce).';
END $$;
