-- CMM-44 SP-J — Live-DB-Messung (2026-05-20)
-- 12 Abrechnungs-Spalten in `faelle` (Verdikt MOVE→abrechnungen).
-- Misst: faelle-Schema der 12, abrechnungen-Schema-Sub-Table, Cardinality
-- (1:1 vs 1:N pro Claim), FK-Constraints, Trigger.
WITH spj(srt, faelle_col, ziel_vermutung) AS (VALUES
  ( 1, 'zahlung_eingegangen_am',            'zahlung_eingegangen_am'),
  ( 2, 'zahlung_erwartet_am',               'zahlung_erwartet_am'),
  ( 3, 'zahlung_betrag',                    'zahlung_betrag'),
  ( 4, 'guthaben_verrechnet_netto',         'guthaben_verrechnet_netto'),
  ( 5, 'sv_nachzahlung_netto',              'sv_nachzahlung_netto'),
  ( 6, 'abrechnung_id',                     '(FK auf abrechnungen.id)'),
  ( 7, 'kanzlei_abrechnung_id',             '(FK auf abrechnungen.id)'),
  ( 8, 'schlussabrechnung_am',              'schlussabrechnung_am'),
  ( 9, 'zahlungsweg',                       'zahlungsweg'),
  (10, 'auszahlung_gutachter_eingegangen_am','auszahlung_gutachter_eingegangen_am'),
  (11, 'auszahlung_zahlungsweg',            'auszahlung_zahlungsweg'),
  (12, 'auszahlung_gutachter_betrag',       'auszahlung_gutachter_betrag')
)
SELECT 0 AS srt, 'TOTALS: faelle.spalten='
  || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle')::text
  || ' | abrechnungen.spalten='
  || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='abrechnungen')::text
  || ' | abrechnungen_rows='
  || (SELECT count(*) FROM public.abrechnungen)::text AS zeile
UNION ALL
SELECT 100 + s.srt AS srt,
  rpad(s.faelle_col, 38) || '| f.udt=' || rpad(COALESCE(f.udt_name, '!! FEHLT'), 14)
  || ' | f.cov=' || rpad(COALESCE((SELECT count(*)::text FROM public.faelle WHERE (to_jsonb(faelle) -> s.faelle_col) IS NOT NULL AND (to_jsonb(faelle) ->> s.faelle_col) <> ''), '?'), 3)
  || ' | -> a.' || rpad(s.ziel_vermutung, 42)
  || CASE WHEN a.column_name IS NOT NULL
          THEN '| a.udt=' || a.udt_name || ' null=' || a.is_nullable
          WHEN s.ziel_vermutung LIKE '(%'
          THEN '| (FK, kein Spalten-MOVE)'
          ELSE '| !! Ziel fehlt auf abrechnungen' END AS zeile
FROM spj s
LEFT JOIN information_schema.columns f
  ON f.table_schema='public' AND f.table_name='faelle' AND f.column_name=s.faelle_col
LEFT JOIN information_schema.columns a
  ON a.table_schema='public' AND a.table_name='abrechnungen' AND a.column_name=s.ziel_vermutung
ORDER BY srt;
