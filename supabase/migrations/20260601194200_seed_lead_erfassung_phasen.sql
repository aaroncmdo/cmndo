-- P1 (dispatch-config-unify): unified Flow 'lead-erfassung', 9 Sektion-Phasen.
-- Die Phasen == die sektion-Gruppen des flachen Dispatcher-Views (Spec §4).
-- Additiv (neue Flow); bestehende Flows unberuehrt.
INSERT INTO onboarding_phasen (flow_key, reihenfolge, phase_key, titel, eyebrow)
VALUES
  ('lead-erfassung', 10, 'kontakt',         'Kontakt & Erreichbarkeit', 'Wer ist der Kunde?'),
  ('lead-erfassung', 20, 'schaden',         'Schaden',                  'Was ist beschädigt?'),
  ('lead-erfassung', 30, 'unfall',          'Unfallhergang',            'Wie & wo ist es passiert?'),
  ('lead-erfassung', 40, 'fahrzeug',        'Fahrzeug & Halter',        'Welches Fahrzeug?'),
  ('lead-erfassung', 50, 'schuld',          'Schuld & Haftung',         'Wer trägt die Schuld?'),
  ('lead-erfassung', 60, 'service_kanzlei', 'Service & Kanzlei',        'Welcher Umfang?'),
  ('lead-erfassung', 70, 'termin_sv',       'Termin & Besichtigung',    'Wann & wo besichtigen?'),
  ('lead-erfassung', 80, 'vollmacht',       'Vollmacht & SA',           'Unterschrift'),
  ('lead-erfassung', 90, 'status',          'Status & Triage',          'Intern');
