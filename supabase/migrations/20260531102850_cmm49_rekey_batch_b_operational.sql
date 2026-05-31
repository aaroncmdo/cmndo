-- CMM-49 FK-Re-Key Batch B — operative Misc (17 Tische, kollisionsfrei).
-- Gleiches Muster wie Batch A (claim_id ADD + Backfill + Index + FK + Ableitungs-Trigger).
DO $$
DECLARE
  pairs text[][] := ARRAY[
    ['admin_termine','SET NULL'], ['kanzlei_admin_termine','SET NULL'],
    ['sv_live_location','SET NULL'], ['technische_probleme','NO ACTION'],
    ['regulierungs_klassifizierung','CASCADE'], ['qc_checkliste','CASCADE'],
    ['reklamationen','CASCADE'], ['sla_tracking','CASCADE'],
    ['fall_read_state','CASCADE'], ['fall_summaries','CASCADE'],
    ['ki_gespraeche','CASCADE'], ['pflichtdokumente','CASCADE'],
    ['kunde_gutachten_requests','CASCADE'], ['makler_fall_consent','CASCADE'],
    ['personenschaden_personen','CASCADE'], ['termine','CASCADE'],
    ['gutachter_mitteilungen','NO ACTION']
  ];
  t text; od text;
BEGIN
  FOR i IN 1 .. array_length(pairs,1) LOOP
    t := pairs[i][1]; od := pairs[i][2];
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claim_id uuid', t);
    EXECUTE format('UPDATE public.%I x SET claim_id = f.claim_id FROM public.faelle f WHERE f.id = x.fall_id AND x.claim_id IS NULL', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (claim_id)', t||'_claim_id_idx', t);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t||'_claim_id_fkey' AND conrelid = ('public.'||t)::regclass) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE %s', t, t||'_claim_id_fkey', od);
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS trg_derive_claim_id ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_derive_claim_id BEFORE INSERT OR UPDATE OF fall_id ON public.%I FOR EACH ROW EXECUTE FUNCTION public.derive_claim_id_from_fall()', t);
  END LOOP;
END $$;
