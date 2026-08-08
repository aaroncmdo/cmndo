-- B: makler_empfehlung (10 EUR Sponsor-Override) im Partner-Billing sichtbar machen.
-- Bis 08.08. fehlte ein Zweig fuer partner_typ='makler_empfehlung' -> die Override-Provisionen
-- waren im Admin-Finance-Panel unsichtbar + nicht auszahlbar. Dieser Zweig ist ein 1:1-Klon des
-- makler-Zweigs (partner_id = Sponsor-makler.id -> LEFT JOIN makler). Additiv, keine Spalten-
-- Aenderung; die bestehenden 8 Zweige sind byte-identisch aus pg_get_viewdef uebernommen.
CREATE OR REPLACE VIEW public.v_partner_billing AS
 SELECT 'abrechnungen'::text AS quelle_tabelle,
    a.id AS quelle_id,
    'sv'::text AS partner_typ,
    a.empfaenger_id AS partner_id,
    a.empfaenger_name AS partner_name,
    'forderung'::text AS richtung,
    'rechnung'::text AS dokument_typ,
    a.abrechnungs_nr AS referenz_nr,
    a.summe_netto AS betrag_netto,
    a.ust_satz,
    a.ust_betrag,
    a.summe_brutto AS betrag_brutto,
    true AS ust_status_bekannt,
        CASE
            WHEN a.status = 'storniert'::text THEN 'storniert'::text
            WHEN a.status = 'fehlgeschlagen'::text THEN 'fehlgeschlagen'::text
            WHEN a.status = 'bezahlt'::text THEN 'erledigt'::text
            WHEN a.status = 'entwurf'::text THEN 'entwurf'::text
            WHEN a.faellig_am IS NOT NULL AND a.faellig_am < CURRENT_DATE AND a.bezahlt_am IS NULL THEN 'faellig'::text
            ELSE 'offen'::text
        END AS status_norm,
    a.status AS status_roh,
    a.versand_datum AS datum,
    a.faellig_am,
    a.bezahlt_am AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM abrechnungen a
  WHERE a.empfaenger_typ = 'sv'::text AND (a.abrechnungs_nr IS NULL OR a.abrechnungs_nr !~~ '%-S'::text)
UNION ALL
 SELECT 'kanzlei_abrechnungen'::text AS quelle_tabelle,
    k.id AS quelle_id,
    'kanzlei'::text AS partner_typ,
    k.kanzlei_id AS partner_id,
    kz.name AS partner_name,
    'forderung'::text AS richtung,
    'rechnung'::text AS dokument_typ,
    k.rechnungsnummer AS referenz_nr,
    k.endbetrag_netto AS betrag_netto,
    NULL::numeric AS ust_satz,
    k.mwst_betrag AS ust_betrag,
    k.endbetrag_brutto AS betrag_brutto,
    true AS ust_status_bekannt,
        CASE
            WHEN k.status = 'bezahlt'::text THEN 'erledigt'::text
            WHEN k.fehlgeschlagen_am IS NOT NULL THEN 'fehlgeschlagen'::text
            WHEN k.faelligkeitsdatum IS NOT NULL AND k.faelligkeitsdatum < CURRENT_DATE AND k.bezahlt_am IS NULL THEN 'faellig'::text
            ELSE 'offen'::text
        END AS status_norm,
    k.status AS status_roh,
    k.versendet_am AS datum,
    k.faelligkeitsdatum AS faellig_am,
    k.bezahlt_am AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM kanzlei_abrechnungen k
     LEFT JOIN kanzleien kz ON kz.id = k.kanzlei_id
UNION ALL
 SELECT 'sv_onboarding_rechnungen'::text AS quelle_tabelle,
    o.id AS quelle_id,
    'sv'::text AS partner_typ,
    o.sv_id AS partner_id,
    NULL::text AS partner_name,
    'forderung'::text AS richtung,
    'onboarding'::text AS dokument_typ,
    o.rechnungs_nr AS referenz_nr,
    o.netto_cent::numeric / 100.0 AS betrag_netto,
    o.ust_satz_pct AS ust_satz,
    o.ust_cent::numeric / 100.0 AS ust_betrag,
    o.brutto_cent::numeric / 100.0 AS betrag_brutto,
    true AS ust_status_bekannt,
        CASE
            WHEN o.stripe_payment_intent_id IS NOT NULL THEN 'erledigt'::text
            WHEN o.versendet_am IS NOT NULL THEN 'offen'::text
            ELSE 'entwurf'::text
        END AS status_norm,
    NULL::text AS status_roh,
    o.rechnungs_datum::timestamp with time zone AS datum,
    NULL::date AS faellig_am,
    o.versendet_am AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM sv_onboarding_rechnungen o
UNION ALL
 SELECT 'partner_provisionen'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'makler'::text AS partner_typ,
    pp.partner_id,
    m.firma AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.betrag_netto_eur AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN m.ist_kleinunternehmer THEN 0
            WHEN m.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.betrag_netto_eur *
        CASE
            WHEN m.ist_kleinunternehmer THEN 0::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.betrag_netto_eur *
        CASE
            WHEN m.ist_kleinunternehmer THEN 1::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'storniert'::text THEN 'storniert'::text
            WHEN pp.ausgezahlt_am IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text AND pp.abrechnung_id IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            WHEN pp.status = 'pending'::text THEN 'gehalten'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
        CASE
            WHEN pp.abrechnung_id IS NOT NULL THEN pp.erstellt_am
            ELSE pp.storniert_am
        END AS erledigt_am,
    pp.claim_id,
    pp.fall_id
   FROM partner_provisionen pp
     LEFT JOIN makler m ON m.id = pp.partner_id
  WHERE pp.partner_typ = 'makler'::text
UNION ALL
 SELECT 'partner_provisionen'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'werkstatt'::text AS partner_typ,
    pp.partner_id,
    w.name AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.betrag_netto_eur AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN w.ist_kleinunternehmer THEN 0
            WHEN w.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.betrag_netto_eur *
        CASE
            WHEN w.ist_kleinunternehmer THEN 0::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.betrag_netto_eur *
        CASE
            WHEN w.ist_kleinunternehmer THEN 1::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'storniert'::text THEN 'storniert'::text
            WHEN pp.ausgezahlt_am IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            WHEN pp.status = 'pending'::text THEN 'gehalten'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    COALESCE(pp.ausgezahlt_am, pp.storniert_am) AS erledigt_am,
    pp.claim_id,
    pp.fall_id
   FROM partner_provisionen pp
     LEFT JOIN werkstaetten w ON w.id = pp.partner_id
  WHERE pp.partner_typ = 'werkstatt'::text
UNION ALL
 SELECT 'partner_provisionen'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'firmen_flotte'::text AS partner_typ,
    pp.partner_id,
    f.name AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.betrag_netto_eur AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN f.ist_kleinunternehmer THEN 0
            WHEN f.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.betrag_netto_eur *
        CASE
            WHEN f.ist_kleinunternehmer THEN 0::numeric
            WHEN f.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.betrag_netto_eur *
        CASE
            WHEN f.ist_kleinunternehmer THEN 1::numeric
            WHEN f.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR f.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'storniert'::text THEN 'storniert'::text
            WHEN pp.ausgezahlt_am IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            WHEN pp.status = 'pending'::text THEN 'gehalten'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    COALESCE(pp.ausgezahlt_am, pp.storniert_am) AS erledigt_am,
    pp.claim_id,
    pp.fall_id
   FROM partner_provisionen pp
     LEFT JOIN firmen f ON f.id = pp.partner_id
  WHERE pp.partner_typ = 'firmen_flotte'::text
UNION ALL
 SELECT 'partner_staffel_bonus'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'makler'::text AS partner_typ,
    pp.partner_id,
    m.firma AS partner_name,
    'auszahlung'::text AS richtung,
    'bonus'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.bonus_betrag_netto AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN m.ist_kleinunternehmer THEN 0
            WHEN m.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.bonus_betrag_netto *
        CASE
            WHEN m.ist_kleinunternehmer THEN 0::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.bonus_betrag_netto *
        CASE
            WHEN m.ist_kleinunternehmer THEN 1::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'ausgezahlt'::text THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    NULL::timestamp with time zone AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM partner_staffel_bonus pp
     LEFT JOIN makler m ON m.id = pp.partner_id
  WHERE pp.partner_typ = 'makler'::text
UNION ALL
 SELECT 'partner_staffel_bonus'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'werkstatt'::text AS partner_typ,
    pp.partner_id,
    w.name AS partner_name,
    'auszahlung'::text AS richtung,
    'bonus'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.bonus_betrag_netto AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN w.ist_kleinunternehmer THEN 0
            WHEN w.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.bonus_betrag_netto *
        CASE
            WHEN w.ist_kleinunternehmer THEN 0::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.bonus_betrag_netto *
        CASE
            WHEN w.ist_kleinunternehmer THEN 1::numeric
            WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'ausgezahlt'::text THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
    NULL::timestamp with time zone AS erledigt_am,
    NULL::uuid AS claim_id,
    NULL::uuid AS fall_id
   FROM partner_staffel_bonus pp
     LEFT JOIN werkstaetten w ON w.id = pp.partner_id
  WHERE pp.partner_typ = 'werkstatt'::text
UNION ALL
 SELECT 'partner_provisionen'::text AS quelle_tabelle,
    pp.id AS quelle_id,
    'makler_empfehlung'::text AS partner_typ,
    pp.partner_id,
    m.firma AS partner_name,
    'auszahlung'::text AS richtung,
    'provision'::text AS dokument_typ,
    NULL::text AS referenz_nr,
    pp.betrag_netto_eur AS betrag_netto,
    COALESCE(pp.ust_satz,
        CASE
            WHEN m.ist_kleinunternehmer THEN 0
            WHEN m.ist_kleinunternehmer IS FALSE THEN 19
            ELSE NULL::integer
        END::numeric) AS ust_satz,
    COALESCE(pp.ust_betrag, round(pp.betrag_netto_eur *
        CASE
            WHEN m.ist_kleinunternehmer THEN 0::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19
            ELSE NULL::numeric
        END, 2)) AS ust_betrag,
    COALESCE(pp.betrag_brutto, round(pp.betrag_netto_eur *
        CASE
            WHEN m.ist_kleinunternehmer THEN 1::numeric
            WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19
            ELSE NULL::numeric
        END, 2)) AS betrag_brutto,
    pp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL AS ust_status_bekannt,
        CASE
            WHEN pp.status = 'storniert'::text THEN 'storniert'::text
            WHEN pp.ausgezahlt_am IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text AND pp.abrechnung_id IS NOT NULL THEN 'erledigt'::text
            WHEN pp.status = 'freigegeben'::text THEN 'freigegeben'::text
            WHEN pp.status = 'pending'::text THEN 'gehalten'::text
            ELSE pp.status
        END AS status_norm,
    pp.status AS status_roh,
    pp.erstellt_am AS datum,
    NULL::date AS faellig_am,
        CASE
            WHEN pp.abrechnung_id IS NOT NULL THEN pp.erstellt_am
            ELSE pp.storniert_am
        END AS erledigt_am,
    pp.claim_id,
    pp.fall_id
   FROM partner_provisionen pp
     LEFT JOIN makler m ON m.id = pp.partner_id
  WHERE pp.partner_typ = 'makler_empfehlung'::text;
