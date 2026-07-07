-- DSGVO Art. 17 — Anonymisierung um Partner-Rollen-PII erweitern.
--
-- dsgvo_anonymize_user_data() scrubte bislang nur Kunden-PII (profiles, claims,
-- claim_parties, leads, gutachter_finder_anfragen, airdrop_invitations, faelle).
-- Loescht sich ein Partner (Makler / Werkstatt / Sachverstaendiger), blieben die
-- rollen-spezifischen Stammdaten (Firma, Adresse, Bank, IHK-/USt-/Zulassungs-Nummern,
-- Standort-Koordinaten) unberuehrt = DSGVO-Luecke. Diese Migration ergaenzt drei
-- UPDATE-Bloecke:
--   makler          WHERE user_id    = p_user_id
--   werkstaetten    WHERE user_id    = p_user_id
--   sachverstaendige WHERE profile_id = p_user_id   (SV hat KEIN user_id — Link ist profile_id)
--
-- Ausserdem: der frueher in fuehreLoeschungAus referenzierte Claims-Count nutzte
-- claims.kunde_id (existiert NICHT) — Ownership ist geschaedigter_user_id. Die
-- Function selbst war hier schon korrekt (claims WHERE geschaedigter_user_id),
-- die App-Seite wird im selben PR angeglichen.

CREATE OR REPLACE FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
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

  -- claims (Ownership = geschaedigter_user_id; kunde_email = einzige Snapshot-Spalte)
  UPDATE public.claims
     SET kunde_email = v_anon_email
   WHERE geschaedigter_user_id = p_user_id;

  -- claim_parties (Entity-Snapshot). personen bleibt UNBERUEHRT (Aaron 16.06.).
  UPDATE public.claim_parties cp
     SET vorname = 'Anonymisiert', nachname = 'Person',
         email = NULL, telefon = NULL,
         adresse_strasse = NULL, adresse_plz = NULL,
         adresse_ort = NULL, geburtsdatum = NULL
   WHERE cp.created_by_user_id = p_user_id
      OR cp.claim_id IN (SELECT id FROM public.claims WHERE geschaedigter_user_id = p_user_id);

  -- leads
  UPDATE public.leads
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         schadens_hergang = '[Anonymisiert nach DSGVO Art. 17]'
   WHERE kunde_id = p_user_id OR email = v_user_email;

  -- gutachter_finder_anfragen
  UPDATE public.gutachter_finder_anfragen
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         halter_vorname = NULL, halter_nachname = NULL,
         halter_strasse = NULL, halter_plz = NULL, halter_stadt = NULL,
         sa_signatur_data_url = NULL, ocr_rohdaten = NULL
   WHERE konvertiert_zu_user_id = p_user_id OR email = v_user_email;

  -- airdrop_invitations
  UPDATE public.airdrop_invitations
     SET ip_address_open = NULL, user_agent_open = NULL
   WHERE invited_by_user_id = p_user_id
      OR resulting_user_id = p_user_id
      OR withdrawn_by_user_id = p_user_id;

  -- faelle-Snapshot (DROP-safe Guard)
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'faelle') THEN
    EXECUTE $q$
      UPDATE public.faelle
         SET kunde_vorname = 'Anonymisiert', kunde_nachname = NULL,
             kunde_telefon = NULL,
             kunde_strasse = NULL, kunde_plz = NULL, kunde_stadt = NULL
       WHERE kunde_id = $1
    $q$ USING p_user_id;
  END IF;

  -- Partner-Rollen-PII (makler/werkstaetten/sachverstaendige). Name/Email/Telefon liegen bei
  -- makler/werkstatt teils redundant hier + immer auf profiles (oben gescrubbt); hier zusaetzlich
  -- die rollen-spezifischen Stammdaten (Firma, Adresse, Bank, Zulassungs-/Steuernummern, Standort).
  -- Greift nur, wenn der geloeschte User ein Partner ist.
  UPDATE public.makler
     SET firma = 'Anonymisiert', ansprechpartner_vorname = 'Anonymisiert',
         ansprechpartner_nachname = 'Person', email = v_anon_email, telefon = NULL,
         adresse_strasse = NULL, adresse_plz = NULL, adresse_ort = NULL,
         bank_iban = NULL, bank_bic = NULL, bank_kontoinhaber = NULL,
         ihk_nummer = NULL, ust_id = NULL
   WHERE user_id = p_user_id;

  UPDATE public.werkstaetten
     SET name = 'Anonymisiert', ansprechpartner_name = NULL,
         email = v_anon_email, telefon = NULL,
         adresse_strasse = NULL, adresse_plz = NULL, adresse_ort = NULL,
         bank_iban = NULL, bank_bic = NULL, bank_kontoinhaber = NULL,
         ust_id = NULL, website = NULL
   WHERE user_id = p_user_id;

  UPDATE public.sachverstaendige
     SET firmenname = 'Anonymisiert', standort_adresse = NULL,
         standort_plz = NULL, gebiet_plz = NULL,
         standort_lat = NULL, standort_lng = NULL, standort_place_id = NULL,
         dat_nummer = NULL, bvsk_mitgliedsnummer = NULL,
         ihk_zertifikat_nummer = NULL, oebuv_bestellungsnummer = NULL,
         steuernummer = NULL, ust_id = NULL
   WHERE profile_id = p_user_id;

  PERFORM public.log_cron_job_run(
    'dsgvo_anonymize', 'success', NULL, NULL,
    jsonb_build_object('user_id', p_user_id, 'timestamp', now())
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_anonymize', 'error', NULL, SQLERRM);
  RAISE;
END $function$;
