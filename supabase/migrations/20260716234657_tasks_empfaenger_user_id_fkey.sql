-- P0.2 (Operativ-Audit 17.07.): tasks.empfaenger_user_id war der einzige ungeschuetzte
-- Assignee-FK -- der golive-Cleanup 13.07. loeschte Admin-Profile und hinterliess 3 verwaiste
-- reliability-Alerts (stiller Alerting-Ausfall). Waisen wurden vorab per DML auf den aktiven
-- Admin re-pointed. NO ACTION bewusst wie das Geschwister tasks_zugewiesen_an_fkey:
-- eine Profil-Loeschung muss kuenftig bewusst reassignen statt still Waisen zu erzeugen.
ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_empfaenger_user_id_fkey
  FOREIGN KEY (empfaenger_user_id) REFERENCES public.profiles(id);
