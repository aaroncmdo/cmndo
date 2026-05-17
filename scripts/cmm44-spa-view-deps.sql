SELECT c.relname AS view, pg_get_viewdef(c.oid) AS def
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
  AND c.relname IN ('faelle_kunde_view','faelle_sv_view','v_claim_full',
                    'v_claim_listing','v_claim_timeline','v_faelle_mit_aktuellem_termin');
