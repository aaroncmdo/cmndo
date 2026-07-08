-- P1 Kanonische Partner-Abrechnung: kanonische Read-View ueber alle 8 Billing-Quellen.
-- 1 Zeile pro Beleg, normalisiert (richtung forderung/auszahlung, status_norm, USt).
-- Entkopplung gegen Doppelzaehlung: abrechnungen NUR empfaenger_typ='sv'; Kanzlei via
-- kanzlei_abrechnungen; Maik via provisionen_maik (schliesst abrechnungen[kanzlei|marketing] aus).
-- USt Auszahlungs-Seite: COALESCE(eingefroren, live aus Partner-ist_kleinunternehmer);
-- NULL-Status -> ust_status_bekannt=false (Cockpit blockt Auszahlung). security_invoker=true.
CREATE OR REPLACE VIEW public.v_partner_billing WITH (security_invoker = true) AS
SELECT 'abrechnungen'::text AS quelle_tabelle, a.id AS quelle_id,
  'sv'::text AS partner_typ, a.empfaenger_id AS partner_id, a.empfaenger_name AS partner_name,
  'forderung'::text AS richtung, 'rechnung'::text AS dokument_typ, a.abrechnungs_nr AS referenz_nr,
  a.summe_netto AS betrag_netto, a.ust_satz, a.ust_betrag, a.summe_brutto AS betrag_brutto,
  true AS ust_status_bekannt,
  CASE WHEN a.status='storniert' THEN 'storniert'
       WHEN a.status='fehlgeschlagen' THEN 'fehlgeschlagen'
       WHEN a.status='bezahlt' THEN 'erledigt'
       WHEN a.status='entwurf' THEN 'entwurf'
       WHEN a.faellig_am IS NOT NULL AND a.faellig_am < current_date AND a.bezahlt_am IS NULL THEN 'faellig'
       ELSE 'offen' END AS status_norm,
  a.status AS status_roh, a.versand_datum AS datum, a.faellig_am, a.bezahlt_am AS erledigt_am,
  NULL::uuid AS claim_id, NULL::uuid AS fall_id
FROM public.abrechnungen a WHERE a.empfaenger_typ = 'sv'
UNION ALL
SELECT 'kanzlei_abrechnungen', k.id, 'kanzlei', k.kanzlei_id, kz.name,
  'forderung', 'rechnung', k.rechnungsnummer,
  k.endbetrag_netto, NULL::numeric, k.mwst_betrag, k.endbetrag_brutto, true,
  CASE WHEN k.status='bezahlt' THEN 'erledigt'
       WHEN k.fehlgeschlagen_am IS NOT NULL THEN 'fehlgeschlagen'
       WHEN k.faelligkeitsdatum IS NOT NULL AND k.faelligkeitsdatum < current_date AND k.bezahlt_am IS NULL THEN 'faellig'
       ELSE 'offen' END,
  k.status, k.versendet_am, k.faelligkeitsdatum, k.bezahlt_am, NULL::uuid, NULL::uuid
FROM public.kanzlei_abrechnungen k LEFT JOIN public.kanzleien kz ON kz.id = k.kanzlei_id
UNION ALL
SELECT 'sv_onboarding_rechnungen', o.id, 'sv', o.sv_id, NULL::text,
  'forderung', 'onboarding', o.rechnungs_nr,
  o.netto_cent/100.0, o.ust_satz_pct, o.ust_cent/100.0, o.brutto_cent/100.0, true,
  CASE WHEN o.stripe_payment_intent_id IS NOT NULL THEN 'erledigt'
       WHEN o.versendet_am IS NOT NULL THEN 'offen' ELSE 'entwurf' END,
  NULL::text, o.rechnungs_datum::timestamptz, NULL::date, o.versendet_am, NULL::uuid, NULL::uuid
FROM public.sv_onboarding_rechnungen o
UNION ALL
SELECT 'makler_provisionen', mp.id, 'makler', mp.makler_id, m.firma,
  'auszahlung', 'provision', NULL::text,
  mp.betrag_netto_eur,
  COALESCE(mp.ust_satz, CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(mp.ust_betrag, mp.betrag_netto_eur * CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(mp.betrag_brutto, mp.betrag_netto_eur * CASE WHEN m.ist_kleinunternehmer THEN 1 WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (mp.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN mp.status='storniert' THEN 'storniert'
       WHEN mp.status='freigegeben' AND mp.abrechnung_id IS NOT NULL THEN 'erledigt'
       WHEN mp.status='freigegeben' THEN 'freigegeben'
       WHEN mp.status='pending' THEN 'gehalten' ELSE mp.status END,
  mp.status, mp.erstellt_am, NULL::date,
  CASE WHEN mp.abrechnung_id IS NOT NULL THEN mp.erstellt_am ELSE mp.storniert_am END,
  mp.claim_id, mp.fall_id
FROM public.makler_provisionen mp LEFT JOIN public.makler m ON m.id = mp.makler_id
UNION ALL
SELECT 'werkstatt_provisionen', wp.id, 'werkstatt', wp.werkstatt_id, w.name,
  'auszahlung', 'provision', NULL::text,
  wp.betrag_netto_eur,
  COALESCE(wp.ust_satz, CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(wp.ust_betrag, wp.betrag_netto_eur * CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(wp.betrag_brutto, wp.betrag_netto_eur * CASE WHEN w.ist_kleinunternehmer THEN 1 WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (wp.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN wp.status='storniert' THEN 'storniert'
       WHEN wp.ausgezahlt_am IS NOT NULL THEN 'erledigt'
       WHEN wp.status='freigegeben' THEN 'freigegeben'
       WHEN wp.status='pending' THEN 'gehalten' ELSE wp.status END,
  wp.status, wp.erstellt_am, NULL::date, COALESCE(wp.ausgezahlt_am, wp.storniert_am),
  wp.claim_id, wp.fall_id
FROM public.werkstatt_provisionen wp LEFT JOIN public.werkstaetten w ON w.id = wp.werkstatt_id
UNION ALL
SELECT 'provisionen_maik', pm.id, 'marketing', pm.marketing_partner_id, mkp.name,
  'auszahlung', 'provision', NULL::text,
  pm.netto_provision,
  COALESCE(pm.ust_satz, CASE WHEN mkp.ist_kleinunternehmer THEN 0 WHEN mkp.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(pm.ust_betrag, pm.netto_provision * CASE WHEN mkp.ist_kleinunternehmer THEN 0 WHEN mkp.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(pm.betrag_brutto, pm.netto_provision * CASE WHEN mkp.ist_kleinunternehmer THEN 1 WHEN mkp.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (pm.ust_satz IS NOT NULL OR mkp.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN pm.status='reversed' THEN 'storniert'
       WHEN pm.status='paid' THEN 'erledigt'
       WHEN pm.status='confirmed' THEN 'freigegeben'
       WHEN pm.status='pending' THEN 'gehalten' ELSE pm.status END,
  pm.status, COALESCE(pm.paid_at, (pm.monat || '-01')::timestamptz), NULL::date, pm.paid_at,
  NULL::uuid, NULL::uuid
FROM public.provisionen_maik pm LEFT JOIN public.marketing_partner mkp ON mkp.id = pm.marketing_partner_id
UNION ALL
SELECT 'makler_staffel_bonus', mb.id, 'makler', mb.makler_id, m.firma,
  'auszahlung', 'bonus', NULL::text,
  mb.bonus_betrag_netto,
  COALESCE(mb.ust_satz, CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(mb.ust_betrag, mb.bonus_betrag_netto * CASE WHEN m.ist_kleinunternehmer THEN 0 WHEN m.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(mb.betrag_brutto, mb.bonus_betrag_netto * CASE WHEN m.ist_kleinunternehmer THEN 1 WHEN m.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (mb.ust_satz IS NOT NULL OR m.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN mb.status='ausgezahlt' THEN 'erledigt' WHEN mb.status='freigegeben' THEN 'freigegeben' ELSE mb.status END,
  mb.status, mb.erstellt_am, NULL::date, NULL::timestamptz, NULL::uuid, NULL::uuid
FROM public.makler_staffel_bonus mb LEFT JOIN public.makler m ON m.id = mb.makler_id
UNION ALL
SELECT 'werkstatt_staffel_bonus', wb.id, 'werkstatt', wb.werkstatt_id, w.name,
  'auszahlung', 'bonus', NULL::text,
  wb.bonus_betrag_netto,
  COALESCE(wb.ust_satz, CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 19 ELSE NULL END),
  COALESCE(wb.ust_betrag, wb.bonus_betrag_netto * CASE WHEN w.ist_kleinunternehmer THEN 0 WHEN w.ist_kleinunternehmer IS FALSE THEN 0.19 ELSE NULL END),
  COALESCE(wb.betrag_brutto, wb.bonus_betrag_netto * CASE WHEN w.ist_kleinunternehmer THEN 1 WHEN w.ist_kleinunternehmer IS FALSE THEN 1.19 ELSE NULL END),
  (wb.ust_satz IS NOT NULL OR w.ist_kleinunternehmer IS NOT NULL),
  CASE WHEN wb.status='ausgezahlt' THEN 'erledigt' WHEN wb.status='freigegeben' THEN 'freigegeben' ELSE wb.status END,
  wb.status, wb.erstellt_am, NULL::date, NULL::timestamptz, NULL::uuid, NULL::uuid
FROM public.werkstatt_staffel_bonus wb LEFT JOIN public.werkstaetten w ON w.id = wb.werkstatt_id;

GRANT SELECT ON public.v_partner_billing TO authenticated, service_role;
