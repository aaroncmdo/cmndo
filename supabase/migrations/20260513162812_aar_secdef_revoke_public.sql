-- SECURITY DEFINER Functions — REVOKE EXECUTE für non-public-Functions (1/2).
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (MEDIUM §3.1)
--
-- 54 SECURITY DEFINER Functions im public-Schema waren für anon+authenticated
-- EXECUTE-bar. Advisor-Lints: 54× anon_security_definer_function_executable
-- + 54× authenticated_security_definer_function_executable = 108 Treffer.
--
-- Klassischer Vektor wenn auch nur eine Function einen Bug hat, der
-- Privilege-Escalation erlaubt — der Aufruf läuft als Function-Owner
-- (postgres). Insbesondere Cron-Functions (cron_dsgvo_hard_delete,
-- cron_konsistenz_check) sind sensibel.
--
-- Diese Migration: erster REVOKE-Sweep. Wirkt aber NICHT, weil Postgres-
-- Default-ACL `=X/postgres` über PUBLIC vererbt — REVOKE FROM anon/
-- authenticated lässt PUBLIC unangetastet. Wird in der Folge-Migration
-- aar_secdef_revoke_public_v2 mit `FROM PUBLIC, anon, authenticated` repariert.
--
-- Inhaltlich identisch — Statements bewahrt fürs Repo-Reproduzieren.

REVOKE EXECUTE ON FUNCTION public.cron_airdrop_token_cleanup() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_airdrop_token_expiry() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_dsgvo_hard_delete() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_gutachten_ocr_recovery() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_kanzlei_paket_pending_check() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_konsistenz_check() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_mark_durchgefuehrt_fallback() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_mietwagen_lange_anmietung() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_mietwagen_sla_tracking() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_pflicht_foto_validation() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_rate_limit_reset() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_trigger_exif_worker() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_trigger_salesforce_sync() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_verjaehrungs_warner() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_vs_frist_reminder() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cron_vs_frist_tick() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_fall_dokumente_autotask() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_filmcheck_benachrichtigung() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_gutachten_benachrichtigung() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_lead_benachrichtigung() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_regulierung_benachrichtigung() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trigger_kanzlei_provision() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_cron_job_run(p_job_name text, p_status text, p_rows integer, p_error text, p_metadata jsonb) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_lead_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_phase_transition() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_claims_to_faelle() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_faelle_to_claims() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auftraege_sync_claim_id() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.auftraege_validate_typ_requires_kanzleifall() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_geblockte_termine_ohne_sa() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_offene_faelle(sv_id_param uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_expired_leads() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins(p_titel text, p_nachricht text, p_link text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dsgvo_anonymize_user_data(p_user_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_fall_komplett(p_fall_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_gutachter_komplett(p_sv_id uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_lead_komplett(p_lead_id uuid) FROM anon, authenticated;
