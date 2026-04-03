-- KFZ-122: Gutachter endgültig löschen (bereits via Supabase MCP deployed)
-- NULL-Check + COUNT-Check, SECURITY DEFINER
CREATE OR REPLACE FUNCTION delete_gutachter_komplett(p_sv_id UUID)
RETURNS void AS $$
DECLARE
  v_count INTEGER;
  v_user_id UUID;
  v_profile_id UUID;
BEGIN
  IF p_sv_id IS NULL THEN RAISE EXCEPTION 'ABBRUCH: sv_id ist NULL'; END IF;
  SELECT COUNT(*) INTO v_count FROM sachverstaendige WHERE id = p_sv_id;
  IF v_count = 0 THEN RAISE EXCEPTION 'ABBRUCH: Gutachter nicht gefunden'; END IF;
  IF v_count > 1 THEN RAISE EXCEPTION 'ABBRUCH: Mehrere Gutachter gefunden'; END IF;

  SELECT user_id, profile_id INTO v_user_id, v_profile_id FROM sachverstaendige WHERE id = p_sv_id;

  BEGIN UPDATE faelle SET sv_id = NULL WHERE sv_id = p_sv_id; EXCEPTION WHEN OTHERS THEN NULL; END;
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
