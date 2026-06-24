-- AAR-360: Retire dead sa_vorlage subsystem.
-- Code readers removed: #3117 (review subsystem) + #3107 (generator) — both on main=production.
-- Pre-flight verified 0 data in all 7 columns, no view/RLS/function dependencies.
-- The column-owned index, FK (->profiles) and CHECK constraint drop automatically with their columns.
ALTER TABLE public.sachverstaendige
  DROP COLUMN IF EXISTS sa_vorlage_storage_path,
  DROP COLUMN IF EXISTS sa_vorlage_status,
  DROP COLUMN IF EXISTS sa_vorlage_hochgeladen_am,
  DROP COLUMN IF EXISTS sa_vorlage_geprueft_am,
  DROP COLUMN IF EXISTS sa_vorlage_geprueft_von_user_id,
  DROP COLUMN IF EXISTS sa_vorlage_admin_notiz,
  DROP COLUMN IF EXISTS sa_vorlage_signatur_konfig;

-- sv_sa_vorlage Katalog-Slot ist mit dem Subsystem tot — deaktivieren, damit der
-- generische SV-Uploader ihn nicht mehr annimmt (macht den AAR-360-Code-Guard redundant).
UPDATE public.dokument_katalog SET aktiv = false WHERE slot_id = 'sv_sa_vorlage';
