-- Unisone Termin-Engine Phase 2.1b / Task 1
-- verfuegbarkeits_ausnahmen: einmalige/temporaere Nicht-Verfuegbarkeit (urlaub/krank/sperre)
-- assignee-generisch. Integritaets-Trigger = Phase-1-Funktion gutachter_termine_validate_assignee
-- wiederverwendet (generisch ueber NEW.assignee_typ/_id). RLS an + kein anon/authenticated
-- (Engine liest via service_role; SV-CRUD-UI-Policy spaeter). Fliesst in v_belegung ein (Task 2).
CREATE TABLE public.verfuegbarkeits_ausnahmen (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignee_typ text NOT NULL,
  assignee_id  uuid NOT NULL,
  von          timestamptz NOT NULL,
  bis          timestamptz NOT NULL,
  typ          text NOT NULL,
  grund        text,
  erstellt_am  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verfuegbarkeits_ausnahmen_typ_check
    CHECK (typ = ANY (ARRAY['urlaub','krank','sperre'])),
  CONSTRAINT verfuegbarkeits_ausnahmen_assignee_typ_check
    CHECK (assignee_typ = ANY (ARRAY['sachverstaendiger','sv_lead','kundenbetreuer','kanzlei'])),
  CONSTRAINT verfuegbarkeits_ausnahmen_zeitraum_check
    CHECK (von < bis)
);

CREATE INDEX idx_verfuegbarkeits_ausnahmen_assignee
  ON public.verfuegbarkeits_ausnahmen (assignee_typ, assignee_id, von, bis);

CREATE TRIGGER trg_verfuegbarkeits_ausnahmen_validate_assignee
  BEFORE INSERT OR UPDATE OF assignee_typ, assignee_id ON public.verfuegbarkeits_ausnahmen
  FOR EACH ROW EXECUTE FUNCTION public.gutachter_termine_validate_assignee();

ALTER TABLE public.verfuegbarkeits_ausnahmen ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.verfuegbarkeits_ausnahmen FROM anon, authenticated;
