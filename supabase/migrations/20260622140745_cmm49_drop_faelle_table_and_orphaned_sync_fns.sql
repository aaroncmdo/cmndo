-- CMM-49 Capstone: DROP TABLE public.faelle. Live verifiziert (2026-06-22): 0 abhaengige Views,
-- 0 eingehende FKs, alle Prod-Writer DROP-tolerant, alle User-facing-Reader auf v_claim_full/Bridge
-- migriert, convert-lead-to-claim claim-first. faelle = deprecated Mirror von claims (82 faelle /
-- 84 claims via faelle_claim_bridge); die faelle-only-Felder (vs_kuerzung_grund/kuerzungs_betrag/
-- gegner_versicherung_anfrage_datum) sind 0/0/0 non-null -> 0 unique Daten-Verlust. CASCADE entfernt
-- nur die 4 faelle-gebundenen Trigger (0 Views/0 FKs).
DROP TABLE IF EXISTS public.faelle CASCADE;

-- Verwaiste sync-Funktionen droppen (live verifiziert: ausschliesslich an faelle-Trigger gebunden,
-- 0 non-faelle-Trigger). update_updated_at() bleibt (an 8 Tabellen gebunden).
DROP FUNCTION IF EXISTS public.check_fall_claim_id() CASCADE;
DROP FUNCTION IF EXISTS public.sync_faelle_claim_bridge() CASCADE;
DROP FUNCTION IF EXISTS public.sync_faelle_sv_id_to_claims() CASCADE;
