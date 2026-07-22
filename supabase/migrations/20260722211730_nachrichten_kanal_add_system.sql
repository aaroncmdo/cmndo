-- Fix: sendSystemMessage (src/lib/tasks/reminder-sender.ts) inserts nachrichten.kanal='system',
-- but the CHECK never included 'system' -> every task-reminder falling back to the system channel
-- threw (0 of 159 rows ever landed). Additive superset: only ADDS 'system', all existing rows stay valid.
ALTER TABLE public.nachrichten DROP CONSTRAINT nachrichten_kanal_check;
ALTER TABLE public.nachrichten ADD CONSTRAINT nachrichten_kanal_check
  CHECK (kanal = ANY (ARRAY['whatsapp','sms','email','chat_kb_kunde','gruppenchat','chat_kunde_sv','chat_kb_sv','chat_gruppe_mit_makler','system']::text[]));
