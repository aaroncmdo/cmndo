-- A (DB-driven): die werbende Werkstatt (werkstatt_id, QR-Referral) wird automatisch
-- die Reparatur-Werkstatt (reparatur_werkstatt_id). Trigger garantiert die Invariante
-- fuer JEDEN Schreibpfad (nicht nur convertLeadToClaim). Aaron 07.07.: "wenn die
-- werkstatt hergebracht hat, muss die werkstatt immer zugewiesen bleiben" + "db driven".
-- HINWEIS: Diese v1 des Triggers wird von der Folge-Migration (reparaturwunsch-Entkopplung
-- + Test-Guard) ersetzt. Hier festgehalten als getrackter Stand (Regel 2).

-- 1. CHECK erweitern (claims): 'qr_referral' als Quelle erlauben.
ALTER TABLE public.claims DROP CONSTRAINT IF EXISTS claims_reparatur_werkstatt_quelle_check;
ALTER TABLE public.claims ADD CONSTRAINT claims_reparatur_werkstatt_quelle_check
  CHECK (reparatur_werkstatt_quelle IS NULL OR reparatur_werkstatt_quelle = ANY (ARRAY['dispatcher'::text,'kunde'::text,'embed'::text,'gutachter'::text,'kb'::text,'qr_referral'::text]));

-- 2. Trigger-Funktion: fuellt die 4 reparatur_werkstatt_*-Felder + status, wenn die
--    QR-Werkstatt gesetzt ist, Reparatur gewuenscht ist und noch keine Reparatur-Werkstatt
--    zugewiesen wurde (fill-when-null: bewusste Umzuweisung auf andere Werkstatt bleibt moeglich).
CREATE OR REPLACE FUNCTION public.set_reparatur_werkstatt_from_qr()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  IF NEW.werkstatt_id IS NOT NULL
     AND NEW.reparaturwunsch IN ('reparatur','fiktiv')
     AND NEW.reparatur_werkstatt_id IS NULL
  THEN
    NEW.reparatur_werkstatt_id := NEW.werkstatt_id;
    NEW.reparatur_werkstatt_quelle := 'qr_referral';
    NEW.reparatur_werkstatt_zugewiesen_am := COALESCE(NEW.reparatur_werkstatt_zugewiesen_am, now());
    NEW.reparatur_vermittlung_status := 'vermittelt';
  END IF;
  RETURN NEW;
END;
$function$;

-- 3. Trigger auf claims (nur wenn die relevanten Spalten betroffen sind -> effizient).
DROP TRIGGER IF EXISTS trg_set_reparatur_werkstatt_from_qr ON public.claims;
CREATE TRIGGER trg_set_reparatur_werkstatt_from_qr
  BEFORE INSERT OR UPDATE OF werkstatt_id, reparaturwunsch, reparatur_werkstatt_id ON public.claims
  FOR EACH ROW EXECUTE FUNCTION public.set_reparatur_werkstatt_from_qr();

-- 4. Backfill der bestehenden QR-Referral-Claims (mit Reparatur-Wunsch, noch ohne Reparatur-Werkstatt).
UPDATE public.claims
SET reparatur_werkstatt_id = werkstatt_id,
    reparatur_werkstatt_quelle = 'qr_referral',
    reparatur_werkstatt_zugewiesen_am = now(),
    reparatur_vermittlung_status = 'vermittelt'
WHERE werkstatt_id IS NOT NULL
  AND reparaturwunsch IN ('reparatur','fiktiv')
  AND reparatur_werkstatt_id IS NULL;
