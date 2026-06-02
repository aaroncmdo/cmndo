-- P2a: 3 neue Wizard-Feld-Typen fuer den sv-onboarding-Flow (phone-verify/avatar-upload/calendar-connect).
-- Self-persisting Widgets (Muster termin). Additiv — bestehende 14 Werte unveraendert.
ALTER TABLE public.onboarding_felder DROP CONSTRAINT IF EXISTS onboarding_felder_typ_check;
ALTER TABLE public.onboarding_felder ADD CONSTRAINT onboarding_felder_typ_check
  CHECK (typ = ANY (ARRAY['text','email','tel','number','textarea','segmented','toggle-cards',
    'select','slot','signature','file','checkbox','zb1-upload','termin',
    'phone-verify','avatar-upload','calendar-connect']));
