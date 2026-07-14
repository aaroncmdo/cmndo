-- CMM-49 Phase F (Batch D2): dsgvo_anonymize_user_data Entity-aware-Rewrite.
-- FIXT den kaputten Stand: die Fn referenzierte ~13 gedroppte Spalten (claims.kunde_id +
-- claims.kunde_vorname/.../stadt, claim_parties.fall_id, airdrop_invitations.empfaenger_*/invited_by)
-- und warf daher zur Laufzeit -> DSGVO Art.17-Loeschung war in Prod broken. Jetzt schema-korrekt
-- (alle Spalten DB-verifiziert + via Phantom-UUID-Lauf validiert), faelle-frei (conditional/dynamic
-- scrub solange faelle existiert -> DROP-safe), personen (geteilte Entity-Registry) bewusst
-- UNBERUEHRT (Aaron-Entscheidung 16.06.: nur Snapshots scrubben).
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

  -- claims: nur kunde_email (einzige verbliebene Kunde-Snapshot-Spalte auf claims;
  -- Ownership = geschaedigter_user_id). Die uebrige Kunde-Identitaet liegt auf claim_parties (unten).
  UPDATE public.claims
     SET kunde_email = v_anon_email
   WHERE geschaedigter_user_id = p_user_id;

  -- claim_parties: Kunde-/Partei-Stammdaten (Entity-Snapshot). Via created_by ODER claim-Ownership.
  -- personen (geteilte Registry) bleibt bewusst UNBERUEHRT (Aaron-Entscheidung 16.06.).
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

  -- gutachter_finder_anfragen (Self-Dispatch)
  UPDATE public.gutachter_finder_anfragen
     SET vorname = 'Anonymisiert', nachname = NULL,
         email = v_anon_email, telefon = NULL,
         halter_vorname = NULL, halter_nachname = NULL,
         halter_strasse = NULL, halter_plz = NULL, halter_stadt = NULL,
         sa_signatur_data_url = NULL, ocr_rohdaten = NULL
   WHERE konvertiert_zu_user_id = p_user_id OR email = v_user_email;

  -- airdrop_invitations: empfaenger-PII zog nach claim_parties (party-FKs, oben gescrubbt);
  -- verbleibende personenbezogene Daten = IP/User-Agent beim Oeffnen -> scrubben.
  UPDATE public.airdrop_invitations
     SET ip_address_open = NULL, user_agent_open = NULL
   WHERE invited_by_user_id = p_user_id
      OR resulting_user_id = p_user_id
      OR withdrawn_by_user_id = p_user_id;

  -- faelle-Snapshot (PII) scrubben SOLANGE die Tabelle existiert (DROP-safe via Guard);
  -- kunde_email gibt es auf faelle nicht (CMM-44 SP-A -> claims ist SSoT).
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

  PERFORM public.log_cron_job_run(
    'dsgvo_anonymize', 'success', NULL, NULL,
    jsonb_build_object('user_id', p_user_id, 'timestamp', now())
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_anonymize', 'error', NULL, SQLERRM);
  RAISE;
END $function$;
