-- Defense-in-Depth (chat-rebuild): verhindert, dass ein Nicht-Mitglied (z.B. ein Kunde
-- per Direkt-Client mit dem authenticated-Key) eine Nachricht in einen Thread injiziert,
-- dem er nicht angehoert -- insbesondere den internen team_intern-Staff-Thread. Die
-- bestehenden permissiven INSERT-Policies (nachrichten_insert_public_consol, staff_fall_scoped,
-- admin_nachrichten) pruefen thread_id NICHT. Diese RESTRICTIVE Policy ANDet die
-- Thread-Mitgliedschaft zusaetzlich dazu.
--
-- Legitime Pfade nachweislich unberuehrt: ALLE thread_id-setzenden Inserts laufen ueber die
-- Service-Role (thread-actions.ts, baileys/inbound -> RLS-Bypass). User-Client-Inserts (v1
-- Kanal-Chat) setzen thread_id=NULL -> passieren via der thread_id-IS-NULL-Klausel.
create policy nachrichten_thread_insert_member_only
  on public.nachrichten
  as restrictive
  for insert
  to public
  with check (thread_id is null or is_staff() or ist_chat_teilnehmer(thread_id));

comment on policy nachrichten_thread_insert_member_only on public.nachrichten is
  'Defense-in-Depth (chat-rebuild): Insert mit thread_id nur fuer Mitglieder/Staff; thread_id IS NULL = Legacy-Kanal-Pfad. Service-Role bypasst RLS.';
