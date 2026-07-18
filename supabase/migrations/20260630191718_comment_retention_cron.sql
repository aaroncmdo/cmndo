-- Retention/Datenminimierung fuer Artikel-Kommentare (DPIA-Massnahme):
-- taeglicher Cleanup abgelehnter (rejected) Kommentare 30 Tage nach Moderation.
-- Frist = Default; Aaron/DSE kann via cron.schedule('comment-retention', ...) anpassen
-- oder eine 'hidden'-Retention ergaenzen. pending/approved werden NIE auto-geloescht;
-- NULL moderated_at ist durch den Vergleich ausgeschlossen. Feature noch pre-launch
-- (0 Kommentare) -> aktiviert jetzt risikolos, loescht fruehestens 30 Tage nach Launch.
-- Replay-Toleranz (Preview-Chain-Fix 17.07.): pg_cron nur auf Prod/Staging, nicht in Preview/
-- From-Scratch-Replay -> Schema "cron" fehlt -> ungeguardetes cron.schedule bricht den Replay.
-- Guard-Muster wie 20260529212846. Auf Prod (cron vorhanden) 1:1 unveraendert.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule(
      'comment-retention',
      '17 3 * * *',
      $cron$delete from public.article_comments
        where status = 'rejected' and moderated_at < now() - interval '30 days'$cron$
    );
  else
    raise notice 'pg_cron nicht installiert - Cron-Job comment-retention uebersprungen (Preview/lokal)';
  end if;
end $$;
