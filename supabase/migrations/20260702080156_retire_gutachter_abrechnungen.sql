-- T6 (Billing-Konsolidierung #3391 Follow-up): gutachter_abrechnungen retiren.
-- Voraussetzung erfuellt: 0 Zeilen, 0 Code-Reader/Writer (alle auf claims.lead_preis_* umgestellt,
-- #3391 in staging+main), keine FKs zeigen drauf, keine Views nutzen sie. Zwei Funktionen
-- referenzierten die Tabelle (delete_fall_komplett/2-arg + delete_gutachter_komplett), beide mit
-- EXCEPTION-Swallow -> DROP waere ohnehin robust; hier sauber bereinigt.
-- gutachter_abrechnungspositionen BLEIBT (zahlungspruefung-Cron + Cascade-Delete nutzen sie noch).
-- Angewendet via apply_migration am 2026-07-02 (getrackte Version 20260702080156).

CREATE OR REPLACE FUNCTION public.delete_fall_komplett(p_fall_id uuid, p_claim_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tbl text;
  v_fall_tables text[] := ARRAY[
    'lead_historie','pflichtdokumente','qc_checkliste','forderungspositionen',
    'zahlungseingaenge','technische_probleme','gutachter_abrechnungspositionen',
    'gutachter_termine','gutachter_mitteilungen',
    'benachrichtigungen','abrechnung_positionen','kanzlei_abrechnung_positionen',
    'makler_provisionen','timeline','tasks','nachrichten','dokumente','fall_dokumente',
    'termine','flow_links'
  ];
  v_claim_tables text[] := ARRAY[
    'technische_probleme','gutachter_abrechnungspositionen',
    'gutachter_mitteilungen','abrechnung_positionen','kanzlei_abrechnung_positionen',
    'makler_provisionen'
  ];
BEGIN
  IF p_fall_id IS NULL AND p_claim_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: fall_id UND claim_id sind beide NULL';
  END IF;

  IF p_fall_id IS NOT NULL THEN
    FOREACH v_tbl IN ARRAY v_fall_tables LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE fall_id = $1', v_tbl) USING p_fall_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  IF p_claim_id IS NOT NULL THEN
    FOREACH v_tbl IN ARRAY v_claim_tables LOOP
      BEGIN
        EXECUTE format('DELETE FROM public.%I WHERE claim_id = $1', v_tbl) USING p_claim_id;
      EXCEPTION WHEN OTHERS THEN NULL; END;
    END LOOP;
  END IF;

  IF p_fall_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema = 'public' AND table_name = 'faelle') THEN
    EXECUTE 'DELETE FROM public.faelle WHERE id = $1' USING p_fall_id;
  END IF;

  IF p_claim_id IS NOT NULL THEN
    DELETE FROM claims WHERE id = p_claim_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_gutachter_komplett(p_sv_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_user_id UUID;
  v_profile_id UUID;
BEGIN
  IF p_sv_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: sv_id ist NULL';
  END IF;

  SELECT COUNT(*) INTO v_count FROM sachverstaendige WHERE id = p_sv_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'ABBRUCH: Gutachter nicht gefunden'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'ABBRUCH: Mehrere Gutachter gefunden'; END IF;

  SELECT user_id, profile_id INTO v_user_id, v_profile_id FROM sachverstaendige WHERE id = p_sv_id;

  BEGIN UPDATE claims SET sv_id = NULL WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN DELETE FROM gutachter_termine WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_mitteilungen WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  DELETE FROM sachverstaendige WHERE id = p_sv_id;

  IF v_profile_id IS NOT NULL THEN
    BEGIN DELETE FROM benachrichtigungen WHERE user_id = v_profile_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM profiles WHERE id = v_profile_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  IF v_user_id IS NOT NULL THEN
    BEGIN DELETE FROM auth.sessions WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.refresh_tokens WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.identities WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.mfa_factors WHERE user_id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
    BEGIN DELETE FROM auth.users WHERE id = v_user_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;
END;
$function$;

DROP TABLE IF EXISTS public.gutachter_abrechnungen;
