-- Anon-Grant-Cap Runde 3a (Task A): 5 rein interne Tabellen - anon-SELECT Full-Revoke.
--
-- Kontext: systematischer Grant-Audit 15./16.07. (AGENTS.md Anon-Grant-Gate,
-- Baseline scripts/anon-sensitive-grants-baseline.json 15 -> 10).
-- Alle 5 Grants waren LATENT (RLS: keine anon-Policy bzw. jeder Policy-Zweig
-- auth.uid()-gated -> true-anon las 0 Zeilen), aber ein table-weiter anon-SELECT-
-- Grant wird scharf, sobald je ein anon-Policy-Zweig Zeilen durchlaesst.
--
-- Consumer-Audit 16.07. (Worktree = staging ccf7c770f), alle Zugriffe klassifiziert:
--   admin_termine: alle Reader/Writer = createAdminClient (embed/reservierungs-rueckruf,
--     public-rueckruf, flow/[token]/actions, makler/erstelle-anfrage, event-syncs) oder
--     authenticated Staff-Portale (TerminListeClient, dispatch/*, mitarbeiter/*, faelle/*).
--   aircall_relay_seats: lib/aircall/client.ts + bridge.ts = createAdminClient;
--     admin/einstellungen-UI = authenticated.
--   gutachter_waitlist: public Signup (lib/actions/gutachter-waitlist.ts) laeuft inkl.
--     .insert().select('id') KOMPLETT ueber createAdminClient (service_role) -> Returning
--     braucht keinen anon-SELECT. Admin-UI = authenticated.
--   sv_buero + vehicle_ownership_history: 0 direkte .from()-Consumer im Code.
-- Keine Views ueber den 5 Tabellen; keine PostgREST-Embeds; alle Funktions-Treffer
-- SECURITY DEFINER oder reine updated_at-Trigger ohne anon-DML-Pfad.
--
-- authenticated + service_role behalten ihre Grants unveraendert.
revoke select on public.admin_termine from anon;
revoke select on public.aircall_relay_seats from anon;
revoke select on public.gutachter_waitlist from anon;
revoke select on public.sv_buero from anon;
revoke select on public.vehicle_ownership_history from anon;
