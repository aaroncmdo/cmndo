-- P3.1 (Operativ-Audit 17.07.): Schutz-FKs auf ungeschuetzte User-/Referenz-Spalten.
-- Verhindert die Waisen-Klasse fail-closed (Praezedenz: tasks.empfaenger_user_id hatte 3 echte
-- Waisen nach dem golive-Cleanup, Mig 20260716234657). Alle 4 Spalten: 0 Waisen (prod-geprobt),
-- nullable. ON DELETE SET NULL bewusst statt NO ACTION: der reale profiles-Delete-Pfad ist der
-- manuelle golive-Cleanup (cron_dsgvo_hard_delete ist ein Stub, anonymisiert nur claim_parties,
-- loescht keine profiles) -- SET NULL nullt den Metadaten-Verweis sauber statt den Cleanup zu
-- blocken und erhaelt die Entity (Dokument/Claim/Provision/Person bleibt).
-- NICHT enthalten: partner_provisionen.fall_id (Legacy-Duplikat; die Geschwister-Spalte claim_id
-- hat bereits partner_provisionen_claim_bridge_fkey).
ALTER TABLE public.fall_dokumente
  ADD CONSTRAINT fall_dokumente_hochgeladen_von_user_id_fkey
  FOREIGN KEY (hochgeladen_von_user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.claims
  ADD CONSTRAINT claims_eskaliert_an_admin_id_fkey
  FOREIGN KEY (eskaliert_an_admin_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.partner_provisionen
  ADD CONSTRAINT partner_provisionen_lead_id_fkey
  FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL;

ALTER TABLE public.personen
  ADD CONSTRAINT personen_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
