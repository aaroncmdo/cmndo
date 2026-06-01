-- CMM-49 FK-Re-Key Task 4 — halb-migrierte Tische (haben claim_id + FK schon, gap=0).
-- Nur Ableitungs-Trigger als Sicherheitsnetz (claim_id bleibt korrekt falls ein Writer ihn
-- mal nicht setzt). Backfill ist No-Op (gap=0), IS-NULL-geguarded für Idempotenz.
-- gutachter_termine BEWUSST AUSGELASSEN — aktiv 939-hot (Lead->Termin), kommt koordiniert.
DO $$
DECLARE
  tables text[] := ARRAY['auftraege','fall_dokumente','kanzlei_faelle','phase_transitions','timeline'];
  t text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('UPDATE public.%I x SET claim_id = f.claim_id FROM public.faelle f WHERE f.id = x.fall_id AND x.claim_id IS NULL', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_derive_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.derive_claim_id_from_fall()', t);
  END LOOP;
END $$;
