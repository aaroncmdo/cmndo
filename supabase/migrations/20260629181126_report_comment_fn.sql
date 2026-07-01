-- Eng gescopte Meldefunktion: zaehlt report_count hoch, sonst nichts.
-- SECURITY DEFINER, damit Nicht-Autoren melden koennen (RLS laesst sonst keinen Update zu),
-- aber NUR fuer authentifizierte Nutzer (grant) — keine anonyme Report-Flut.
create or replace function public.report_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required';
  end if;
  update public.article_comments
     set report_count = report_count + 1
   where id = p_comment_id;
end;
$$;

revoke all on function public.report_comment(uuid) from public, anon;
grant execute on function public.report_comment(uuid) to authenticated;
