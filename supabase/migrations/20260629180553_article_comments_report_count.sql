-- Meldefunktion (Notice-and-Takedown): Zaehler, wie oft ein Kommentar gemeldet wurde.
-- Bumpt via login-gated Marketing-Action (reportComment, service-role); Moderation sieht report_count > 0.
alter table public.article_comments add column report_count integer not null default 0;
