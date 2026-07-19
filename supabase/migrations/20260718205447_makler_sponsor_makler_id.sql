ALTER TABLE public.makler
  ADD COLUMN sponsor_makler_id uuid REFERENCES public.makler(id),
  ADD CONSTRAINT makler_sponsor_not_self
    CHECK (sponsor_makler_id IS NULL OR sponsor_makler_id <> id);

CREATE INDEX idx_makler_sponsor
  ON public.makler(sponsor_makler_id) WHERE sponsor_makler_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_makler_privilegien()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  privileged boolean := current_user IN ('service_role', 'supabase_admin', 'postgres', 'authenticator')
                        OR public.is_admin();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT privileged THEN
      NEW.status := 'pending';
      NEW.provision_betrag_komplett_netto := 0;
      NEW.provision_betrag_nur_gutachter_netto := 0;
      NEW.provision_aktiv := false;
      NEW.sponsor_makler_id := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NOT privileged AND (
       NEW.status IS DISTINCT FROM OLD.status
    OR NEW.provision_betrag_komplett_netto IS DISTINCT FROM OLD.provision_betrag_komplett_netto
    OR NEW.provision_betrag_nur_gutachter_netto IS DISTINCT FROM OLD.provision_betrag_nur_gutachter_netto
    OR NEW.provision_aktiv IS DISTINCT FROM OLD.provision_aktiv
    OR NEW.user_id IS DISTINCT FROM OLD.user_id
    OR NEW.sponsor_makler_id IS DISTINCT FROM OLD.sponsor_makler_id
  ) THEN
    RAISE EXCEPTION 'Nur Admins/service_role duerfen Provisions-/Status-/user_id-/sponsor-Felder aendern (versucht an makler.%)', NEW.id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END; $function$;
