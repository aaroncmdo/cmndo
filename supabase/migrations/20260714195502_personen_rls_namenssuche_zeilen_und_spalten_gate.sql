-- Globale Suche: Personen-Namenssuche reparieren (Root-Fix, Aaron-Entscheid 14.07.).
--
-- BEFUND: personen hat RLS an, aber NULL Policies -> Default-Deny fuer jeden User-Client.
-- Der Personen-Zweig von search_global (SECURITY INVOKER) liefert daher fuer JEDE Rolle 0
-- Treffer, auch fuer admin (auf prod per JWT-Impersonation bewiesen: 0 von 4 Zeilen sichtbar).
-- "Name" ist das erste Wort im Such-Placeholder -> der prominenteste Sucheinstieg war tot.
--
-- FIX IN ZWEI SCHICHTEN, weil RLS ganze ZEILEN gewaehrt, personen aber schwere PII haelt
-- (geburtsdatum, fuehrerscheinnummer, adresse_*, telefon, mobil, email, notiz):
--   1. ZEILEN-Gate  = RLS-Policy ueber den bestehenden Sichtbarkeits-SSoT
--      claim_sichtbar_fuer_aktuellen_user() -> nur Personen zu Faellen, die der User sehen darf.
--      Genau EINE Policy je (Rolle, Command) -> Invariante der RLS-Konsolidierung B1 gewahrt.
--   2. SPALTEN-Gate = column-level GRANT. authenticated UND anon hatten bisher table-weiten
--      SELECT-Grant auf personen -- neutralisiert einzig durch die fehlende Policy. Die erste
--      permissive Policy waere damit der Single Point of Failure gewesen. Wir kappen den Grant
--      auf die 4 Spalten, die die Suche braucht -> Fuehrerscheinnummer/Geburtsdatum/Adresse
--      der GEGENPARTEI bleiben fuer User-Clients unerreichbar, auch via PostgREST direkt.
--
-- BLAST-RADIUS: einziger security-invoker-Consumer der Tabelle ist search_global selbst.
-- (v_claim_for_gast / v_lead_workstate / dokument_katalog_ctx matchen nur auf Spaltennamen
-- wie "personenschaden_flag", nicht auf die Tabelle -- geprueft via pg_get_viewdef.)
-- Alles andere liest personen via service_role (createAdminClient, z.B. ocr-trigger,
-- vs-meldung/claim-daten) -> von Grants und RLS unberuehrt. Netto sinkt die Angriffsflaeche.
--
-- VERIFIZIERT auf prod (Transaktion + Rollback, keine Rueckstaende):
--   vorher : search_global('Flowx') als admin -> 0 Treffer
--   nachher: search_global('Flowx') als admin -> claim | "Testkunde Flowcheck" | CLM-SMOKE-SUCHE
--   Spalten: select fuehrerscheinnummer/geburtsdatum/telefon als authenticated -> 42501 denied

-- 1) SPALTEN-Gate
REVOKE SELECT ON public.personen FROM authenticated;
REVOKE SELECT ON public.personen FROM anon;
GRANT SELECT (id, vorname, nachname, firma) ON public.personen TO authenticated;

-- 2) ZEILEN-Gate
CREATE POLICY personen__b1sel_au ON public.personen
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM claim_parties cp
      JOIN claims c ON c.id = cp.claim_id
      WHERE cp.person_id = personen.id
        AND cp.ist_aktiv
        AND claim_sichtbar_fuer_aktuellen_user(c.id)
    )
  );
