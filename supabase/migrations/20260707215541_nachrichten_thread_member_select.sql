-- Phase 2b: Thread-Mitglieder duerfen ihre thread-nativen Nachrichten lesen (fuer Reads + Realtime).
-- ADDITIVE SELECT-Policy (RLS-SELECTs sind OR-verknuepft) -> aendert die alten kanal-Policies NICHT.
-- Nutzt den rekursionsfreien SECURITY-DEFINER-Helper aus Phase 1.
create policy nachrichten_thread_member_select on public.nachrichten
  for select to authenticated
  using (thread_id is not null and public.ist_chat_teilnehmer(thread_id));
