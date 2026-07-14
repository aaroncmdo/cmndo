-- #8 Vermittler-SSoT Phase 2, TEIL B: genau EIN Vermittler pro Claim => genau EINE Provision.
--
-- BUG: partner_provisionen hat nur einen PARTIELLEN unique-Index (partner_typ, claim_id) WHERE
-- claim_id IS NOT NULL — der blockt Doubletten nur DESSELBEN Typs. Ein Claim mit makler_id UND
-- werkstatt_id bekommt heute ZWEI Provisionen, weil beide Trigger unabhaengig feuern.
--
-- SSoT = claims.vermittler_typ (Phase 1, Mig 20260713195613). Praezedenz makler > werkstatt-inbound
-- > firmen_flotte — identisch zum Phase-1-Backfill und zu deriveVermittler (src/lib/leads/vermittler.ts).
-- Provision NUR INBOUND: reparatur_werkstatt_id (wohin WIR steuern) und sv_id bekommen nie etwas.
--
-- TRANSITION-SAFE: vermittler_typ IS NULL => Fallback auf das Roh-Signal (= heutiges Verhalten).
-- Zwischen DDL-Deploy und Convert-Deploy setzt damit KEINE Provision aus.
--
-- Trigger-Tabellen (verifiziert via pg_trigger, 14.07.):
--   create_makler_provision        -> faelle_claim_bridge  (NEW.claim_id) => vermittler_typ per SELECT
--   create_werkstatt_provision     -> claims               (NEW.id)       => NEW.vermittler_typ
--   create_firmen_flotte_provision -> claims               (NEW.id)       => NEW.vermittler_typ
--
-- Basis = die LIVE-Definitionen (pg_get_functiondef, 14.07.) — kein Drift zu den staging-Files.
-- Betraege/Consent/dual-rate wortgleich erhalten. partner_provisionen = 0 Rows => kein Payout-Risiko.

-- (1) makler — Gate NACH dem Consent-Insert (Consent = Sichtbarkeit, NICHT Provision).
CREATE OR REPLACE FUNCTION public.create_makler_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_makler uuid; v_service text; v_lead uuid;
  v_komplett numeric(10,2); v_gutachter numeric(10,2); v_aktiv boolean;
  v_betrag numeric(10,2); v_promo uuid;
  v_vermittler_typ text;
BEGIN
  SELECT makler_id, service_typ, lead_id, vermittler_typ
    INTO v_makler, v_service, v_lead, v_vermittler_typ
    FROM public.claims WHERE id = NEW.claim_id;
  IF v_makler IS NULL THEN RETURN NEW; END IF;

  -- Consent-Grant bleibt UNGEGATET: ein Gate hier oben wuerde in einem inkonsistenten Edge-Case
  -- auch den Sichtbarkeits-Grant ueberspringen => der Makler saehe seinen eigenen Fall nicht mehr.
  INSERT INTO public.makler_fall_consent (fall_id, claim_id, makler_id, consent_scope, consent_gegeben_am)
  VALUES (NEW.fall_id, NEW.claim_id, v_makler, 'vollzugriff', now())
  ON CONFLICT (fall_id, makler_id) DO NOTHING;

  -- #8 Gate: transition-safe (NULL => Fallback auf das Roh-Signal makler_id).
  IF v_vermittler_typ IS NOT NULL AND v_vermittler_typ IS DISTINCT FROM 'makler' THEN
    RETURN NEW;
  END IF;

  SELECT provision_betrag_komplett_netto, provision_betrag_nur_gutachter_netto, provision_aktiv
    INTO v_komplett, v_gutachter, v_aktiv FROM public.makler WHERE id = v_makler;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;
  v_betrag := CASE WHEN lower(COALESCE(v_service, '')) LIKE '%komplett%'
                   THEN COALESCE(v_komplett, 100) ELSE COALESCE(v_gutachter, 50) END;
  SELECT promotion_code_id INTO v_promo FROM public.leads WHERE id = v_lead;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, lead_id, promotion_code_id, betrag_netto_eur, service_typ,
     trigger_event, trigger_at, hold_until, status)
  VALUES
    ('makler', v_makler, NEW.claim_id, NEW.fall_id, v_lead, v_promo, v_betrag, v_service,
     'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;

-- (2) werkstatt — Gate ganz oben (NEW ist die claims-Row).
CREATE OR REPLACE FUNCTION public.create_werkstatt_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_betrag numeric(10,2); v_aktiv boolean;
BEGIN
  -- #8 Gate: transition-safe (NULL => Fallback auf das Roh-Signal werkstatt_id).
  IF NEW.vermittler_typ IS NOT NULL AND NEW.vermittler_typ IS DISTINCT FROM 'werkstatt' THEN
    RETURN NEW;
  END IF;

  IF NEW.werkstatt_id IS NULL THEN RETURN NEW; END IF;
  SELECT provision_betrag_netto, provision_aktiv INTO v_betrag, v_aktiv
    FROM public.werkstaetten WHERE id = NEW.werkstatt_id;
  IF NOT COALESCE(v_aktiv, false) THEN RETURN NEW; END IF;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('werkstatt', NEW.werkstatt_id, NEW.id, NEW.id, NEW.claim_nummer, COALESCE(v_betrag, 150), 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;

-- (3) firmen_flotte — Gate NULL-SICHER via IF/ELSE + Aaron 14.07.: Empfaenger = die FIRMA.
CREATE OR REPLACE FUNCTION public.create_firmen_flotte_provision()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_firma_id uuid;
BEGIN
  -- #8 Gate. IF/ELSE statt Compound-Boolean ist PFLICHT:
  --   NOT (typ='firmen_flotte' OR (typ IS NULL AND w IS NULL AND m IS NULL))
  -- waere bei (typ IS NULL AND werkstatt_id gesetzt) => NULL => der IF feuert NICHT =>
  -- ein werkstatt-vermittelter Claim bekaeme ZUSAETZLICH eine Flotten-Provision.
  IF NEW.vermittler_typ IS NOT NULL THEN
    IF NEW.vermittler_typ IS DISTINCT FROM 'firmen_flotte' THEN RETURN NEW; END IF;
  ELSE
    -- transition-safe Fallback: Exklusivitaet wie bisher ueber die Roh-Signale.
    IF NEW.werkstatt_id IS NOT NULL OR NEW.makler_id IS NOT NULL THEN RETURN NEW; END IF;
  END IF;

  IF NEW.vehicle_id IS NULL THEN RETURN NEW; END IF;

  -- Gehoert das Claim-Fahrzeug zu einer AKTIVEN Firmen-Flotte?
  -- Aaron 14.07.: partner_id = FIRMA (ff.firma_id), NICHT das Zugangs-Konto (k.id).
  -- firmen_flotten_konten ist ein reiner Zugangs-Link mit unique(user_id) und OHNE
  -- Rechnungsdaten => bei Flottenmanager-Wechsel zeigte die Provision ins Leere. `firmen`
  -- hat name/ust_id/steuernummer/adresse_* => direkter Payout-Lookup wie bei makler/werkstatt.
  -- Das AKTIVE Konto bleibt die GATE-Bedingung (kein Payout ohne aktiven Flotten-Vertrag).
  SELECT ff.firma_id INTO v_firma_id
    FROM public.flotten_fahrzeuge ff
    JOIN public.firmen_flotten_konten k ON k.firma_id = ff.firma_id AND k.status = 'aktiv'
   WHERE ff.vehicle_id = NEW.vehicle_id
   LIMIT 1;
  IF v_firma_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.partner_provisionen
    (partner_typ, partner_id, claim_id, fall_id, claim_nummer, betrag_netto_eur, trigger_event, trigger_at, hold_until, status)
  VALUES
    ('firmen_flotte', v_firma_id, NEW.id, NEW.id, NEW.claim_nummer, 150, 'claim_created', now(), now() + interval '7 days', 'pending')
  ON CONFLICT (partner_typ, claim_id) WHERE claim_id IS NOT NULL DO NOTHING;
  RETURN NEW;
END; $function$;

-- (4) USt-Status fuer den Flotten-Payout. Ohne die Spalte bricht die Auszahlung mit
-- "USt-Status des Partners unbekannt" (computeProvisionUst). Analog makler/werkstaetten
-- (Mig 20260704123312_partner_ust_status.sql).
ALTER TABLE public.firmen ADD COLUMN IF NOT EXISTS ist_kleinunternehmer boolean;
COMMENT ON COLUMN public.firmen.ist_kleinunternehmer IS
  'NULL=noch nicht erfragt; true=Kleinunternehmer §19 UStG (keine USt auf Provision); false=regelbesteuert (19%). Blockt Auszahlung bei NULL. Analog makler/werkstaetten (Mig 20260704123312). Empfaenger der firmen_flotte-Provision ist die Firma (partner_provisionen.partner_id = firmen.id).';
