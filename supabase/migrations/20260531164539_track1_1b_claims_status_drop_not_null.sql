-- T1.1b (D2, Lifecycle-Freeze): claims.status wird die reine Lifecycle/Terminal-Achse.
-- Genesis (convert-lead-to-claim) setzt künftig work_state statt status -> status muss NULL
-- erlauben (NULL = "noch kein Terminal/VS-Override"). Rein additiv-relaxierend (kein bestehender
-- Write bricht; alle setzen status heute). CHECK-Tightening + Null-ing der 75 Bestands-Rows = T1.1c.
ALTER TABLE public.claims ALTER COLUMN status DROP NOT NULL;
