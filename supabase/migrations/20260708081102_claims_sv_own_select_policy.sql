-- Golden-Path-Fund 08.07.: die claims-SELECT-RLS hatte KEINEN SV-Pfad (nur kunde/dispatch/party/
-- admin/kb). Folge: SVs konnten ihre eigenen Claims nicht per User-Client lesen -> Stellungnahme-
-- Seite 404te + Gutachten-Upload-Ownership-Gates (gutachter/fall/[id]/actions.ts) lieferten
-- "Fall nicht gefunden". Die Bridge-RLS + claim_sichtbar_fuer_aktuellen_user HABEN den sv_id-Pfad,
-- die claims-Tabellen-Policy verlor ihn bei der Konsolidierung. Diese additive SELECT-Policy stellt
-- den SV-Lesezugriff auf die EIGENEN zugewiesenen Claims wieder her (kein Leak: SV sieht nur seine
-- Claims = identisch zu dem, was Bridge/claim_sichtbar bereits erlauben). Berührt die bestehenden
-- _consolidated-Policies NICHT (kollisionsarm).
create policy claims_sv_own_select on public.claims
  for select
  to authenticated
  using (
    sv_id in (select id from public.sachverstaendige where profile_id = (select auth.uid()))
  );
