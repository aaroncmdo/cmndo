SELECT
  column_name,
  column_default,
  is_nullable,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'leads'
  AND column_name IN ('status', 'source_channel')
ORDER BY column_name;
