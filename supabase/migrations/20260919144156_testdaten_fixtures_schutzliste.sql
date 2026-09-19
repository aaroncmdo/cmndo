-- Schutzliste fuer Test-Fixtures (19.09.2026, Nachtrag zu 20260919143408).
--
-- Der erste Lauf von cron_testdaten_aufraeumen hat CLM-2026-00816 mitgenommen -- die Fixture von
-- scripts/smoke/werkstatt-auszahlungsart-smoke.mjs mit Lead smoke-embed-e2e@claimondo.test. Sie
-- traegt keine UUID-Musterkennung (...-0000-4000-8000-...) und ihr Lead hat eine Wegwerf-E-Mail;
-- fuer den Cron sah sie aus wie jeder andere Rest. Aus dem Snapshot wiederhergestellt.
-- Lehre: Fixtures werden DEKLARIERT, nicht erraten. Diese Tabelle ist die Deklaration; der Cron
-- prueft sie fuer jeden Kandidaten (Leads, Faelle, SV, Werkstaetten, Firmen, Konten, Fahrzeuge).
-- Bewusst KEIN Fremdschluessel: eine deklarierte Fixture darf fehlen, ohne dass die Liste bricht,
-- und die Liste darf eine Fixture nennen, bevor ein Seed sie anlegt.
CREATE TABLE IF NOT EXISTS public.testdaten_fixtures (
  id uuid PRIMARY KEY,
  tabelle text NOT NULL CHECK (tabelle IN ('leads', 'claims', 'profiles', 'werkstaetten', 'firmen', 'sachverstaendige', 'vehicles')),
  grund text NOT NULL,
  angelegt_am timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.testdaten_fixtures IS 'Deklarierte Test-Fixtures, die cron_testdaten_aufraeumen nie loescht (Regel-4-/Smoke-Skripte). Kein FK, absichtlich.';
ALTER TABLE public.testdaten_fixtures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.testdaten_fixtures FROM anon, authenticated;

-- Deklarationen ohne harte UUIDs (Replay-sicher: auf leerer DB einfach 0 Zeilen).
INSERT INTO public.testdaten_fixtures (id, tabelle, grund)
SELECT id, 'claims', 'CLM-2026-00816 - Fixture scripts/smoke/werkstatt-auszahlungsart-smoke.mjs' FROM public.claims WHERE claim_nummer = 'CLM-2026-00816'
UNION ALL SELECT lead_id, 'leads', 'Lead zu CLM-2026-00816 (smoke-embed-e2e@claimondo.test)' FROM public.claims WHERE claim_nummer = 'CLM-2026-00816' AND lead_id IS NOT NULL
UNION ALL SELECT id, 'claims', 'CLM-2026-01603 - smoke-kunde@, T4-/kunde-termin-funnel-Smokes' FROM public.claims WHERE claim_nummer = 'CLM-2026-01603'
UNION ALL SELECT id, 'claims', 'CLM-2026-00935 - flotte.test@, termine-hub-smoke.spec.ts' FROM public.claims WHERE claim_nummer = 'CLM-2026-00935'
UNION ALL SELECT id, 'werkstaetten', 'Test Werkstatt - provisionen-*-smoke.spec.ts' FROM public.werkstaetten WHERE name = 'Test Werkstatt'
UNION ALL SELECT id, 'firmen', 'Test-Flotte GmbH (Smoke) - zb1-batch / notif-flotte / provisionen-verrechnung' FROM public.firmen WHERE name = 'Test-Flotte GmbH (Smoke)'
UNION ALL SELECT s.id, 'sachverstaendige', 'Test-SV Brandt - quali-gutachter-bindung-c1 / smoke-kundenfunnel-szenarien' FROM public.sachverstaendige s JOIN public.profiles p ON p.id = s.profile_id WHERE p.email = 'nicolas.kitta+testsv@claimondo.de'
UNION ALL SELECT s.id, 'sachverstaendige', 'test-sv@claimondo.de - kanonischer Test-SV' FROM public.sachverstaendige s JOIN public.profiles p ON p.id = s.profile_id WHERE p.email = 'test-sv@claimondo.de'
ON CONFLICT (id) DO NOTHING;

-- Cron-Funktion: identisch zu 20260919143408, plus Schutzliste in jeder Kandidatenmenge.
CREATE OR REPLACE FUNCTION public.cron_testdaten_aufraeumen()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_alter interval := interval '48 hours';
  v_leads uuid[]; v_claims uuid[]; v_termine uuid[]; v_sv uuid[]; v_ws uuid[]; v_firmen uuid[]; v_prof uuid[];
  n_termine int := 0; n_tasks int := 0; n_gfa int := 0; n_claims int := 0; n_leads int := 0;
  n_sv int := 0; n_ws int := 0; n_firmen int := 0; n_prof int := 0; n_veh int := 0; n_mitt int := 0;
BEGIN
  BEGIN
    -- 1) Kandidaten (Schutzliste testdaten_fixtures gilt ueberall)
    SELECT coalesce(array_agg(l.id), '{}'::uuid[]) INTO v_leads
      FROM public.leads l
     WHERE l.created_at < now() - v_alter
       AND l.id::text NOT LIKE '%-0000-4000-8000-%'
       AND l.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND (public.ist_wegwerf_email(l.email)
            OR (l.email IS NULL AND (l.vorname IN ('Smoke', 'Abnahme') OR l.vorname ILIKE 'SMOKE-%')));

    SELECT coalesce(array_agg(c.id), '{}'::uuid[]) INTO v_claims
      FROM public.claims c
      LEFT JOIN public.profiles p ON p.id = c.geschaedigter_user_id
     WHERE c.created_at < now() - v_alter
       AND c.id::text NOT LIKE '%-0000-4000-8000-%'
       AND c.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND (c.lead_id = ANY(v_leads) OR public.ist_wegwerf_email(p.email) OR c.ist_testfall = true);

    SELECT coalesce(array_agg(s.id), '{}'::uuid[]) INTO v_sv
      FROM public.sachverstaendige s
      JOIN public.profiles p ON p.id = s.profile_id
     WHERE s.created_at < now() - v_alter
       AND s.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND public.ist_wegwerf_email(p.email)
       AND NOT EXISTS (SELECT 1 FROM public.auftraege a WHERE a.sv_id = s.id)
       AND NOT EXISTS (SELECT 1 FROM public.gutachten g WHERE g.sv_id = s.id);

    SELECT coalesce(array_agg(w.id), '{}'::uuid[]) INTO v_ws
      FROM public.werkstaetten w
     WHERE w.created_at < now() - v_alter AND w.name ~ '^SMOKE '
       AND w.id NOT IN (SELECT id FROM public.testdaten_fixtures);

    SELECT coalesce(array_agg(f.id), '{}'::uuid[]) INTO v_firmen
      FROM public.firmen f
     WHERE f.created_at < now() - v_alter
       AND f.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND (f.name LIKE 'Throwaway-Flotte-%' OR f.name LIKE 'SMOKE-J2%');

    SELECT coalesce(array_agg(gt.id), '{}'::uuid[]) INTO v_termine
      FROM public.gutachter_termine gt
     WHERE gt.lead_id = ANY(v_leads) OR gt.claim_id = ANY(v_claims) OR gt.fall_id = ANY(v_claims)
        OR (gt.bezug_typ = 'lead' AND gt.bezug_id = ANY(v_leads))
        OR (gt.bezug_typ IN ('claim', 'fall') AND gt.bezug_id = ANY(v_claims))
        OR gt.assignee_id = ANY(v_sv)
        OR (gt.bezug_typ = 'lead' AND gt.bezug_id IS NOT NULL AND gt.created_at < now() - v_alter
            AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = gt.bezug_id));

    -- 2) Blocker und Kinder der Faelle/Leads
    DELETE FROM public.abrechnung_positionen WHERE claim_id = ANY(v_claims) OR fall_id = ANY(v_claims);
    DELETE FROM public.gutachter_abrechnungspositionen WHERE claim_id = ANY(v_claims) OR fall_id = ANY(v_claims);
    DELETE FROM public.kanzlei_abrechnung_positionen WHERE claim_id = ANY(v_claims) OR fall_id = ANY(v_claims);
    DELETE FROM public.partner_provisionen WHERE claim_id = ANY(v_claims) OR lead_id = ANY(v_leads);
    DELETE FROM public.gutschriften WHERE referenz_fall_id = ANY(v_claims) OR sv_id = ANY(v_sv);
    DELETE FROM public.technische_probleme WHERE claim_id = ANY(v_claims);
    DELETE FROM public.auftraege WHERE claim_id = ANY(v_claims) OR fall_id = ANY(v_claims);
    DELETE FROM public.gutachter_termine WHERE id = ANY(v_termine);
    GET DIAGNOSTICS n_termine = ROW_COUNT;
    UPDATE public.tasks SET gate_task_id = NULL
     WHERE gate_task_id IN (SELECT id FROM public.tasks x WHERE x.lead_id = ANY(v_leads) OR x.claim_id = ANY(v_claims)
                              OR x.fall_id = ANY(v_claims) OR x.entity_id = ANY(v_claims) OR x.entity_id = ANY(v_leads) OR x.entity_id = ANY(v_termine));
    DELETE FROM public.tasks x
     WHERE x.lead_id = ANY(v_leads) OR x.claim_id = ANY(v_claims) OR x.fall_id = ANY(v_claims)
        OR x.entity_id = ANY(v_claims) OR x.entity_id = ANY(v_leads) OR x.entity_id = ANY(v_termine);
    GET DIAGNOSTICS n_tasks = ROW_COUNT;
    DELETE FROM public.gutachter_finder_anfragen g
     WHERE g.erstellt_am < now() - v_alter
       AND (g.konvertiert_zu_lead_id = ANY(v_leads) OR g.konvertiert_zu_fall_id = ANY(v_claims) OR g.fall_id = ANY(v_claims)
            OR public.ist_wegwerf_email(g.email) OR g.reservierter_sv_id = ANY(v_sv) OR g.zugeordneter_sv_id = ANY(v_sv)
            OR g.termin_id = ANY(v_termine));
    GET DIAGNOSTICS n_gfa = ROW_COUNT;
    DELETE FROM public.nachrichten WHERE lead_id = ANY(v_leads) OR claim_id = ANY(v_claims) OR fall_id = ANY(v_claims);
    DELETE FROM public.email_log WHERE lead_id = ANY(v_leads) OR claim_id = ANY(v_claims) OR fall_id = ANY(v_claims)
       OR (lead_id IS NULL AND claim_id IS NULL AND fall_id IS NULL AND public.ist_wegwerf_email(empfaenger) AND created_at < now() - v_alter);
    DELETE FROM public.mitteilungen WHERE kontext_id = ANY(v_claims) OR kontext_id = ANY(v_leads) OR kontext_id = ANY(v_termine);
    GET DIAGNOSTICS n_mitt = ROW_COUNT;
    DELETE FROM public.whatsapp_inbound_messages WHERE matched_lead_id = ANY(v_leads) OR matched_fall_id = ANY(v_claims) OR matched_termin_id = ANY(v_termine);
    DELETE FROM public.fall_dokumente WHERE claim_id = ANY(v_claims) OR lead_id = ANY(v_leads) OR fall_id = ANY(v_claims);
    DELETE FROM public.pflichtdokumente WHERE claim_id = ANY(v_claims) OR fall_id = ANY(v_claims) OR sv_id = ANY(v_sv);
    DELETE FROM public.reparatur_termine WHERE claim_id = ANY(v_claims) OR werkstatt_id = ANY(v_ws);

    -- 3) Faelle und Leads
    DELETE FROM public.claims WHERE id = ANY(v_claims);
    GET DIAGNOSTICS n_claims = ROW_COUNT;
    DELETE FROM public.leads WHERE id = ANY(v_leads);
    GET DIAGNOSTICS n_leads = ROW_COUNT;

    -- 4) Stammdaten
    DELETE FROM public.sv_kalender_events_cache WHERE sv_id = ANY(v_sv);
    DELETE FROM public.sachverstaendige WHERE id = ANY(v_sv);
    GET DIAGNOSTICS n_sv = ROW_COUNT;
    DELETE FROM public.werkstaetten w WHERE w.id = ANY(v_ws)
       AND NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.werkstatt_id = w.id OR c.reparatur_werkstatt_id = w.id)
       AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.werkstatt_id = w.id OR l.reparatur_werkstatt_id = w.id)
       AND NOT EXISTS (SELECT 1 FROM public.gutachter_finder_anfragen g WHERE g.werkstatt_id = w.id);
    GET DIAGNOSTICS n_ws = ROW_COUNT;
    DELETE FROM public.firmen WHERE id = ANY(v_firmen);
    GET DIAGNOSTICS n_firmen = ROW_COUNT;

    -- 5) Konten: Wegwerf-E-Mail, aelter als 48 h, ohne verbleibende Faelle/Leads/SV/Werkstatt
    SELECT coalesce(array_agg(p.id), '{}'::uuid[]) INTO v_prof
      FROM public.profiles p
     WHERE p.created_at < now() - v_alter
       AND p.id::text NOT LIKE '%-0000-4000-8000-%'
       AND p.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND public.ist_wegwerf_email(p.email)
       AND p.rolle::text NOT IN ('admin', 'kundenbetreuer', 'kanzlei')
       AND NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.geschaedigter_user_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.kunde_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.sachverstaendige s WHERE s.profile_id = p.id)
       AND NOT EXISTS (SELECT 1 FROM public.werkstaetten w WHERE w.user_id = p.id);
    DELETE FROM public.mitteilungen WHERE empfaenger_id = ANY(v_prof) OR absender_id = ANY(v_prof);
    UPDATE public.tasks SET zugewiesen_an = NULL WHERE zugewiesen_an = ANY(v_prof);
    UPDATE public.tasks SET empfaenger_user_id = NULL WHERE empfaenger_user_id = ANY(v_prof);
    UPDATE public.timeline SET erstellt_von = NULL WHERE erstellt_von = ANY(v_prof);
    UPDATE public.nachrichten SET sender_id = NULL WHERE sender_id = ANY(v_prof);
    UPDATE public.gutachter_termine SET kb_id = NULL WHERE kb_id = ANY(v_prof);
    UPDATE public.claims SET netzwerk_owner_id = NULL WHERE netzwerk_owner_id = ANY(v_prof);
    UPDATE public.claims SET endzustand_gesetzt_durch_user_id = NULL WHERE endzustand_gesetzt_durch_user_id = ANY(v_prof);
    UPDATE public.werkstaetten SET aktiviert_von = NULL WHERE aktiviert_von = ANY(v_prof);
    UPDATE public.sachverstaendige SET verifiziert_von = NULL WHERE verifiziert_von = ANY(v_prof);
    UPDATE public.sachverstaendige SET gesperrt_von_user_id = NULL WHERE gesperrt_von_user_id = ANY(v_prof);
    UPDATE public.profiles SET netzwerk_owner_id = NULL WHERE netzwerk_owner_id = ANY(v_prof);
    UPDATE public.organisationen SET parent_user_id = NULL WHERE parent_user_id = ANY(v_prof);
    UPDATE public.qc_checkliste SET geprueft_von = NULL WHERE geprueft_von = ANY(v_prof);
    UPDATE public.webhook_events SET user_id = NULL WHERE user_id = ANY(v_prof);
    UPDATE public.gutachter_finder_anfragen SET abrechnung_storno_durch_user_id = NULL WHERE abrechnung_storno_durch_user_id = ANY(v_prof);
    UPDATE public.netzwerk_einladungen SET eingeloest_profil_id = NULL WHERE eingeloest_profil_id = ANY(v_prof);
    UPDATE public.levelup_termine SET betreuer_id = NULL WHERE betreuer_id = ANY(v_prof);
    UPDATE public.levelup_praesentationen SET erstellt_von = NULL WHERE erstellt_von = ANY(v_prof);
    UPDATE public.levelup_auswertungslinks SET erstellt_von = NULL WHERE erstellt_von = ANY(v_prof);
    UPDATE public.linkedin_posts SET freigegeben_von = NULL WHERE freigegeben_von = ANY(v_prof);
    UPDATE public.linkedin_oauth_tokens SET connected_by = NULL WHERE connected_by = ANY(v_prof);
    DELETE FROM auth.users WHERE id = ANY(v_prof);
    GET DIAGNOSTICS n_prof = ROW_COUNT;
    DELETE FROM auth.users u
     WHERE u.created_at < now() - v_alter
       AND public.ist_wegwerf_email(u.email)
       AND u.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);

    -- 6) Fahrzeuge ohne jeden Bezug
    DELETE FROM public.vehicles v
     WHERE v.created_at < now() - v_alter
       AND v.id NOT IN (SELECT id FROM public.testdaten_fixtures)
       AND NOT EXISTS (SELECT 1 FROM public.claims c WHERE c.vehicle_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.leads l WHERE l.vehicle_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.claim_vehicle_involvements i WHERE i.vehicle_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.flotten_fahrzeuge f WHERE f.vehicle_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.schadenkarten s WHERE s.fahrzeug_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.repairs r WHERE r.vehicle_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.claim_mietwagen m WHERE m.vehicle_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.claim_parties cp WHERE cp.vehicle_id = v.id);
    GET DIAGNOSTICS n_veh = ROW_COUNT;

    PERFORM public.log_cron_job_run('testdaten_aufraeumen', 'success',
      n_claims + n_leads + n_termine + n_tasks + n_gfa + n_sv + n_ws + n_firmen + n_prof + n_veh, NULL,
      jsonb_build_object('claims', n_claims, 'leads', n_leads, 'termine', n_termine, 'tasks', n_tasks, 'gfa', n_gfa,
                         'mitteilungen', n_mitt, 'sv', n_sv, 'werkstaetten', n_ws, 'firmen', n_firmen,
                         'konten', n_prof, 'vehicles', n_veh, 'alter', v_alter::text));
  EXCEPTION WHEN OTHERS THEN
    PERFORM public.log_cron_job_run('testdaten_aufraeumen', 'error', NULL, SQLERRM);
  END;
END;
$function$;
