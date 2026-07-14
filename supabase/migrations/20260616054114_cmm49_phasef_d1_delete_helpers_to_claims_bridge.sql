-- CMM-49 Phase F (Batch D1): die 3 Delete-Helper faelle-frei + post-DROP vollstaendig.
-- Die kanonische 2-arg delete_fall_komplett(fall_id, claim_id) bleibt UNVERAENDERT (sie ist schon
-- DROP-safe: faelle-Delete conditional/dynamic via information_schema-Guard + loescht den Claim).
-- Code ruft ausschliesslich die 2-arg-Variante (faelle/[id]/_actions/core.ts).

-- D1a: delete_fall_komplett(1-arg) — NUR intern von delete_lead_komplett gerufen. Frueher loeschte sie
-- nur faelle + fall-children und LIESS DEN CLAIM ALS ORPHAN (PII-Leak). Jetzt: claim_id via Bridge +
-- an die kanonische 2-arg-Variante delegieren -> vollstaendige, DROP-safe Loeschung inkl. Claim.
CREATE OR REPLACE FUNCTION public.delete_fall_komplett(p_fall_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_claim_id uuid;
BEGIN
  IF p_fall_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: fall_id ist NULL';
  END IF;
  SELECT claim_id INTO v_claim_id FROM public.faelle_claim_bridge WHERE fall_id = p_fall_id;
  PERFORM public.delete_fall_komplett(p_fall_id, v_claim_id);
END;
$function$;

-- D1b: delete_lead_komplett — die Faelle/Claims des Leads via claims.lead_id (SSoT) + Bridge (fall_id)
-- statt faelle; ruft die 2-arg-Variante (vollstaendig inkl. Claim).
CREATE OR REPLACE FUNCTION public.delete_lead_komplett(p_lead_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_fall RECORD;
BEGIN
  IF p_lead_id IS NULL THEN
    RAISE EXCEPTION 'ABBRUCH: lead_id ist NULL';
  END IF;

  SELECT COUNT(*) INTO v_count FROM leads WHERE id = p_lead_id;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'ABBRUCH: Lead % nicht gefunden', p_lead_id;
  END IF;

  FOR v_fall IN
    SELECT c.id AS claim_id, b.fall_id AS fall_id
      FROM public.claims c
      LEFT JOIN public.faelle_claim_bridge b ON b.claim_id = c.id
     WHERE c.lead_id = p_lead_id
  LOOP
    PERFORM public.delete_fall_komplett(v_fall.fall_id, v_fall.claim_id);
  END LOOP;

  BEGIN DELETE FROM flow_links WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM lead_historie WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM timeline WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN DELETE FROM gutachter_termine WHERE lead_id = p_lead_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  DELETE FROM leads WHERE id = p_lead_id;
END;
$function$;

-- D1c: delete_gutachter_komplett — Faelle freigeben via claims.sv_id (SSoT) statt faelle.sv_id.
-- Einzige faelle-Zeile; Rest (sv_id/user_id-gekeyte Deletes, auth.*) unveraendert.
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

  -- CMM-49 Phase F: Faelle freigeben via claims.sv_id (SSoT); der claims->faelle-Sync spiegelt
  -- nach faelle solange es existiert.
  BEGIN UPDATE claims SET sv_id = NULL WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;

  BEGIN DELETE FROM gutachter_abrechnungen WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;
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
