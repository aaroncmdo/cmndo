-- BUG-79: Email-Compose-Feature entfernen, nur email_log Spalten die NUR dafuer waren
-- NICHT droppen: richtung (KFZ-137 braucht 'outbound'), message_id (KFZ-137 nutzt es),
-- gesendet_von_user_id (harmlos, bleibt), lead_id (KFZ-146 braucht es)

-- Diese Spalten wurden NUR fuer Email-Compose angelegt und werden von nichts anderem benutzt:
ALTER TABLE email_log DROP COLUMN IF EXISTS in_reply_to;
ALTER TABLE email_log DROP COLUMN IF EXISTS body_html;
ALTER TABLE email_log DROP COLUMN IF EXISTS body_text;
ALTER TABLE email_log DROP COLUMN IF EXISTS empfaenger_array;
ALTER TABLE email_log DROP COLUMN IF EXISTS cc;
ALTER TABLE email_log DROP COLUMN IF EXISTS bcc;
ALTER TABLE email_log DROP COLUMN IF EXISTS thread_id;

-- gmail_oauth_tokens existiert nicht, nichts zu droppen
