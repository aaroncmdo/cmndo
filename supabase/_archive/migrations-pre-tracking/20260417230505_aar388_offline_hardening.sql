-- AAR-388: Offline-First Hardening

ALTER TABLE public.fall_dokumente
  ADD COLUMN IF NOT EXISTS idempotency_key uuid;

CREATE UNIQUE INDEX IF NOT EXISTS fall_dokumente_idempotency_key_uniq
  ON public.fall_dokumente (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.fall_dokumente.idempotency_key IS
  'AAR-388: Client-generierte UUID. Wird bei Upload aus Offline-Outbox gesetzt, damit Retry nach partiellem Sync (Storage-OK / DB-FAIL) idempotent bleibt. UNIQUE-Index faengt Doppel-Inserts ab.';

ALTER TABLE public.sv_live_position
  ADD COLUMN IF NOT EXISTS captured_at timestamptz;

COMMENT ON COLUMN public.sv_live_position.captured_at IS
  'AAR-388: Client-Zeitstempel der GPS-Messung. Offline gesammelte Positionen werden beim Reconnect gebatcht uebertragen und behalten ihre echten Messzeiten.';
;
