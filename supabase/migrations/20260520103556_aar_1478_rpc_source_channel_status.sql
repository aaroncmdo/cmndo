-- AAR-1478 (Lead-Audit P1): convert_anfrage_zu_lead schrieb leads ohne
-- source_channel + ohne explizitem status. status hatte zwar DB-Default
-- 'neu' (greift automatisch), aber source_channel war NULL-able ohne
-- Default → Reporting/Analytics-Luecke fuer kfzgutachter-LP-Leads.
--
-- Live-Probe (20.05.2026): 10 Production-Leads mit source_channel=NULL.
-- Alle 10 sind vorname LIKE 'SMOKE%'/'Smoke%' vom 13.05.2026 ohne matching
-- anfragen.lead_id → Test-Smoke-Daten, nicht echter Traffic.
-- → Backfill ist NICHT notwendig fuer Production-Recovery.
--
-- Migration: RPC mappt v_anfrage.quelle → leads.source_channel, plus
-- explizites status='neu'. Idempotenz, Lock-Pattern, Side-Effect-Stubs
-- bleiben 1:1 wie in 20260518193208_convert_anfrage_zu_lead.sql.
--
-- Spec: GitHub Issue #1478, Audit docs/20.05.2026/lead-audit-vertikal-horizontal.md §5 P0-1 + §11.

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

  -- Idempotenz: bereits konvertierte Anfragen geben bestehende lead_id zurueck
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
  -- AAR-1478: source_channel + status explizit. Vorher fehlten beide →
  -- source_channel war NULL, status fiel auf DB-Default 'neu' zurueck.
  -- v_anfrage.quelle entspricht den source_channel-Werten der anderen
  -- Lead-Eintrittspunkte ('kfzgutachter-ads-lp', 'gutachter-finder-termin',
  -- 'makler-partner-form', etc. — wie in den Side-Effect-Stubs unten gemappt).
  INSERT INTO public.leads (
    vorname, nachname, telefon, email, kunde_plz,
    source_channel, status
  )
  VALUES (
    NULLIF(v_vorname, ''),
    v_nachname,
    NULLIF(v_telefon, ''),
    v_anfrage.kontakt_email,
    v_anfrage.kontakt_plz_oder_stadt,
    v_anfrage.quelle,
    'neu'::lead_status
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
  -- abgebrochen, wenn der Caller im autocommit-Modus laeuft (z.B. RPC-Call der
  -- Server-Action) — dann persistiert dieses UPDATE NICHT. In transaktionalen
  -- Caller-Contexts (wo der Caller catched + committed) bleibt es bestehen.
  -- Caller-side-Logging (Server-Action console.error mit anfrage_id) ist die
  -- verlaessliche Failure-Trace.
  UPDATE public.anfragen
     SET konvertier_status = 'failed',
         konvertier_fehler = SQLERRM
   WHERE id = p_anfrage_id;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.convert_anfrage_zu_lead(uuid) IS
  'Atomic Convert Anfrage -> Lead. Idempotent (re-runs returnen lead_id). source_channel = anfragen.quelle, status = neu (explizit gesetzt seit AAR-1478, vorher NULL bzw. DB-Default). Bei Failure: best-effort konvertier_status=failed (rollt bei autocommit-RPC zurueck). Verlaessliche Failure-Trace: Caller-side-Logging mit anfrage_id.';

-- Grants 1:1 wie in der vorherigen Migration. CREATE OR REPLACE FUNCTION
-- behaelt Grants normalerweise, aber wir setzen sie explizit nochmal — falls
-- AAR-894-Grant-Drift-Pattern hier auch zuschlaegt (siehe Issue #1485 RLS-
-- Function-Grant-Sweep).
REVOKE EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.convert_anfrage_zu_lead(uuid)
  TO authenticated, service_role;
