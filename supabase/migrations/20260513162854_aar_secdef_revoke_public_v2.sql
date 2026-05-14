-- SECURITY DEFINER Functions — REVOKE EXECUTE für non-public-Functions (2/2).
--
-- Fix für die vorherige Migration (aar_secdef_revoke_public): Postgres-
-- Default-Function-ACL ist `=X/postgres` → PUBLIC hat implizit EXECUTE.
-- REVOKE FROM anon/authenticated alleine reicht nicht — PUBLIC bleibt
-- erhalten und alle Login-Rollen erben das.
--
-- Fix: zusätzlich `FROM PUBLIC` revoken — entzieht das implicit-Grant
-- für alle nicht-spezifisch-ge-grant-eten Rollen.
--
-- Behalten (15 Functions, weiter EXECUTE für anon+authenticated):
--   • is_* (is_admin, is_staff, is_sv, is_kanzlei, is_kundenbetreuer,
--     is_dispatcher, is_claim_user_party, is_dat_badge_sichtbar,
--     is_sv_for_claim) — in RLS-Policies referenced.
--   • can_access_fall, dispatcher_owns_lead — RLS-Policies.
--   • get_user_rolle, get_sv_id, get_sichtbare_qualifikationen — Client-RPC.
--   • upsert_vehicle_by_fin — Client-RPC für authenticated.
--
-- Revoked (39 Functions, jetzt nur via service_role/postgres aufrufbar):
--   • 16× cron_* (laufen via pg_cron als postgres)
--   • 6× trg_* + trigger_kanzlei_provision (Trigger-Bodies, vom Postgres-
--     Trigger-System als row-owner aufgerufen)
--   • 5× log_* + sync_* (intern)
--   • 2× auftraege_* Trigger-Validators
--   • handle_new_user (auth-Schema-Trigger)
--   • expire_geblockte_termine_ohne_sa, increment_offene_faelle,
--     mark_expired_leads (server-side)
--   • link_lead_data_to_fall, notify_admins, dsgvo_anonymize_user_data
--   • delete_*_komplett (Admin-Tools via service_role)
--
-- Verify post-apply:
--   select count(*) from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname='public' and p.prosecdef=true
--     and has_function_privilege('anon', p.oid, 'EXECUTE');
--   → 15 (nur die behalten-Liste oben)

REVOKE EXECUTE ON FUNCTION public.cron_airdrop_token_cleanup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_airdrop_token_expiry() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_dsgvo_hard_delete() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_gutachten_ocr_recovery() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_kanzlei_paket_pending_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_konsistenz_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_mark_durchgefuehrt_fallback() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_mietwagen_lange_anmietung() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_mietwagen_sla_tracking() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_pflicht_foto_validation() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_rate_limit_reset() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_trigger_exif_worker() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_trigger_salesforce_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_verjaehrungs_warner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_vs_frist_reminder() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_vs_frist_tick() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.trg_fall_dokumente_autotask() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_filmcheck_benachrichtigung() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_gutachten_benachrichtigung() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_lead_benachrichtigung() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_regulierung_benachrichtigung() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_kanzlei_provision() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_lead_changes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_phase_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_claims_to_faelle() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_faelle_to_claims() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.auftraege_sync_claim_id() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auftraege_validate_typ_requires_kanzleifall() FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_geblockte_termine_ohne_sa() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_offene_faelle(sv_id_param uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_expired_leads() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_titel text, p_nachricht text, p_link text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.delete_fall_komplett(p_fall_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_gutachter_komplett(p_sv_id uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_lead_komplett(p_lead_id uuid) FROM PUBLIC, anon, authenticated;
