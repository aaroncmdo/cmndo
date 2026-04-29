-- CMM-32: v_faelle_mit_aktuellem_termin neu erstellen mit SELECT f.*.
--
-- Problem: Die View wurde mit einer expliziten Spalten-Liste erstellt.
-- Neue faelle-Spalten (lackfarbe_code, claim_id, kunde_vorname, …)
-- fehlen automatisch — aktuell 57 Spalten betroffen.
-- CREATE OR REPLACE erlaubt keine Spalten-Reihenfolge-Änderung,
-- daher DROP + CREATE.
--
-- Mit f.* wird die View bei jedem Query neu gegen den aktuellen
-- faelle-Katalog aufgelöst — neue Spalten erscheinen ohne weitere
-- View-Migrations.

DROP VIEW IF EXISTS v_faelle_mit_aktuellem_termin;

CREATE VIEW v_faelle_mit_aktuellem_termin
WITH (security_invoker = true)
AS
SELECT
  f.*,
  -- Aktueller Termin als Flat-Felder (Alias-Namen stabil halten —
  -- viele Caller selektieren per Name)
  t.id                      AS aktueller_termin_id,
  t.start_zeit              AS aktueller_termin_start,
  t.end_zeit                AS aktueller_termin_end,
  t.status                  AS aktueller_termin_status,
  t.sv_id                   AS aktueller_termin_sv_id,
  t.kanal                   AS aktueller_termin_kanal,
  t.typ                     AS aktueller_termin_typ,
  t.final_verbindlich_ab    AS aktueller_termin_final_verbindlich_ab,
  -- Legacy-Aliases für bestehende Caller
  t.start_zeit              AS sv_termin,
  t.status                  AS gutachter_termin_status,
  (t.status = 'bestaetigt') AS gutachter_termin_bestaetigt,
  t.vorgeschlagenes_datum   AS gutachter_gegenvorschlag_datum,
  t.gegenvorschlag_grund    AS gutachter_gegenvorschlag_grund
FROM faelle f
LEFT JOIN LATERAL (
  SELECT gt.*
  FROM gutachter_termine gt
  WHERE gt.fall_id = f.id
    AND gt.status = ANY (ARRAY[
      'bestaetigt'::text,
      'reserviert'::text,
      'durchgefuehrt'::text,
      'gegenvorschlag'::text
    ])
  ORDER BY
    CASE gt.status
      WHEN 'bestaetigt'     THEN 1
      WHEN 'gegenvorschlag' THEN 2
      WHEN 'reserviert'     THEN 3
      WHEN 'durchgefuehrt'  THEN 4
      ELSE 5
    END,
    gt.start_zeit DESC NULLS LAST
  LIMIT 1
) t ON true;

-- RLS-Grants wiederherstellen (nach DROP gehen sie verloren)
GRANT SELECT ON v_faelle_mit_aktuellem_termin TO authenticated;
GRANT SELECT ON v_faelle_mit_aktuellem_termin TO service_role;
