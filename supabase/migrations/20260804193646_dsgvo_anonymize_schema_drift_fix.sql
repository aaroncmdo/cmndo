-- DSGVO-Anonymisierungs-RPC an das heutige Schema anziehen (J7-Journey-Smoke-Fund 04.08.).
--
-- Die Funktion (Stand 20260510095718) referenzierte drei inzwischen gedroppte Spalten-Sets und
-- warf damit bei JEDER Ausfuehrung ab dem ersten toten UPDATE — fuehreLoeschungAus scheiterte
-- prod-sichtbar mit 'Anonymisierung fehlgeschlagen: column "kunde_email" of relation "claims"
-- does not exist' (DSGVO-Ausfuehrung war komplett blockiert):
--   1. claims.kunde_email — ersatzlos gedroppt (kein claims-Email-Snapshot mehr)
--   2. claim_parties.vorname/nachname/email/telefon/adresse_*/geburtsdatum — die Personen-PII
--      lebt seit dem personen-Modell (claim_parties.person_id) nicht mehr auf claim_parties
--   3. faelle.kunde_vorname/.../kunde_id — CMM-49-Abspeckung; der bisherige IF-EXISTS-Guard
--      prueft nur die TABELLE, nicht die Spalten
--
-- Fix = die drei toten UPDATEs entfernen (wo keine Spalte existiert, ist dort keine PII zu
-- scrubben). BEWUSST NICHT angefasst: personen (Aaron-Entscheid 16.06.: bleibt unberuehrt) und
-- die claim_parties-Rest-Spalten (kennzeichen*/verletzungsart/krankenhaus_name/notiz — eigener
-- ist_anonymisiert-Mechanismus vorhanden; Soll-Klaerung = dokumentiertes J7-Follow-up).
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
