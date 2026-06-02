-- W2.2 / AAR-950: sv_organisation*-Modell entdoppeln. organisationen bleibt die
-- SSoT (von abrechnung-erstellen Sammelrechnung genutzt). sv_organisation +
-- _memberships + _laeufer_reports waren 0 Zeilen, kein Code-Reader, keine View-/
-- Function-Deps; die 2 RLS-Policies haengen an den gedroppten Tischen selbst.
-- Die externe FK gutachten.laeufer_report_id (0 non-null, kein Reader) wird
-- mitentfernt. Reihenfolge: erst die FK-Spalte, dann Kinder, dann Parent.
alter table public.gutachten drop column if exists laeufer_report_id;
drop table if exists public.sv_organisation_laeufer_reports;
drop table if exists public.sv_organisation_memberships;
drop table if exists public.sv_organisation;
