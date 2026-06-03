-- CMM-49 Strategy B: persistente faelle.id -> claim.id Bridge-Map.
-- Entkoppelt Views/Reader/Bookmarks von der faelle-Tabelle: alles was eine faelle.id
-- hat, resolved claim.id OHNE faelle zu lesen. Ueberlebt den faelle-DROP.
-- Additiv, zero-risk fuer Bestandscode, reversibel (DROP TABLE).

CREATE TABLE IF NOT EXISTS public.faelle_claim_bridge (
  fall_id    uuid PRIMARY KEY,
  claim_id   uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_faelle_claim_bridge_claim_id
  ON public.faelle_claim_bridge (claim_id);

-- Backfill aus aktuellem faelle-Bestand
INSERT INTO public.faelle_claim_bridge (fall_id, claim_id)
SELECT id, claim_id FROM public.faelle WHERE claim_id IS NOT NULL
ON CONFLICT (fall_id) DO UPDATE SET claim_id = EXCLUDED.claim_id;

-- Frisch halten, solange faelle noch geschrieben wird (convert-lead-to-claim).
-- Wird beim faelle-DROP zusammen mit der Tabelle gegenstandslos (Trigger faellt mit).
CREATE OR REPLACE FUNCTION public.sync_faelle_claim_bridge() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.faelle_claim_bridge WHERE fall_id = OLD.id;
    RETURN OLD;
  END IF;
  IF NEW.claim_id IS NOT NULL THEN
    INSERT INTO public.faelle_claim_bridge (fall_id, claim_id)
    VALUES (NEW.id, NEW.claim_id)
    ON CONFLICT (fall_id) DO UPDATE SET claim_id = EXCLUDED.claim_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_faelle_claim_bridge ON public.faelle;
CREATE TRIGGER trg_sync_faelle_claim_bridge
  AFTER INSERT OR DELETE OR UPDATE OF claim_id ON public.faelle
  FOR EACH ROW EXECUTE FUNCTION public.sync_faelle_claim_bridge();

-- Reine id<->id-Map (keine PII). RLS an (Advisor-clean); nur service_role/Owner lesen.
-- Owner-Views (security_invoker=false) lesen via Owner-Rechte; anon/authenticated kein Zugriff.
ALTER TABLE public.faelle_claim_bridge ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.faelle_claim_bridge TO service_role;
