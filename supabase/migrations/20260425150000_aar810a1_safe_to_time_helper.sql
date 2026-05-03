-- AAR-810 A.1.1: Helper für sicheres Time-Parsing (text -> time)
-- analog zu safe_to_date aus AAR-773

CREATE OR REPLACE FUNCTION public.safe_to_time(p_text text)
RETURNS time
LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE AS $$
DECLARE v time;
BEGIN
  IF p_text IS NULL OR trim(p_text) = '' THEN RETURN NULL; END IF;

  -- HH:MM oder HH:MM:SS
  IF p_text ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
    BEGIN v := p_text::time; RETURN v;
    EXCEPTION WHEN others THEN RETURN NULL; END;
  END IF;

  -- HH.MM (Punkt statt Doppelpunkt)
  IF p_text ~ '^\d{1,2}\.\d{2}$' THEN
    BEGIN v := replace(p_text, '.', ':')::time; RETURN v;
    EXCEPTION WHEN others THEN RETURN NULL; END;
  END IF;

  RETURN NULL;
END $$;

COMMENT ON FUNCTION public.safe_to_time IS 'AAR-810 A.1: parsed unterschiedliche Time-Strings sicher ohne Exception. Akzeptiert HH:MM, HH:MM:SS, HH.MM.';
