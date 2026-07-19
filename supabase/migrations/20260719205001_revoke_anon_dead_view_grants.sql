-- Boy-Scout: 4 wirkungslose anon-SELECT-Grants auf security_invoker-Views entziehen.
-- Die Views respektieren die Basistabellen-RLS (security_invoker=true) + deren anon-Grants
-- sind gekappt -> anon bekommt eh 42501. Grants sind Relikte (Consumer alle service_role/
-- authenticated: funnel-health/embed-billing-cron/admin/sv-inbox; kein anon-Consumer im Code).
-- v_offene_anfragen hat schon keinen anon-Grant. Defense-in-Depth: haelt die Views von der
-- anon-Exposure-Radar (falls eine Basistabelle spaeter versehentlich einen anon-Grant bekommt).
revoke select on public.v_claim_for_gast from anon;
revoke select on public.v_embed_billing_faellig from anon;
revoke select on public.v_funnel_real from anon;
revoke select on public.v_sv_inbox from anon;
