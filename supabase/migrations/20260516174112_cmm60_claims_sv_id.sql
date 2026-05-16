-- CMM-60 Schritt 1 — claims.sv_id native SV-Zuweisung (Phase-0-Vorarbeit).
--
-- claims hat kein natives sv_id; is_sv_for_claim + diverse Sub-Tabellen-RLS-
-- Policies haengen an faelle.sv_id. Entscheidung (Aaron, 2026-05-16): die
-- SV-Zuweisung ist eine Claim-Eigenschaft -> sv_id wird native claims-Spalte.
-- auftraege.sv_id + gutachter_termine.sv_id bleiben als per-Lifecycle-Detail
-- bestehen; claims.sv_id ist die primaere/kanonische Zuweisung.
--
-- DIESE Migration = nur Schritt 1 (strukturelle Grundlage, analog CMM-58):
-- Spalte + FK + Index + Backfill + faelle->claims-Sync-Trigger. Die
-- RLS-Umstellung (is_sv_for_claim + Policies) und die Writer-Migration sind
-- eigene Schritte (CMM-60 Schritt 2 + 3).
--
-- Strategie: docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md §3.1d.
-- Live-Stand 2026-05-16: 30 faelle, 21 mit sv_id (alle 30 mit claim_id).

BEGIN;

-- 1. Spalte + FK. Nullable (9 von 30 faelle haben kein sv_id). ON DELETE SET
--    NULL: ein geloeschter SV-Datensatz soll den Claim nicht mitloeschen.
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS sv_id uuid
  REFERENCES public.sachverstaendige(id) ON DELETE SET NULL;

-- 2. Index fuer RLS-Lookups (is_sv_for_claim) + Joins.
CREATE INDEX IF NOT EXISTS idx_claims_sv_id ON public.claims(sv_id);

-- 3. Einmal-Backfill aus faelle.sv_id ueber faelle.claim_id.
UPDATE public.claims c
SET sv_id = f.sv_id
FROM public.faelle f
WHERE f.claim_id = c.id
  AND c.sv_id IS NULL
  AND f.sv_id IS NOT NULL;

-- 4. Uebergangs-Sync faelle.sv_id -> claims.sv_id.
--    Bis Schritt 3 (Writer-Migration) schreiben die Writer weiterhin
--    faelle.sv_id; dieser Trigger spiegelt das auf claims.sv_id, damit die
--    kanonische Spalte konsistent bleibt. SECURITY DEFINER analog
--    sync_faelle_to_claims; pg_trigger_depth-Guard gegen Rekursion mit dem
--    spaeteren Reverse-Trigger (Schritt 3).
CREATE OR REPLACE FUNCTION public.sync_faelle_sv_id_to_claims()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF NEW.claim_id IS NOT NULL
     AND NEW.sv_id IS DISTINCT FROM OLD.sv_id THEN
    UPDATE public.claims c
    SET sv_id = NEW.sv_id
    WHERE c.id = NEW.claim_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_faelle_sv_id_to_claims ON public.faelle;
CREATE TRIGGER trg_sync_faelle_sv_id_to_claims
  AFTER UPDATE OF sv_id ON public.faelle
  FOR EACH ROW EXECUTE FUNCTION public.sync_faelle_sv_id_to_claims();

COMMENT ON COLUMN public.claims.sv_id IS
  'CMM-60: native, kanonische SV-Zuweisung des Claims. Bis zur Writer-Migration (CMM-60 Schritt 3) via Trigger aus faelle.sv_id gespiegelt. auftraege.sv_id / gutachter_termine.sv_id bleiben per-Lifecycle-Detail.';

COMMIT;
