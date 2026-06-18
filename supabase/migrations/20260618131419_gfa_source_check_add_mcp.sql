-- MCP Write-API (claimondo_melde_schaden): erlaubt source='mcp' auf gutachter_finder_anfragen.
-- Gleicht gfa_source_check an die EMBED_SOURCES-Enum an (src/lib/schemas/embed-anfrage.ts):
-- {kfz_gutachter_lp, sv_embed, generic_lp, mcp}. Vorher nur {kfz_gutachter_lp, sv_embed} erlaubt
-- (generic_lp stand im Enum, fehlte aber im CHECK). Rein additiv — weitet den CHECK, bricht nichts.
ALTER TABLE public.gutachter_finder_anfragen DROP CONSTRAINT IF EXISTS gfa_source_check;
ALTER TABLE public.gutachter_finder_anfragen ADD CONSTRAINT gfa_source_check
  CHECK ((source IS NULL) OR (source = ANY (ARRAY['kfz_gutachter_lp'::text, 'sv_embed'::text, 'generic_lp'::text, 'mcp'::text])));
