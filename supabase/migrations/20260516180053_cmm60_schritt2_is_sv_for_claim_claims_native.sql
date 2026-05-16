-- CMM-60 Schritt 2 — RLS-Umstellung auf claims.sv_id.
--
-- Schritt 1 (20260516174112) hat claims.sv_id angelegt + befuellt + einen
-- faelle->claims-Uebergangs-Trigger gesetzt. Schritt 2 stellt die RLS-Logik
-- von faelle.sv_id auf claims.sv_id um, damit der spaetere faelle-Drop
-- (Phase 6) is_sv_for_claim nicht bricht.
--
-- Was sich aendert:
--   1. is_sv_for_claim(uuid) liest claims.sv_id statt ueber faelle zu joinen.
--   2. GRANT EXECUTE wird explizit + idempotent neu gesetzt (Memory
--      feedback_rls_function_grants: SECURITY-DEFINER-Grants gehen bei
--      CREATE OR REPLACE / Signatur-Aenderung verloren -> Inzident AAR-894,
--      SV-Plan leer. Signatur ist hier UNveraendert, CREATE OR REPLACE
--      behaelt die Grants -> der explizite GRANT ist Defense-in-Depth).
--   3. Uebergangs-Trigger trg_sync_faelle_sv_id_to_claims wird auf
--      INSERT OR UPDATE erweitert. Schritt 1 deckte nur UPDATE ab; der
--      Produktions-Pfad lead-fall-mapping.ts:261 (fallComputedFields) setzt
--      sv_id aber bereits im faelle-INSERT (zusammen mit claim_id, siehe
--      convert-lead-to-claim.ts:397). Ohne INSERT-Abdeckung bliebe
--      claims.sv_id dort NULL und der SV verloere RLS-Zugriff.
--   4. Policy claim_parties.cp_sv_assigned_insert nutzt is_sv_for_claim()
--      statt eines eigenen faelle.sv_id-Inline-Joins (verhaltensgleich,
--      entkoppelt eine weitere Stelle von faelle.sv_id).
--
-- NICHT in Scope: fall_id-/vehicle_id-gekeyte Policies (timeline,
-- pflichtdokumente, nachrichten, vehicles, qc_checkliste, kanzlei_faelle,
-- auftraege, ...) joinen faelle, weil sie einen Fall referenzieren — nicht
-- einen Claim. Die migrieren erst wenn diese Tabellen claim_id bekommen
-- (Phase 2+) bzw. mit dem faelle-Drop (Phase 6).
--
-- Strategie: docs/16.05.2026/claim-ssot-vollmigration-audit-strategie.md §3.1d.

BEGIN;

-- ── 1. is_sv_for_claim: claims.sv_id statt faelle-Join ─────────────────────
-- Signatur UNVERAENDERT (p_claim_id uuid) -> CREATE OR REPLACE behaelt die
-- bestehenden Grants. STABLE + SECURITY DEFINER + search_path bleiben gleich.
CREATE OR REPLACE FUNCTION public.is_sv_for_claim(p_claim_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM claims c
    JOIN sachverstaendige sv ON sv.id = c.sv_id
    WHERE c.id = p_claim_id
      AND sv.profile_id = auth.uid()
  )
$function$;

-- ── 2. Grants idempotent neu setzen (Memory feedback_rls_function_grants) ──
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_sv_for_claim(uuid) TO service_role;

-- ── 3. Uebergangs-Trigger auf INSERT OR UPDATE erweitern ──────────────────
-- Die Funktion selbst ist INSERT-tauglich: bei INSERT ist OLD NULL, also
-- greift NEW.sv_id IS DISTINCT FROM OLD.sv_id korrekt. Nur das Trigger-Event
-- muss erweitert werden.
DROP TRIGGER IF EXISTS trg_sync_faelle_sv_id_to_claims ON public.faelle;
CREATE TRIGGER trg_sync_faelle_sv_id_to_claims
  AFTER INSERT OR UPDATE OF sv_id ON public.faelle
  FOR EACH ROW EXECUTE FUNCTION public.sync_faelle_sv_id_to_claims();

-- ── 4. Sicherheits-Backfill ───────────────────────────────────────────────
-- Faengt faelle, die zwischen Schritt-1-Apply und jetzt per INSERT mit sv_id
-- entstanden sind (Schritt-1-Trigger deckte INSERT noch nicht ab).
-- Idempotent: nur dort, wo claims.sv_id noch NULL ist.
UPDATE public.claims c
SET sv_id = f.sv_id
FROM public.faelle f
WHERE f.claim_id = c.id
  AND c.sv_id IS NULL
  AND f.sv_id IS NOT NULL;

-- ── 5. cp_sv_assigned_insert auf is_sv_for_claim umstellen ────────────────
-- Vorher: eigener Inline-Join faelle JOIN sachverstaendige ON sv.id=f.sv_id
--         WHERE f.claim_id = claim_parties.claim_id.
-- Nachher: is_sv_for_claim(claim_parties.claim_id) — verhaltensgleich,
-- claim-nativ, entkoppelt von faelle.sv_id.
ALTER POLICY cp_sv_assigned_insert ON public.claim_parties
  WITH CHECK (
    rolle = 'zeuge'::text
    AND public.is_sv_for_claim(claim_parties.claim_id)
  );

COMMIT;
