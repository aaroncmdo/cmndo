-- Retention/Datenminimierung fuer Artikel-Kommentare (DPIA-Massnahme):
-- taeglicher Cleanup abgelehnter (rejected) Kommentare 30 Tage nach Moderation.
-- Frist = Default; Aaron/DSE kann via cron.schedule('comment-retention', ...) anpassen
-- oder eine 'hidden'-Retention ergaenzen. pending/approved werden NIE auto-geloescht;
-- NULL moderated_at ist durch den Vergleich ausgeschlossen. Feature noch pre-launch
-- (0 Kommentare) -> aktiviert jetzt risikolos, loescht fruehestens 30 Tage nach Launch.
select cron.schedule(
  'comment-retention',
  '17 3 * * *',
  $$delete from public.article_comments
    where status = 'rejected' and moderated_at < now() - interval '30 days'$$
);
