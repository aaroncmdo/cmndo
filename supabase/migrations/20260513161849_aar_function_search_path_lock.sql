-- P2-Hygiene — function_search_path_mutable Lock.
--
-- Audit: docs/13.05.2026/db-rls-audit/AUDIT-2026-05-13.md (MEDIUM §3.2)
--
-- 63 eigene Functions im public-Schema hatten kein SET search_path konfiguriert
-- → Supabase-Security-Advisor `function_search_path_mutable`.
-- Vector: ein Angreifer der Schreibrechte auf ein Schema mit höherer Priorität
-- hätte, kann Objekte mit identischen Namen anlegen und unter dem Default-
-- search_path (`"$user", public`) schadhaft shadows ziehen. Bei den 14
-- DEFINER-Functions zusätzlich Privilege-Escalation-Risiko, weil sie als
-- function-owner laufen.
--
-- Fix: jede eigene Function (DEFINER + INVOKER) bekommt explizit
-- `SET search_path = pg_catalog, public`. pg_catalog zuerst → System-Functions
-- sind nicht durch user-Schema-Objekte shadow-bar.
--
-- Scope:
--   • 14 DEFINER-Functions (cron_*, is_kanzlei, is_sv, get_user_rolle,
--     handle_new_user, delete_*_komplett, increment_offene_faelle,
--     link_lead_data_to_fall, log_*, mark_expired_leads, trigger_kanzlei_provision)
--   • 49 INVOKER-Functions (Trigger-Functions set_*_updated_at, tg_*, trg_*,
--     guard_*, sync-Helpers etc.)
--   • Extension-Functions (btree_gist: gbt_*, gbtreekey_*) NICHT angefasst —
--     die werden über das Extension-Lifecycle verwaltet.
--
-- Verify post-apply:
--   select count(*) from pg_proc p
--   join pg_namespace n on n.oid=p.pronamespace
--   left join pg_depend d on d.objid=p.oid and d.deptype='e'
--   where n.nspname='public' and d.objid is null
--     and (p.proconfig is null or not p.proconfig::text ilike '%search_path%');
--   → 0
--
-- Behavior-Change: keiner für die Functions selbst — sie funktionieren weiter
-- identisch, nur der gepinnte search_path ist explizit gesetzt.

-- DEFINER functions (14)
ALTER FUNCTION public.cron_mark_durchgefuehrt_fallback() SET search_path = pg_catalog, public;
ALTER FUNCTION public.delete_fall_komplett(p_fall_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.delete_gutachter_komplett(p_sv_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.delete_lead_komplett(p_lead_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.get_user_rolle() SET search_path = pg_catalog, public;
ALTER FUNCTION public.handle_new_user() SET search_path = pg_catalog, public;
ALTER FUNCTION public.increment_offene_faelle(sv_id_param uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_kanzlei() SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_sv() SET search_path = pg_catalog, public;
ALTER FUNCTION public.link_lead_data_to_fall(p_lead_id uuid, p_fall_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.log_lead_changes() SET search_path = pg_catalog, public;
ALTER FUNCTION public.log_phase_transition() SET search_path = pg_catalog, public;
ALTER FUNCTION public.mark_expired_leads() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trigger_kanzlei_provision() SET search_path = pg_catalog, public;

-- INVOKER functions (49)
ALTER FUNCTION public.airdrop_status_consistency() SET search_path = pg_catalog, public;
ALTER FUNCTION public.anonymisiere_claim_party() SET search_path = pg_catalog, public;
ALTER FUNCTION public.calc_claims_phase(p_claim_id uuid, p_status text, p_kb_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.check_fall_claim_id() SET search_path = pg_catalog, public;
ALTER FUNCTION public.count_unread_updates(p_fall_id uuid, p_since timestamp with time zone) SET search_path = pg_catalog, public;
ALTER FUNCTION public.dokument_katalog_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.fall_validate_kb_rolle() SET search_path = pg_catalog, public;
ALTER FUNCTION public.generate_fall_nummer() SET search_path = pg_catalog, public;
ALTER FUNCTION public.guard_makler_privilegien() SET search_path = pg_catalog, public;
ALTER FUNCTION public.guard_profiles_rolle() SET search_path = pg_catalog, public;
ALTER FUNCTION public.guard_sachverstaendige_privilegien() SET search_path = pg_catalog, public;
ALTER FUNCTION public.gutachter_waitlist_touch_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.haversine_km(lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric) SET search_path = pg_catalog, public;
ALTER FUNCTION public.invalidate_whatsapp_cache_on_phone_change() SET search_path = pg_catalog, public;
ALTER FUNCTION public.kanzlei_faelle_sync_claim_fall() SET search_path = pg_catalog, public;
ALTER FUNCTION public.next_rechnungs_nr(p_serie text, p_jahr integer) SET search_path = pg_catalog, public;
ALTER FUNCTION public.personenschaden_personen_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.safe_to_date(p_text text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.safe_to_time(p_text text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_airdrop_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_claim_mietwagen_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_claim_nummer() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_claim_parties_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_claim_payments_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_claims_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_claims_verjaehrung() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_gutachten_positionen_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_gutachten_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_kanzlei_pakete_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_laeufer_report_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_lead_nummer() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_repairs_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_sv_buero_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_sv_org_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_updated_at_now() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_vehicle_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.set_werkstaetten_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sv_kalender_verbindungen_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.sv_private_stops_touch_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tg_auftraege_set_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.tg_termin_sync_auftrag_status() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_fn_refresh_claim_phase_from_gutachten() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_fn_refresh_claim_phase_from_payments() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_fn_refresh_claim_phase_from_repairs() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_fn_set_claims_phase() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trg_kanzlei_admin_termine_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.trigger_sa_bestaetigt_termin() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_aktualisiert_am_column() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_updated_at() SET search_path = pg_catalog, public;
ALTER FUNCTION public.update_versicherungen_aktualisiert_am() SET search_path = pg_catalog, public;
