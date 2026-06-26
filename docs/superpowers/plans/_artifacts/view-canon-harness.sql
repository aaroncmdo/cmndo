-- Claim-Read-View-Kanonisierung — Äquivalenz-Harness (Task 2)
-- Plan: docs/superpowers/plans/2026-06-26-claim-read-view-canonicalization.md
--
-- Zweck: beweisen, dass eine neue Shadow-Layer-View bit-identisch zur Live-View ist
-- (über ALLE Rows), AUSSER den bewusst vereinheitlichten Decision-Feldern. Erst wenn
-- grün → CREATE OR REPLACE-Swap. Alle Queries sind READ (execute_sql).
--
-- Exempt-Listen (vor Gebrauch gegen die echten Spaltennamen der Live-View prüfen):
--   EXEMPT_VCF  (Decision a, termin-abgeleitet, ändert sich nur in v_claim_full):
--     besichtigungsort_adresse, besichtigungsort_lat, besichtigungsort_lng,
--     besichtigungsort_notiz, besichtigungsort_place_id, no_show_gemeldet_am,
--     re_termin_token, re_termin_token_eingelaufen_am, re_termin_eskalation_an_kb_am
--   EXEMPT_VFMAT (Decision b, geschädigter-Party-abgeleitet, ändert sich nur in vfmat):
--     kunde_vorname, kunde_nachname, kunde_telefon, kunde_email, kunde_strasse,
--     kunde_plz, kunde_stadt, kunde_adresse, ist_fahrzeughalter

-- ── (1) SHAPE-DIFF: Spalten-Menge alt == neu. Erwartung: 0 Rows. ───────────────
-- <OLD>/<NEW> ersetzen (z.B. v_claim_full / v_claim_full_canon_shadow).
with a as (select column_name, data_type from information_schema.columns where table_name = '<OLD>'),
     b as (select column_name, data_type from information_schema.columns where table_name = '<NEW>')
select 'only_old' as src, column_name, data_type from (select * from a except select * from b) x
union all
select 'only_new' as src, column_name, data_type from (select * from b except select * from a) y;

-- ── (2) ROW-ÄQUIVALENZ (exempt-aware): Kern-Gate. Erwartung: 0 Rows. ───────────
-- to_jsonb(row) minus Exempt-Keys vergleichen. <EXEMPT> = ARRAY['col1','col2',...].
select o.id
from <OLD> o
join <NEW> n on n.id = o.id
where (to_jsonb(o.*) - <EXEMPT>) is distinct from (to_jsonb(n.*) - <EXEMPT>);
-- Row-Vollständigkeit (keine fehlenden/zusätzlichen Rows):
-- select (select count(*) from <OLD>) as old_n, (select count(*) from <NEW>) as new_n;

-- ── (3) SPALTEN-DRILLDOWN: welche Spalte je Claim differiert (inkl. Exempt). ────
-- Für Review: zeigt exakt key/old/new der Abweichungen. Die nicht-exempt-Treffer
-- MÜSSEN 0 sein (sonst Mapping-Fehler → Shadow fixen); die exempt-Treffer sind der
-- Decision-Delta-Satz → manuell als "gewollt" abnehmen.
select o.id, k.key, k.old_val, k.new_val
from <OLD> o
join <NEW> n on n.id = o.id
cross join lateral (
  select oj.key, oj.value as old_val, nj.value as new_val
  from jsonb_each(to_jsonb(o.*)) oj
  join jsonb_each(to_jsonb(n.*)) nj on nj.key = oj.key
  where oj.value is distinct from nj.value
) k
order by o.id, k.key;
