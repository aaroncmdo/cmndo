-- CMM-44 Phase-6 DB-Verifikation — ausführen sobald DB wieder erreichbar (544-Outage 2026-05-23).
-- Zweck: DB-Seite der Plan-Revalidierung (docs/23.05.2026/cmm44-phase6-plan-revalidierung.md §4).
-- Via MCP execute_sql (project paizkjajbuxxksdoycev) oder `npx supabase db query --linked --file`.

-- ============ 1 · STRUKTUR: existieren die Sub-Tabellen + wie viele Spalten ============
SELECT table_name, count(*) AS col_count
FROM information_schema.columns
WHERE table_schema='public'
  AND table_name IN ('faelle','claims','kanzlei_faelle','gutachter_termine','gutachten',
                     'auftraege','claim_parties','claim_payments','vehicles','vorschaeden')
GROUP BY table_name ORDER BY table_name;

-- ============ 2 · SP-I (kanzlei_faelle): existieren die relocateten Spalten? ============
SELECT column_name
FROM information_schema.columns
WHERE table_schema='public' AND table_name='kanzlei_faelle'
  AND column_name IN ('regulierung_am','mandatsnummer','vs_eskalationsstufe','kuerzungs_betrag',
    'anschlussschreiben_am','anschlussschreiben_url','ruege_counter','ruege_gesendet_am',
    'kanzlei_honorar','kanzlei_provision_status','kanzlei_id','vs_kuerzung_grund')
ORDER BY column_name;

-- ============ 3 · SP-I BACKFILL-GAP: faelle hat Wert, kanzlei_faelle (SSoT) ist NULL? ============
-- (1:1 via claim_id). gap>0 => Backfill unvollständig ODER Writer schreibt nur faelle (Datenverlust).
SELECT
  count(*) FILTER (WHERE f.regulierung_am IS NOT NULL AND kf.regulierung_am IS NULL)          AS gap_regulierung_am,
  count(*) FILTER (WHERE f.mandatsnummer IS NOT NULL AND kf.mandatsnummer IS NULL)            AS gap_mandatsnummer,
  count(*) FILTER (WHERE f.vs_eskalationsstufe IS NOT NULL AND kf.vs_eskalationsstufe IS NULL) AS gap_vs_eskstufe,
  count(*) FILTER (WHERE f.kuerzungs_betrag IS NOT NULL AND kf.kuerzungs_betrag IS NULL)      AS gap_kuerzung,
  count(*) FILTER (WHERE f.anschlussschreiben_am IS NOT NULL AND kf.anschlussschreiben_am IS NULL) AS gap_as_am,
  count(*) FILTER (WHERE f.kanzlei_honorar IS NOT NULL AND kf.kanzlei_honorar IS NULL)        AS gap_honorar,
  count(*) FILTER (WHERE f.kanzlei_id IS NOT NULL AND kf.kanzlei_id IS NULL)                  AS gap_kanzlei_id
FROM faelle f JOIN kanzlei_faelle kf ON kf.claim_id = f.claim_id;

-- ============ 4 · SP-G (gutachten 1:1): Backfill-Gap ============
SELECT
  count(*) FILTER (WHERE f.nutzungsausfall_tagessatz IS NOT NULL AND g.nutzungsausfall_tagessatz IS NULL) AS gap_nutzungsausfall,
  count(*) FILTER (WHERE f.wertminderung IS NOT NULL AND g.wertminderung IS NULL) AS gap_wertminderung
FROM faelle f JOIN gutachten g ON g.claim_id = f.claim_id;

-- ============ 5 · SP-B (claims 1:1): Stichprobe claim-globale Spalten Backfill-Gap ============
-- Spaltennamen ggf. an reale SP-B-Spalten anpassen (lead_preis_*, marketing_*, polizei_*).
SELECT
  count(*) FILTER (WHERE f.marketing_quelle IS NOT NULL AND c.marketing_quelle IS NULL) AS gap_marketing_quelle,
  count(*) FILTER (WHERE f.polizei_aktenzeichen IS NOT NULL AND c.polizei_aktenzeichen IS NULL) AS gap_polizei_akz
FROM faelle f JOIN claims c ON c.id = f.claim_id;

-- ============ 6 · MIGRATIONS-DRIFT: applied versions (Abgleich mit supabase/migrations/) ============
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 60;

-- ============ 7 · SP-D gutachter_termine: existiert besichtigungsort + re_termin_token? ============
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='gutachter_termine'
  AND column_name LIKE 'besichtigungsort%' OR (table_name='gutachter_termine' AND column_name='re_termin_token')
ORDER BY column_name;
