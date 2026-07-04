-- SV-Live-Ops Chunk 1: jede neue sv_live_position spiegelt in sv_live_location
-- (die "aktuelle Position", die Karte + Realtime lesen). DB-driven, kein App-Change.
CREATE OR REPLACE FUNCTION public.sync_sv_live_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.sv_live_location (sv_id, lat, lng, accuracy, updated_at)
  VALUES (NEW.sv_id, NEW.lat, NEW.lng, NEW.accuracy_m, now())
  ON CONFLICT (sv_id) DO UPDATE
    SET lat = EXCLUDED.lat, lng = EXCLUDED.lng,
        accuracy = EXCLUDED.accuracy, updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_live_location ON public.sv_live_position;
CREATE TRIGGER trg_sync_live_location
  AFTER INSERT ON public.sv_live_position
  FOR EACH ROW EXECUTE FUNCTION public.sync_sv_live_location();
