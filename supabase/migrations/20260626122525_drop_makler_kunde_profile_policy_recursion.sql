-- Sofort-Rollback der vorigen Migration (makler_select_consented_kunde_profile): die Policy
-- loeste 42P17 (infinite recursion ueber profiles -> claims -> profiles) aus und betraf als
-- `to authenticated` ALLE profiles-Reads (Cross-Profile). Daher gedroppt. Die scope-gestaffelte
-- Makler-Kunden-Sichtbarkeit (vollzugriff = voller Kontakt, minimal = nur Name) ist stattdessen
-- App-seitig in getMaklerFallDetail geloest (service-role-Fetch nach Consent-Check + Feld-Minimierung).
drop policy if exists "makler_select_consented_kunde_profile" on public.profiles;
