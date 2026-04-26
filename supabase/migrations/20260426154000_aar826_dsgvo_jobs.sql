-- AAR-826.8: DSGVO-Worker — Anonymisierung + Hard-Delete

-- ─── Anonymisierungs-Funktion (event-driven via auth-Trigger) ────────────────
-- Wird aufgerufen wenn ein Benutzer gelöscht wird.
-- Trigger auf auth.users muss separat im Supabase Dashboard eingerichtet werden.

CREATE OR REPLACE FUNCTION public.dsgvo_anonymize_user_data(
  p_user_id UUID
)
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public, auth
AS $$
BEGIN
  -- airdrop_invitations: Empfänger-PII nullen
  UPDATE public.airdrop_invitations
     SET empfaenger_name    = 'Anonymisiert',
         empfaenger_email   = NULL,
         empfaenger_telefon = NULL
   WHERE invited_by = p_user_id
      OR resulting_party_id IN (
        SELECT id FROM public.claim_parties WHERE created_at < now()
      );

  -- claim_parties: PII anonymisieren (nur über Einladungs-Chain identifizierbar)
  -- claim_parties haben kein user_id FK → Anonymisierung über airdrop-Chain
  -- Vollständige Anonymisierung wenn explizites Delete-Request (Job 2 unten)

  PERFORM public.log_cron_job_run(
    'dsgvo_anonymize',
    'success',
    NULL,
    NULL,
    jsonb_build_object('user_id', p_user_id, 'note', 'PII in airdrop_invitations anonymisiert')
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_anonymize', 'error', NULL, SQLERRM);
END $$;

COMMENT ON FUNCTION public.dsgvo_anonymize_user_data IS
  'AAR-826: DSGVO-Anonymisierung bei User-Deletion. '
  'Aufruf: auth.users AFTER DELETE Trigger (muss separat im Supabase Dashboard eingerichtet werden). '
  'Anonymisiert: airdrop_invitations PII.';

-- ─── Job: DSGVO-Hard-Delete (täglich 04:00) ──────────────────────────────────
-- Löscht PII nach 30d Karenz wenn dsgvo_delete_requests-Tabelle existiert

CREATE OR REPLACE FUNCTION public.cron_dsgvo_hard_delete()
RETURNS VOID LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_count INT := 0;
BEGIN
  -- Stub: nur aktiv wenn dsgvo_delete_requests existiert
  IF to_regclass('public.dsgvo_delete_requests') IS NOT NULL THEN
    EXECUTE $sql$
      UPDATE public.claim_parties cp
         SET vorname    = 'Anonymisiert',
             nachname   = 'Person',
             email      = NULL,
             telefon    = NULL,
             adresse_strasse = NULL,
             adresse_plz     = NULL,
             adresse_ort     = NULL,
             geburtsdatum    = NULL
       WHERE EXISTS (
         SELECT 1 FROM public.dsgvo_delete_requests dr
         WHERE dr.user_id = cp.created_by_user_id
           AND dr.status = 'approved'
           AND dr.approved_at < now() - INTERVAL '30 days'
       )
    $sql$;
    GET DIAGNOSTICS v_count = ROW_COUNT;
  END IF;

  PERFORM public.log_cron_job_run(
    'dsgvo_hard_delete',
    'success',
    v_count,
    NULL,
    jsonb_build_object(
      'note', CASE WHEN v_count > 0
        THEN format('%s claim_parties anonymisiert nach 30d Karenz', v_count)
        ELSE 'Keine pending Delete-Requests oder Tabelle nicht vorhanden'
      END
    )
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_cron_job_run('dsgvo_hard_delete', 'error', NULL, SQLERRM);
END $$;

SELECT cron.schedule(
  'dsgvo_hard_delete',
  '0 4 * * *',
  $$SELECT public.cron_dsgvo_hard_delete()$$
);

COMMENT ON FUNCTION public.cron_dsgvo_hard_delete IS
  'AAR-826: DSGVO Hard-Delete nach 30d Karenz. '
  'Aktiv sobald dsgvo_delete_requests-Tabelle existiert. Täglich 04:00.';
