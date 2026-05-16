-- CMM-60 Schritt-2b Struktur-Verifikation von v_claim_sv.
SELECT chk, result FROM (
  SELECT 1 AS ord, 'v_claim_sv existiert' AS chk,
         EXISTS (SELECT 1 FROM information_schema.views
                 WHERE table_schema='public' AND table_name='v_claim_sv')::text AS result
  UNION ALL
  SELECT 2, 'security_invoker=true',
         (SELECT (reloptions @> ARRAY['security_invoker=true'])::text
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public' AND c.relname='v_claim_sv')
  UNION ALL
  SELECT 3, 'Spaltenzahl = 61',
         ((SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='v_claim_sv') = 61)::text
  UNION ALL
  SELECT 4, 'keine der 21 ausgeschlossenen Spalten im View',
         ((SELECT count(*) FROM information_schema.columns
           WHERE table_schema='public' AND table_name='v_claim_sv'
             AND column_name IN (
               'kanzlei_ansprechpartner_email','kanzlei_ansprechpartner_name',
               'kanzlei_ansprechpartner_telefon','kanzlei_uebergeben_am',
               'kanzlei_wunsch','kanzlei_wunsch_gefragt_am',
               'kanzlei_wunsch_gefragt_in_phase','regulierungs_betrag',
               'created_by_user_id','created_via','endzustand_gesetzt_am',
               'endzustand_gesetzt_durch_user_id','endzustand_grund',
               'verjaehrt_am','vs_ablehnungs_grund','lead_id',
               'geschaedigter_user_id','kunde_email','finanzierungsgeber_name',
               'finanzierungsgeber_adresse','finanzierungsgeber_vertragsnr'
             )) = 0)::text
) q ORDER BY ord;
