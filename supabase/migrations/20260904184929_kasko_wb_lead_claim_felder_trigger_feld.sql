-- Kasko-Werkstattbindung Phase 1 (Spec 2026-09-04 §4.2–4.4): Herkunft + Kontext zum Entscheidungsfeld
-- freie_werkstattwahl. Der Name der EIGENEN Versicherung wurde bisher nirgends erfasst (eigene_versicherung
-- ist ja/nein). Kundensichtbar gegrantet (Kunde hat es selbst eingegeben) -> Claims-Column-Grants-Check gruen.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS eigene_versicherung_marke_id uuid REFERENCES public.kasko_versicherer_marken(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_versicherung_name text,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_id uuid REFERENCES public.kasko_tarife(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_name text,
  ADD COLUMN IF NOT EXISTS werkstattbindung_quelle text;
ALTER TABLE public.leads ADD CONSTRAINT leads_werkstattbindung_quelle_check
  CHECK (werkstattbindung_quelle IS NULL OR werkstattbindung_quelle IN ('tarif','marker','kunde','dispatcher','dokument','unbekannt'));

ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS eigene_versicherung_marke_id uuid REFERENCES public.kasko_versicherer_marken(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_versicherung_name text,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_id uuid REFERENCES public.kasko_tarife(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS eigene_kasko_tarif_name text,
  ADD COLUMN IF NOT EXISTS werkstattbindung_quelle text;
ALTER TABLE public.claims ADD CONSTRAINT claims_werkstattbindung_quelle_check
  CHECK (werkstattbindung_quelle IS NULL OR werkstattbindung_quelle IN ('tarif','marker','kunde','dispatcher','dokument','unbekannt'));

COMMENT ON COLUMN public.leads.werkstattbindung_quelle IS 'Herkunft von freie_werkstattwahl: tarif (aus Wissensbasis), marker (Kunde bestaetigte Zusatz am Schein), kunde (manuell), dispatcher, dokument (OCR, spaeter), unbekannt (Kunde konnte nicht pruefen -> durchgelassen + Dispatch-Task).';
COMMENT ON COLUMN public.claims.werkstattbindung_quelle IS 'Siehe leads.werkstattbindung_quelle; Kopie bei Konversion, Nachzug via spiegle-quali-auf-claim.';
COMMENT ON COLUMN public.leads.eigene_kasko_tarif_name IS 'Anzeigename des gewaehlten Tarifs zum Zeitpunkt der Wahl (Historie, auch wenn der Tarif spaeter umbenannt wird).';

-- Kundensichtbar (Claims-Column-Grants-Cap, Mig 20260714220455): der Kunde hat diese Werte selbst eingegeben.
GRANT SELECT (eigene_versicherung_marke_id, eigene_versicherung_name, eigene_kasko_tarif_id, eigene_kasko_tarif_name, werkstattbindung_quelle)
  ON public.claims TO authenticated;

CREATE INDEX IF NOT EXISTS leads_eigene_versicherung_marke_idx ON public.leads (eigene_versicherung_marke_id);
CREATE INDEX IF NOT EXISTS claims_eigene_versicherung_marke_idx ON public.claims (eigene_versicherung_marke_id);
CREATE INDEX IF NOT EXISTS leads_eigene_kasko_tarif_idx ON public.leads (eigene_kasko_tarif_id);
CREATE INDEX IF NOT EXISTS claims_eigene_kasko_tarif_idx ON public.claims (eigene_kasko_tarif_id);

-- QR-Trigger (Umgehung c, Spec §4.4): Auto-Zuweisung der werbenden Werkstatt NUR bei unbekannter Bindung.
-- Bisher IS NOT TRUE -> auch bei false (gebunden!) zugewiesen. Rumpf sonst identisch zu 20260713161645.
CREATE OR REPLACE FUNCTION public.set_reparatur_werkstatt_from_qr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_ws_email text;
  v_kunde_email text;
BEGIN
  IF NEW.werkstatt_id IS NOT NULL
     AND NEW.reparaturwunsch IS DISTINCT FROM 'fiktiv'
     AND NEW.reparatur_werkstatt_id IS NULL
     AND NEW.freie_werkstattwahl IS NULL
  THEN
    SELECT email INTO v_ws_email FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
    IF NEW.geschaedigter_user_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.profiles WHERE id = NEW.geschaedigter_user_id;
    END IF;
    IF v_kunde_email IS NULL AND NEW.lead_id IS NOT NULL THEN
      SELECT email INTO v_kunde_email FROM public.leads WHERE id = NEW.lead_id;
    END IF;
    -- TEST-GUARD: nur zuweisen, wenn Werkstatt + Kunde dieselbe Test-Ness haben.
    IF public.ist_interne_email(v_ws_email) = public.ist_interne_email(v_kunde_email) THEN
      NEW.reparatur_werkstatt_id := NEW.werkstatt_id;
      NEW.reparatur_werkstatt_quelle := 'qr_referral';
      NEW.reparatur_werkstatt_zugewiesen_am := COALESCE(NEW.reparatur_werkstatt_zugewiesen_am, now());
      NEW.reparatur_vermittlung_status := 'vermittelt';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Flow-Step-Bedingung (Spec §4.3): nach 'unbekannt' (quelle gesetzt, freie_werkstattwahl bleibt NULL) nicht erneut fragen.
-- Kompatibel mit altem Code: dort ist werkstattbindung_quelle im Kontext undefined = leer -> Step erscheint wie bisher.
UPDATE public.flow_szenario_steps
SET bedingung = '{"freie_werkstattwahl": null, "werkstattbindung_quelle": null}'::jsonb
WHERE szenario_id = 'kasko' AND step_id = 'werkstattbindung_check';

-- Dispatcher-Feld (Spec §7): Rich-Override DispatchKaskoTarifField haengt an diesem feld_key. audience=dispatcher,
-- nur bei Eigenverschulden. db_target zeigt auf den Anzeigenamen; die Rich-Komponente schreibt alle Felder selbst.
INSERT INTO public.onboarding_felder
  (phase_id, reihenfolge, feld_key, typ, label, hint, placeholder, pflicht, optionen, db_target, conditional_on, audience, sektion)
SELECT p.id, 15, 'eigene_kasko_tarif', 'text', 'Eigene Kasko: Versicherer & Tarif',
       'Steuert die Werkstatt-Vermittlung: Tarif mit Werkstattbindung = keine Vermittlung.', NULL, false, NULL,
       '{"tabelle":"leads","spalte":"eigene_kasko_tarif_name"}'::jsonb,
       '{"feld":"schuldfrage","equals":"eigenverantwortung"}'::jsonb, 'dispatcher', 'schuld'
FROM public.onboarding_phasen p
WHERE p.flow_key = 'lead-erfassung' AND p.phase_key = 'schuld'
  AND NOT EXISTS (SELECT 1 FROM public.onboarding_felder f WHERE f.phase_id = p.id AND f.feld_key = 'eigene_kasko_tarif');
