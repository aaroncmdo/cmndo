-- CMM-44 SP-G — Live-DB-Messung (2026-05-20)
-- 19 faelle-Spalten (16 Gutachten-Cluster + 3 Nutzungsausfall-Mietwagen mit Heimat
-- `gutachten`). Misst faelle-Schema, Coverage, gutachten-Ziel-Spalten-Existenz,
-- 1:N-Semantik (gutachten-Zeilen pro claim_id).
-- Reproduzierbar: npx supabase db query --linked --file scripts/cmm44-spg-measure.sql
WITH spg_src(srt, faelle_col, gutachten_col) AS (VALUES
  ( 1, 'gutachten_eingegangen_am',         'fertiggestellt_am'),
  ( 2, 'gutachten_betrag',                 'gesamt_schadensbetrag'),
  ( 3, 'gutachter_honorar',                'gutachten_sv_honorar_netto'),
  ( 4, 'ocr_extrahiert_am',                'ocr_finished_at'),
  ( 5, 'ocr_rohdaten',                     'gutachten_ocr_raw'),
  ( 6, 'ki_kalkulation',                   '?'),
  ( 7, 'ki_kalkulation_am',                '?'),
  ( 8, 'ki_geschaetzte_kosten_min',        '?'),
  ( 9, 'ki_geschaetzte_kosten_max',        '?'),
  (10, 'gutachten_vorhanden',              '(abgeleitet)'),
  (11, 'gutachten_hochgeladen_am',         'pdf_uploaded_at'),
  (12, 'gutachten_positionen',             '?'),
  (13, 'gutachten_nummer',                 'auftragsnummer'),
  (14, 'reparaturkosten',                  'reparaturkosten_netto'),
  (15, 'wertminderung',                    'minderwert'),
  (16, 'gutachten_stundensatz',            '?'),
  (17, 'nutzungsausfall_tagessatz',        'gutachten_nutzungsausfall_tagessatz_eur'),
  (18, 'reparaturdauer_tage',              'wiederbeschaffungsdauer_tage'),
  (19, 'nutzungsausfall_gesamt',           '?')
)
SELECT 0 AS srt, 'TOTALS: faelle.spalten='
  || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='faelle')::text
  || ' | gutachten.spalten='
  || (SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='gutachten')::text
  || ' | gutachten_rows='
  || (SELECT count(*) FROM public.gutachten)::text
  || ' | distinct_claims='
  || (SELECT count(DISTINCT claim_id) FROM public.gutachten)::text AS zeile
UNION ALL
SELECT 100 + s.srt AS srt,
  rpad(s.faelle_col, 32) || '| f.udt=' || rpad(COALESCE(f.udt_name, '!! FEHLT'), 14)
  || '| -> g.' || rpad(s.gutachten_col, 42)
  || CASE WHEN g.column_name IS NOT NULL
          THEN '| g.udt=' || g.udt_name || ' null=' || g.is_nullable
          WHEN s.gutachten_col IN ('?', '(abgeleitet)')
          THEN '| (kein direktes Ziel)'
          ELSE '| !! FEHLT auf gutachten' END AS zeile
FROM spg_src s
LEFT JOIN information_schema.columns f
  ON f.table_schema='public' AND f.table_name='faelle' AND f.column_name=s.faelle_col
LEFT JOIN information_schema.columns g
  ON g.table_schema='public' AND g.table_name='gutachten' AND g.column_name=s.gutachten_col
ORDER BY srt;
