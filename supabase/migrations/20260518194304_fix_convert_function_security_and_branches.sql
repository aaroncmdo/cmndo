-- 2026-05-18: Code-Quality-Review-Fixes für convert_anfrage_zu_lead().
--
-- 1. REVOKE EXECUTE FROM PUBLIC: ohne diesen REVOKE konnte anon via
--    Supabase REST die Function aufrufen — Security-Loch.
-- 2. gutachter-finder-termin-Branch auskommentiert: admin_termine.
--    erstellt_von ist NOT NULL, service_role-Aufrufe geben auth.uid()=NULL
--    → garantierter Crash für diesen Channel. Block ist jetzt
--    auskommentiert mit klarem Aktivierungs-Hinweis.
-- 3. COMMENT ON FUNCTION präzisiert: die Persistence-Garantie für
--    konvertier_status='failed' wurde zu großzügig formuliert.
--    plpgsql-Subtransaction rollt bei RAISE die EXCEPTION-Handler-UPDATE
--    mit zurück, wenn der Caller im autocommit-Modus läuft (das ist
--    bei der server-action-rpc() der Fall). Spec-Anpassung folgt.
--
-- Spec: Code-Quality-Review zu docs/superpowers/plans/2026-05-18-anfragen-inbox-implementation.md T2

-- Function neu erstellen mit auskommentiertem gutachter-Branch
CREATE OR REPLACE FUNCTION public.convert_anfrage_zu_lead(p_anfrage_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anfrage   public.anfragen;
  v_lead_id   uuid;
  v_vorname   text;
  v_nachname  text;
  v_telefon   text;
BEGIN
  -- 1. Anfrage holen mit Row-Lock (verhindert parallele Convert-Race)
  SELECT * INTO v_anfrage
  FROM public.anfragen
  WHERE id = p_anfrage_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Anfrage % nicht gefunden', p_anfrage_id;
  END IF;

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurück
  IF v_anfrage.lead_id IS NOT NULL THEN
    RETURN v_anfrage.lead_id;
  END IF;

  -- 2. Name-Split "Max Mustermann" → vorname="Max", nachname="Mustermann"
  v_vorname  := split_part(trim(coalesce(v_anfrage.kontakt_name, '')), ' ', 1);
  v_nachname := NULLIF(
                  substr(trim(coalesce(v_anfrage.kontakt_name, '')),
                         length(v_vorname) + 2),
                  ''
                );
  v_telefon := trim(coalesce(v_anfrage.kontakt_telefon, ''));

  -- 3. Lead anlegen
  INSERT INTO public.leads (vorname, nachname, telefon, email, kunde_plz)
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt
  )
  RETURNING id INTO v_lead_id;

  -- 4. Channel-spezifische Side-Effects
  --
  -- Gutachter-Termin-Channel: aktuell DEAKTIVIERT, weil admin_termine.erstellt_von
  -- NOT NULL ist und auth.uid() bei service_role-Call NULL liefert → garantierter
  -- Crash. Aktivierung erfordert entweder:
  --   a) Eine Migration die admin_termine.erstellt_von nullable macht
  --   b) Einen designierten System-User (uuid-Konstante) als COALESCE-Fallback
  --
  -- IF v_anfrage.quelle = 'gutachter-finder-termin'
  --    AND v_anfrage.payload ? 'vorgesehener_gutachter_id'
  --    AND v_anfrage.payload ? 'termin_start' THEN
  --   INSERT INTO public.admin_termine (
  --     typ, titel, lead_id, sv_id, start_zeit, end_zeit, status, erstellt_von
  --   ) VALUES (
  --     'vor-ort-besichtigung',
  --     'Besichtigung (aus Anfrage)',
  --     v_lead_id,
  --     (v_anfrage.payload->>'vorgesehener_gutachter_id')::uuid,
  --     (v_anfrage.payload->>'termin_start')::timestamptz,
  --     (v_anfrage.payload->>'termin_start')::timestamptz + interval '1 hour',
  --     'offen',
  --     auth.uid()
  --   );
  -- END IF;

  -- Makler-Channel: ebenfalls DEAKTIVIERT (leads.vermittelnder_makler_id existiert nicht).
  -- IF v_anfrage.quelle = 'makler-partner-form'
  --    AND v_anfrage.payload ? 'vermittelnder_makler_id' THEN
  --   UPDATE public.leads
  --      SET vermittelnder_makler_id = (v_anfrage.payload->>'vermittelnder_makler_id')::uuid
  --    WHERE id = v_lead_id;
  -- END IF;

  -- 5. Anfrage als konvertiert markieren
  UPDATE public.anfragen
     SET lead_id           = v_lead_id,
         konvertiert_am    = now(),
         konvertier_status = 'success'
   WHERE id = p_anfrage_id;

  RETURN v_lead_id;

EXCEPTION WHEN OTHERS THEN
  -- Best-effort Failure-Persistence: in plpgsql ist die EXCEPTION-Block-UPDATE
  -- Teil einer impliziten Subtransaction. Bei RAISE wird die outer-Transaction
  -- abgebrochen, wenn der Caller im autocommit-Modus läuft (z.B. RPC-Call der
  -- Server-Action) — dann persistiert dieses UPDATE NICHT. In transaktionalen
  -- Caller-Contexts (wo der Caller catched + committed) bleibt es bestehen.
  -- Caller-side-Logging (Server-Action console.error mit anfrage_id) ist die
  -- verlässliche Failure-Trace.
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.convert_anfrage_zu_lead(uuid) IS
  'Atomic Convert Anfrage → Lead. Idempotent (re-runs returnen lead_id). Bei Failure: Versucht best-effort anfragen.konvertier_status=failed + konvertier_fehler=SQLERRM zu persistieren, aber plpgsql-Subtransaction kann das bei autocommit-RPC-Callern zurückrollen. Verlässliche Failure-Trace: Caller-side-Logging mit anfrage_id.';

-- Security-Lock: weder PUBLIC noch anon darf die Function aufrufen.
-- Supabase erteilt anon beim CREATE FUNCTION einen expliziten EXECUTE-Grant
-- zusätzlich zur PUBLIC-Inheritance — daher beide REVOKE-Zeilen notwendig.
REVOKE EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) FROM anon;

-- Explizite Grants (redundant zu T2, aber dokumentiert)
GRANT EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid)
  TO authenticated, service_role;
