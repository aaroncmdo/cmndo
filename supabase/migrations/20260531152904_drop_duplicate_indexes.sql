-- Audit §7-A (A3): drop 3 indexes that exactly duplicate a UNIQUE/PK twin.
-- content_translations_lookup_idx == content_translations_unique (source_hash, target_locale)
-- idx_fall_read_state_user        == fall_read_state_pkey        (user_id, fall_id)
-- idx_ocr_runs_gutachten          covered by ocr_runs_gutachten_id_run_nummer_key (gutachten_id, run_nummer); DESC redundant (btree backward-scan)
DROP INDEX IF EXISTS public.content_translations_lookup_idx;
DROP INDEX IF EXISTS public.idx_fall_read_state_user;
DROP INDEX IF EXISTS public.idx_ocr_runs_gutachten;
