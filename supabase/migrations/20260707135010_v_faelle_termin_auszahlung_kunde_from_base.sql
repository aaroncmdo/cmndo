-- Payment-Ledger Phase 2b: v_faelle_mit_aktuellem_termin liest auszahlung_kunde_* aus v_claim_base
-- (das jetzt aus dem Ledger surft) statt hardcoded NULL. reg/gutachter erben schon automatisch
-- ueber die bare base-Referenzen. Signatur-erhaltend (NULL::typ AS x -> base.x AS x, gleicher Name/Typ/Position).
DO $mig$
DECLARE
  d text;
  a1 text := 'NULL::numeric(10,2) AS auszahlung_kunde_betrag';
  a2 text := 'NULL::timestamp with time zone AS auszahlung_kunde_eingegangen_am';
BEGIN
  d := pg_get_viewdef('public.v_faelle_mit_aktuellem_termin'::regclass, true);
  IF position(a1 in d) = 0 THEN
    RAISE NOTICE 'v_faelle: kunde-NULL-anchor absent; already repointed - skip'; RETURN;
  END IF;
  IF (length(d)-length(replace(d,a1,'')))/length(a1) <> 1 THEN RAISE EXCEPTION 'anchor a1 (kunde_betrag) count <> 1'; END IF;
  IF (length(d)-length(replace(d,a2,'')))/length(a2) <> 1 THEN RAISE EXCEPTION 'anchor a2 (kunde_am) count <> 1'; END IF;
  d := replace(d, a1, 'base.auszahlung_kunde_betrag AS auszahlung_kunde_betrag');
  d := replace(d, a2, 'base.auszahlung_kunde_eingegangen_am AS auszahlung_kunde_eingegangen_am');
  EXECUTE 'CREATE OR REPLACE VIEW public.v_faelle_mit_aktuellem_termin AS ' || d;
END $mig$;
