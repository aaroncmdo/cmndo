-- CMM-44 SP-C1 — post-apply verify (UNION-ALL; db query returns only the last resultset).
-- geschaedigter_mit_vorname: should be >= pre-apply (COALESCE may fill NULLs).
-- mismatch_vorname: cp.vorname AND faelle.kunde_vorname both set but different (snapshot drift; COALESCE never overwrites -> unchanged by backfill).
-- view_vorname_mismatch_vs_cp: after view repoint, v.kunde_vorname must equal cp.vorname (expect 0).
-- view_vs_faelle_rowcount_delta: LATERAL LIMIT 1 must not fan out (expect 0).
SELECT 'geschaedigter_mit_vorname' AS k, count(*)::text AS v FROM public.claim_parties WHERE rolle='geschaedigter' AND vorname IS NOT NULL
UNION ALL SELECT 'mismatch_vorname', (SELECT count(*)::text FROM public.claim_parties cp JOIN public.faelle f ON f.claim_id=cp.claim_id WHERE cp.rolle='geschaedigter' AND f.kunde_vorname IS NOT NULL AND cp.vorname IS NOT NULL AND cp.vorname IS DISTINCT FROM f.kunde_vorname)
UNION ALL SELECT 'view_vorname_mismatch_vs_cp', (SELECT count(*)::text FROM public.v_faelle_mit_aktuellem_termin v JOIN public.claim_parties cp ON cp.claim_id=v.claim_id AND cp.rolle='geschaedigter' WHERE v.kunde_vorname IS DISTINCT FROM cp.vorname)
UNION ALL SELECT 'view_vs_faelle_rowcount_delta', ((SELECT count(*) FROM public.v_faelle_mit_aktuellem_termin) - (SELECT count(*) FROM public.faelle))::text;
