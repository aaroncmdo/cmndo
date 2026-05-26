-- CMM-66 + SV-Realtime — claim_recency Recency-SSoT (PR1: rein additiv).
--
-- Eine leak-freie Mini-Tabelle (claim_id + last_activity_at) wird die einheitliche
-- Recency-Quelle:
--   * CMM-66-Views (v_claim_full.fall_updated_at, v_faelle_mit_aktuellem_termin.updated_at)
--     joinen spaeter darauf (PR2).
--   * FallRealtimeRefresh abonniert sie spaeter fuer ALLE Portale (PR2) — leak-frei,
--     daher auch SV-tauglich (claims selbst bleibt SV-unlesbar; CMM-60 Phase 4
--     20260516193332 hat is_sv_for_claim bewusst aus der claims-SELECT-Policy entfernt,
--     weil die Tabelle die ganze Zeile inkl. kanzlei_*/regulierungs_betrag gab).
-- Backfill-resistent: KEIN moddatetime-Trigger; nur touch_claim_recency() + echte
-- Aktivitaet schreiben. Phase-6-fest (claims-seitig, unabhaengig von faelle).
--
-- PR1 ist rein additiv: kein View-/Realtime-Repoint, niemand liest claim_recency.
-- touchClaimRecency schreibt sie ab jetzt ZUSAETZLICH (Dual-Write zu claims.updated_at)
-- -> Verhalten unveraendert. Design: docs/26.05.2026/cmm66-claim-recency-design.md

BEGIN;

-- 1. Tabelle (1:1 zu claims).
CREATE TABLE public.claim_recency (
  claim_id uuid PRIMARY KEY REFERENCES public.claims(id) ON DELETE CASCADE,
  last_activity_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.claim_recency IS
  'CMM-66/SV-Realtime: leak-freie Recency-SSoT pro Claim. Quelle fuer View-Recency (fall_updated_at/updated_at) + uniforme Realtime-Subscription aller Portale. Nur touch_claim_recency()/echte Aktivitaet schreiben — KEIN moddatetime (backfill-resistent).';

-- 2. RLS — SELECT nur fuer Rollen, die den Claim ohnehin sehen duerfen. Da die
--    Tabelle KEINE sensiblen Spalten hat, ist das CMM-60-konform (kein Spalten-Leak).
ALTER TABLE public.claim_recency ENABLE ROW LEVEL SECURITY;

CREATE POLICY claim_recency_select ON public.claim_recency
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.is_sv_for_claim(claim_id)
    OR public.is_claim_user_party(claim_id)
    OR EXISTS (
      SELECT 1 FROM public.claims c
      WHERE c.id = claim_recency.claim_id
        AND (
          c.geschaedigter_user_id = (SELECT auth.uid())
          OR (public.is_dispatcher() AND public.dispatcher_owns_lead(c.lead_id))
        )
    )
  );

-- Schreiben ausschliesslich ueber touch_claim_recency() (SECURITY DEFINER) /
-- service-role: kein INSERT/UPDATE/DELETE-Grant fuer authenticated.
GRANT SELECT ON public.claim_recency TO authenticated;

-- 3. Schreibpfad: SECURITY-DEFINER-Upsert (RLS-exempt), callable von authenticated.
CREATE OR REPLACE FUNCTION public.touch_claim_recency(p_claim_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  INSERT INTO public.claim_recency (claim_id, last_activity_at)
  VALUES (p_claim_id, now())
  ON CONFLICT (claim_id) DO UPDATE SET last_activity_at = now();
$$;

REVOKE ALL ON FUNCTION public.touch_claim_recency(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.touch_claim_recency(uuid) TO authenticated, service_role;

-- 4. Realtime: Tabelle in die supabase_realtime-Publication. REPLICA IDENTITY DEFAULT
--    reicht — der FallRealtimeRefresh-Filter laeuft ueber den PK claim_id.
ALTER PUBLICATION supabase_realtime ADD TABLE public.claim_recency;

-- 5. Backfill (einmalig, Seed). claims.updated_at ist SP-backfill-geclobbert, daher
--    GREATEST mit created_at als bestes verfuegbares Seed (created_at ist NOT NULL).
INSERT INTO public.claim_recency (claim_id, last_activity_at)
SELECT c.id, GREATEST(c.updated_at, c.created_at)
FROM public.claims c
ON CONFLICT (claim_id) DO NOTHING;

COMMIT;
