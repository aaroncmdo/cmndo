-- DSGVO Art. 17 — Recht auf Vergessenwerden.
--
-- AAR-826 hatte den Cron-Job + Anonymisierungs-Function-Stub angelegt aber
-- die Request-Tabelle nie definiert. Das holt diese Migration nach + erweitert
-- die Anonymisierungs-Function um alle PII-tragenden Tabellen.
--
-- Strategie: Anonymisierung statt Hard-Delete weil:
-- 1) Aufbewahrungspflichten — Gutachten + Schadens-Kommunikation 10 Jahre
--    (HGB §257, AO §147).
-- 2) Aktive Mandate dürfen nicht stillschweigend verschwinden — Versicherungs-
--    Korrespondenz muss noch abschliessbar sein.
-- 3) auth.users wird hart gelöscht (entfernt Login + jegliche aktive Session).

CREATE TABLE IF NOT EXISTS public.dsgvo_loeschauftraege (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text NOT NULL,
  status text NOT NULL DEFAULT 'eingereicht'
    CHECK (status IN ('eingereicht', 'bestaetigt', 'ausgefuehrt', 'abgelehnt', 'storniert')),
  grund text,
  eingereicht_am timestamptz NOT NULL DEFAULT now(),
  eingereicht_von text NOT NULL DEFAULT 'self_service'
    CHECK (eingereicht_von IN ('self_service', 'email_anfrage', 'admin_manuell')),
  bestaetigt_am timestamptz,
  bestaetigt_von_user_id uuid REFERENCES auth.users(id),
  ausgefuehrt_am timestamptz,
  abgelehnt_grund text,
  audit_payload jsonb,
  CONSTRAINT chk_bestaetigt_logic CHECK (
    (status IN ('eingereicht', 'storniert', 'abgelehnt')) OR
    (status IN ('bestaetigt', 'ausgefuehrt') AND bestaetigt_am IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS dsgvo_loeschauftraege_user_id_idx
  ON public.dsgvo_loeschauftraege(user_id);
CREATE INDEX IF NOT EXISTS dsgvo_loeschauftraege_status_bestaetigt_idx
  ON public.dsgvo_loeschauftraege(status, bestaetigt_am)
  WHERE status = 'bestaetigt';

COMMENT ON TABLE public.dsgvo_loeschauftraege IS
  'DSGVO Art. 17 Loesch-Antraege. 14d-Karenz nach Bestaetigung. Cron fuehrt aus.';

-- Erweiterte Anonymisierungs-Function (umfasst nun alle PII-Tabellen)
CREATE OR REPLACE FUNCTION public.dsgvo_anonymize_user_data(
  p_user_id UUID
)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
DECLARE
  v_anon_email text := 'deleted-' || p_user_id::text || '@deleted.invalid';
  v_user_email text;
BEGIN
  SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

  -- profiles
  UPDATE public.profiles
     SET vorname = NULL, nachname = NULL,
         anzeigename = 'Anonymisiert', email = v_anon_email,
         telefon = NULL, avatar_url = NULL, profilbeschreibung = NULL
   WHERE id = p_user_id;

  -- claims (Kunden-Snapshot in der SSoT)
  UPDATE public.claims c
     SET kunde_vorname = 'Anonymisiert', kunde_nachname = NULL,
         kunde_email = v_anon_email, kunde_telefon = NULL,
         kunde_strasse = NULL, kunde_plz = NULL, kunde_stadt = NULL
   WHERE c.kunde_id = p_user_id
      OR c.id IN (SELECT claim_id FROM public.faelle WHERE kunde_id = p_user_id);

  -- faelle (Snapshot)
  UPDATE public.faelle
     SET kunde_vorname = 'Anonymisiert', kunde_nachname = NULL,
         kunde_email = v_anon_email, kunde_telefon = NULL,
         kunde_strasse = NULL, kunde_plz = NULL, kunde_stadt = NULL
   WHERE kunde_id = p_user_id;

  -- leads
  UPDATE public.leads
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         schadens_hergang = '[Anonymisiert nach DSGVO Art. 17]'
   WHERE kunde_id = p_user_id OR email = v_user_email;

  -- gutachter_finder_anfragen (Self-Dispatch)
  UPDATE public.gutachter_finder_anfragen
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         halter_vorname = NULL, halter_nachname = NULL,
         halter_strasse = NULL, halter_plz = NULL, halter_stadt = NULL,
         sa_signatur_data_url = NULL, ocr_rohdaten = NULL
   WHERE konvertiert_zu_user_id = p_user_id OR email = v_user_email;

  -- airdrop_invitations (aus AAR-826 erweitert)
  UPDATE public.airdrop_invitations
     SET empfaenger_name = 'Anonymisiert',
         empfaenger_email = NULL, empfaenger_telefon = NULL
   WHERE invited_by = p_user_id;

  -- claim_parties (Geschaedigter/Verursacher-Stammdaten)
  UPDATE public.claim_parties cp
     SET vorname = 'Anonymisiert', nachname = 'Person',
         email = NULL, telefon = NULL,
         adresse_strasse = NULL, adresse_plz = NULL,
         adresse_ort = NULL, geburtsdatum = NULL
   WHERE cp.created_by_user_id = p_user_id
      OR cp.fall_id IN (SELECT id FROM public.faelle WHERE kunde_id = p_user_id);

  PERFORM public.log_cron_job_run(
    'dsgvo_anonymize', 'success', NULL, NULL,
    jsonb_build_object('user_id', p_user_id, 'timestamp', now())
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_anonymize', 'error', NULL, SQLERRM);
  RAISE;
END $$;

COMMENT ON FUNCTION public.dsgvo_anonymize_user_data IS
  'DSGVO Art. 17 Anonymisierung. Wirkt auf profiles, claims, faelle, leads, gutachter_finder_anfragen, airdrop_invitations, claim_parties.';

-- RLS auf die Antrags-Tabelle
ALTER TABLE public.dsgvo_loeschauftraege ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dsgvo_loesch_self_read" ON public.dsgvo_loeschauftraege
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "dsgvo_loesch_self_insert" ON public.dsgvo_loeschauftraege
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
