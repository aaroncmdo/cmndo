-- CMM-44 SP-G — Verify: 5 neue Spalten auf gutachten?
-- Nach PR1-Apply muss spg_neu_auf_gutachten = 5 sein.
SELECT count(*) AS spg_neu_auf_gutachten
FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachten'
  AND column_name IN (
    'ki_kalkulation','ki_kalkulation_am',
    'ki_geschaetzte_kosten_min','ki_geschaetzte_kosten_max',
    'positionen'
  );
