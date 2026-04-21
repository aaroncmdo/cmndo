-- AAR SV-Audit-Konsolidierung: Semantik-Klärung und Legacy-Daten-Migration.
--
-- Entscheidung (nach Audit mit Aaron):
--   - `ist_aktiv` = automatischer Onboarding-Flag. false beim Anlegen durch
--     alle Wizards, true wenn Stripe-Anzahlung durch + Portal freigeschaltet.
--     Keine manuelle Admin-Steuerung.
--   - `gesperrt_seit` / `gesperrt_grund` = manueller Admin-Toggle für Sperre.
--     Admin-„Deaktivieren"-Aktion setzt diese Felder statt `ist_aktiv=false`.
--   - `geloescht_am` = Soft-Delete.
--
-- Migration der bestehenden Daten:
--   - SVs mit ist_aktiv=false UND gesperrt_seit IS NULL UND geloescht_am IS NULL
--     = Legacy-„deaktivierte" SVs. Werden konvertiert zu gesperrt_seit=now()
--     mit gesperrt_grund='Legacy-Deaktivierung (Audit-Konsolidierung)'.
--     Grund: ohne gesperrt_seit würden sie nach der neuen Semantik als
--     „Onboarding" erscheinen — was falsch ist.

UPDATE public.sachverstaendige
SET
  gesperrt_seit = NOW(),
  gesperrt_grund = COALESCE(deaktiviert_grund, 'Legacy-Deaktivierung (Audit-Konsolidierung)')
WHERE ist_aktiv = false
  AND gesperrt_seit IS NULL
  AND geloescht_am IS NULL;

COMMENT ON COLUMN public.sachverstaendige.ist_aktiv IS
  'Automatischer Onboarding-Flag. false beim Anlegen durch alle Wizards, '
  'true wenn Stripe-Webhook die Anzahlung bestätigt + portal_zugang_freigeschaltet '
  'auf true setzt. NIEMALS manuell vom Admin setzen — dafür ist gesperrt_seit da.';

COMMENT ON COLUMN public.sachverstaendige.gesperrt_seit IS
  'Manueller Admin-Toggle für SV-Sperre. Setzt deactivateGutachter() in '
  'karte/actions.ts. Ein SV mit gesperrt_seit IS NOT NULL bekommt keine '
  'Fälle (Filter in lib/sv/queries.ts applyDispatchableFilter).';

COMMENT ON COLUMN public.sachverstaendige.portal_zugang_freigeschaltet IS
  'Business-Gate: erst wenn true darf der SV Fälle bekommen (Anzahlung '
  'muss durch sein). Wird vom Stripe-Webhook + gutachter/willkommen/actions.ts '
  'gesetzt. Zusammen mit ist_aktiv die zwei Conditions die applyDispatchableFilter '
  'prüft.';
