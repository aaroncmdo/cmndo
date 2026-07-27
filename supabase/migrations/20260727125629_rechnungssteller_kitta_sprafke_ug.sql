-- Rechnungssteller-Wechsel auf Kitta & Sprafke UG (Gründungs-Übergang; die UG rechnet
-- übergangsweise ab, bis die Claimondo GmbH gegründet ist). Aaron-Entscheid 27.07.
-- Steuerungs-Hebel ist rechnungs_konfiguration (AAR-416), zeit-versioniert.

-- 1) CHECK-Enum um den UG-Wert erweitern — auf BEIDEN Tabellen mit dem Constraint.
ALTER TABLE public.rechnungs_konfiguration DROP CONSTRAINT rechnungs_konfiguration_rechnungssteller_check;
ALTER TABLE public.rechnungs_konfiguration ADD CONSTRAINT rechnungs_konfiguration_rechnungssteller_check
  CHECK (rechnungssteller = ANY (ARRAY['claimondo_gmbh_igr'::text, 'claimondo_gmbh'::text, 'gbr'::text, 'kitta_sprafke_ug'::text]));

ALTER TABLE public.sv_onboarding_rechnungen DROP CONSTRAINT sv_onboarding_rechnungen_rechnungssteller_check;
ALTER TABLE public.sv_onboarding_rechnungen ADD CONSTRAINT sv_onboarding_rechnungen_rechnungssteller_check
  CHECK (rechnungssteller = ANY (ARRAY['claimondo_gmbh_igr'::text, 'claimondo_gmbh'::text, 'gbr'::text, 'kitta_sprafke_ug'::text]));

-- 2) Bisher aktive Konfig-Zeile schließen (replay-sicher: schließt die aktuell offene Nicht-UG-Zeile).
UPDATE public.rechnungs_konfiguration
  SET gueltig_bis = DATE '2026-07-27'
  WHERE gueltig_bis IS NULL AND rechnungssteller <> 'kitta_sprafke_ug';

-- 3) Neue aktive Konfig = Kitta & Sprafke UG. steuernummer='beantragt' (Übergangs-Platzhalter,
--    §14 formal unvollständig bis echte Nr. — B2B-Vorsteuer erst nach Berichtigung; Aaron-Entscheid).
--    ust_id NULL (USt-IdNr beantragt). Zahlungsempfänger = die UG selbst (Qonto = Stripe-Live-Payout-Konto).
INSERT INTO public.rechnungs_konfiguration
  (gueltig_ab, gueltig_bis, rechnungssteller, firmenname, strasse, plz, ort,
   steuernummer, ust_id, hrb, geschaeftsfuehrer,
   zahlungsempfaenger_name, zahlungsempfaenger_iban, zahlungsempfaenger_bic, zahlungsempfaenger_bank,
   zahlungsempfaenger_hinweis, version)
VALUES
  (DATE '2026-07-27', NULL, 'kitta_sprafke_ug',
   'Kitta & Sprafke UG (haftungsbeschränkt)', 'Hansaring 10', '50670', 'Köln',
   'beantragt', NULL, '128389 (Amtsgericht Köln)', 'Aaron Sprafke, Nicolas Kitta',
   'Kitta & Sprafke UG (haftungsbeschränkt)', 'DE84100101235446411098', 'QNTODEB2XXX', 'Qonto',
   NULL, 2);
