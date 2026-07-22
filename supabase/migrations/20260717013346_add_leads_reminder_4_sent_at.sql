-- AAR-477: No-op-Reapply (17.07.2026). Spalte existiert seit Migration
-- 20260703075459_add_leads_reminder_4_sent_at.sql und ist auf main auch in
-- database.types.ts komplett — die Stufe-4-Autor-Session hatte Migration+Types
-- fertig, nur der Code (Cron/Sender/Template) blieb 14 Tage uncommitted im
-- Haupt-Checkout liegen. Dieses Reapply entstand aus Forensik im falschen
-- Checkout (aar-956-Branch mit stale database.types.ts ohne reminder_4 ->
-- Lane hielt die Spalte fuer fehlend; attnum-Check widerlegte das danach).
-- IF NOT EXISTS => No-op. Das File existiert nur, um die Twin-Invariante fuer
-- den redundanten Tracking-Eintrag 20260717013346 zu halten (Regel 2, Schritt 3+4).
alter table public.leads add column if not exists reminder_4_sent_at timestamptz;

comment on column public.leads.reminder_4_sent_at is 'AAR-477: Reminder-Stufe 4 (120h/Tag 5) gesendet am — NULL = noch nicht gesendet';
