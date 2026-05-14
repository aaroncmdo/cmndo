-- AAR-885: 13 redundante idx_*-Duplikate droppen.
--
-- Audit 13.05.2026 P3.4 meldete 2 duplicate_indexes; Live-Check ergab 15 Cluster.
-- 11 davon sind constraint-backed UNIQUE-Indexes (auto-generated von _key/_unique-Constraints)
-- → bleiben. 2 in `auth`/`storage` schemas (Supabase-managed) → nicht anfassen.
-- 13 manuelle idx_*-Duplikate in `public` werden hier gedroppt.
--
-- Strategie pro Cluster: constraint-backed Index behalten, idx_* droppen.
-- Bei den 2 non-UNIQUE-Clustern (faelle.kunde_id, leads.zugewiesen_an) wird der
-- spalten-explizite Name (idx_faelle_kunde_id / idx_leads_zugewiesen_an) behalten.

drop index if exists public.idx_calls_aircall;
drop index if exists public.idx_dokument_upload_anfragen_token;
drop index if exists public.idx_faelle_kunde;
drop index if exists public.idx_flow_links_token;
drop index if exists public.google_bewertungen_cache_profile_id_idx;
drop index if exists public.idx_kanzlei_abrechnungen_token;
drop index if exists public.idx_kanzlei_faelle_fall;
drop index if exists public.idx_kanzlei_faelle_claim;
drop index if exists public.idx_kunde_gutachten_requests_token;
drop index if exists public.idx_leads_zugewiesen;
drop index if exists public.idx_onboarding_phasen_flow;
drop index if exists public.idx_versicherungen_name;
drop index if exists public.idx_webhook_events_event_id;
