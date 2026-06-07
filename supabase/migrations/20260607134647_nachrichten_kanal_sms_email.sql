-- AAR-939 P4 — nachrichten.kanal um 'sms' + 'email' erweitern (additiv).
-- Der bestehende CHECK kannte nur 'whatsapp' + chat_*; der email-Fallback in
-- lib/whatsapp/send.ts loggte schon 'email' → Insert scheiterte bisher silent
-- (try/catch). Mit P4 kommt der SMS-Fallback dazu. Additiv, value-neutral.
ALTER TABLE nachrichten DROP CONSTRAINT IF EXISTS nachrichten_kanal_check;
ALTER TABLE nachrichten ADD CONSTRAINT nachrichten_kanal_check
  CHECK (kanal = ANY (ARRAY[
    'whatsapp','sms','email',
    'chat_kb_kunde','gruppenchat','chat_kunde_sv','chat_kb_sv','chat_gruppe_mit_makler'
  ]::text[]));
