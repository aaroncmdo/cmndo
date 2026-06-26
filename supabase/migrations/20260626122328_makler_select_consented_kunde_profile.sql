-- ⚠️ REVERTED in der direkt folgenden Migration (20260626122525_drop_makler_kunde_profile_policy_recursion).
-- Diese Policy verursachte 42P17 (infinite recursion): die profiles-SELECT-Policy liest claims,
-- dessen RLS wiederum profiles liest -> Zyklus. Da sie `to authenticated` ist, betraf das ALLE
-- profiles-Reads (Cross-Profile). Die scope-gestaffelte Makler-Kunden-Sichtbarkeit laeuft jetzt
-- App-seitig (service-role + Consent-Check + Feld-Staffelung in getMaklerFallDetail). NICHT erneut
-- als reine RLS-Policy einfuehren ohne SECURITY-DEFINER-Helper. Datei dient nur der Reproduzier-
-- barkeit der getrackten Migration; sie wird beim Reset sofort von der naechsten Migration gedroppt.
create policy "makler_select_consented_kunde_profile"
on public.profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.makler_fall_consent mfc
    join public.makler m on m.id = mfc.makler_id
    join public.faelle_claim_bridge b on b.fall_id = mfc.fall_id
    join public.claims c on c.id = b.claim_id
    where m.user_id = (select auth.uid())
      and mfc.widerrufen_am is null
      and c.geschaedigter_user_id = profiles.id
  )
);
