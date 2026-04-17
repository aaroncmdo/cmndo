-- AAR-388: Offline-First Hardening
-- Idempotency für Dokumenten-Uploads und captured_at für GPS-Batch-Sync.
-- Beide Spalten sind nullable, damit bestehende Rows nicht brechen.

-- 1. Dokument-Uploads: Idempotency-Key verhindert Doppel-Inserts bei Retry
ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS fall_dokumente_idempotency_key_uniq
  ON public.fall_dokumente (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.fall_dokumente.idempotency_key IS
  'AAR-388: Client-generierte UUID. Wird bei Upload aus Offline-Outbox gesetzt, damit Retry nach partiellem Sync (Storage-OK / DB-FAIL) idempotent bleibt. UNIQUE-Index fängt Doppel-Inserts ab — Client wertet 23505 als "bereits synced" und löscht den Outbox-Entry.';

-- 2. GPS-Batch: captured_at = echter Messzeitpunkt (nicht Server-Insert-Zeit)
ALTER TABLE public.sv_live_position
  ADD COLUMN IF NOT EXISTS captured_at timestamptz;

COMMENT ON COLUMN public.sv_live_position.captured_at IS
  'AAR-388: Client-Zeitstempel der GPS-Messung. Offline gesammelte Positionen werden beim Reconnect gebatcht übertragen und behalten ihre echten Messzeiten. Merge-Regel im Batch-Endpoint: existing.captured_at < incoming.captured_at → Update, sonst skip.';
