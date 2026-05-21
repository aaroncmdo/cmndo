-- CMM-44 SP-C1 — live drift-check (UNION-ALL; db query gives only the last resultset for multi-statement).
-- Expect: faelle_kunde_cols=7, cp_target_cols=6, geschaedigter_rows~=45. Note claims_ohne_geschaedigter.
SELECT 'faelle_kunde_cols' AS k, count(*)::text AS v FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle' AND column_name IN ('kunde_vorname','kunde_nachname','kunde_telefon','kunde_strasse','kunde_plz','kunde_stadt','kunde_adresse')
UNION ALL SELECT 'cp_target_cols', count(*)::text FROM information_schema.columns WHERE table_schema='public' AND table_name='claim_parties' AND column_name IN ('vorname','nachname','telefon','adresse_strasse','adresse_plz','adresse_ort')
UNION ALL SELECT 'geschaedigter_rows', (SELECT count(*)::text FROM public.claim_parties WHERE rolle='geschaedigter')
UNION ALL SELECT 'claims_ohne_geschaedigter', (SELECT count(*)::text FROM public.claims c WHERE NOT EXISTS (SELECT 1 FROM public.claim_parties cp WHERE cp.claim_id=c.id AND cp.rolle='geschaedigter'));
