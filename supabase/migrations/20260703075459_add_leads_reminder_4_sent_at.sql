-- Nurture-Tuning (Follow-up 1): 4. Reminder (Tag 7) fuellt die Stille-Luecke vor dem Timeout.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS reminder_4_sent_at timestamptz;
