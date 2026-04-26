-- AAR-843: v_claim_timeline — aggregierte Verlaufs-Sicht über alle Sub-Asset-Tabellen
--
-- Architektur-Entscheidung (Master-Doc Anti-Pattern 14.9): KEINE eigene Timeline-
-- Tabelle. Stattdessen UNION ALL über die existierenden Quellen. Vorteile:
--   - Single Source of Truth pro Quelle
--   - Keine Doppel-Pflege beim INSERT
--   - Erweiterbar: neue Sub-Asset-Tabelle = eine UNION-Branch mehr
--
-- Sichtbarkeit:
--   sichtbar_fuer_kunde: false bei internen Events (OCR-Status, KB-Notizen mit
--     metadata.intern=true). Kunde sieht nur was zu seinem Verlauf gehört.
--   sichtbar_fuer_sv:    true bei gutachten/repair/termin-Events der eigenen
--     Aufträge. Default false bei vs_korrespondenz/claim_payments (interne Daten).
--
-- Performance: Bei wenigen Sub-Asset-Rows pro Claim (heute 0–dutzende) ist die
-- View schnell genug ohne MATERIALIZED. Bei Skalierung > 1000 Events/Claim
-- später materialisieren. Indizes auf claim_id/fall_id existieren bereits aus
-- den Sub-Asset-Migrationen.

CREATE OR REPLACE VIEW public.v_claim_timeline AS
SELECT * FROM (

  -- ─── 1) Lead-Events: Aufnahme + Konversion ─────────────────────────────
  SELECT
    md5('lead-aufgenommen-' || l.id)::uuid       AS event_id,
    l.konvertiert_zu_claim_id                    AS claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = l.konvertiert_zu_claim_id LIMIT 1) AS fall_id,
    l.created_at                                 AS event_at,
    'lead.aufgenommen'::text                     AS event_typ,
    'phase'::text                                AS event_kategorie,
    NULL::uuid                                   AS actor_user_id,
    'system'::text                               AS actor_rolle,
    jsonb_build_object('lead_id', l.id, 'quelle', l.source_channel) AS payload_jsonb,
    TRUE                                         AS sichtbar_fuer_kunde,
    FALSE                                        AS sichtbar_fuer_sv,
    NULL::text                                   AS detail_url_path
  FROM public.leads l
  WHERE l.konvertiert_zu_claim_id IS NOT NULL

  UNION ALL

  SELECT
    md5('lead-konvertiert-' || l.id)::uuid,
    l.konvertiert_zu_claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = l.konvertiert_zu_claim_id LIMIT 1),
    l.konvertiert_am,
    'lead.konvertiert',
    'phase',
    l.konvertiert_durch_user_id,
    'dispatcher',
    jsonb_build_object('lead_id', l.id),
    TRUE, FALSE, NULL
  FROM public.leads l
  WHERE l.konvertiert_zu_claim_id IS NOT NULL AND l.konvertiert_am IS NOT NULL

  UNION ALL

  -- ─── 2) phase_transitions (claims über faelle.claim_id JOIN) ────────────
  SELECT
    md5('phase-' || pt.id::text)::uuid,
    f.claim_id,
    pt.fall_id,
    pt.transition_at,
    'phase.geaendert',
    'phase',
    pt.transitioned_by,
    COALESCE(pt.actor_rolle, 'system'),
    jsonb_build_object(
      'from_phase',   pt.from_phase,
      'to_phase',     pt.to_phase,
      'trigger_type', pt.trigger_type,
      'grund',        pt.grund
    ),
    TRUE, TRUE, NULL
  FROM public.phase_transitions pt
  JOIN public.faelle f ON f.id = pt.fall_id
  WHERE f.claim_id IS NOT NULL

  UNION ALL

  -- ─── 3) Endzustand auf claims (5 Events: in_kommunikation_vs/regul./abgel./
  --        an_externe_kanzlei/storniert) ─────────────────────────────────
  SELECT
    md5('endzustand-' || c.id::text || '-' || c.status)::uuid,
    c.id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = c.id LIMIT 1),
    c.endzustand_gesetzt_am,
    'claim.' || c.status,
    'phase',
    c.endzustand_gesetzt_durch_user_id,
    'kb',
    jsonb_build_object(
      'status',                c.status,
      'regulierungs_betrag',   c.regulierungs_betrag,
      'vs_ablehnungs_grund',   c.vs_ablehnungs_grund,
      'endzustand_grund',      c.endzustand_grund
    ),
    TRUE, FALSE, NULL
  FROM public.claims c
  WHERE c.endzustand_gesetzt_am IS NOT NULL
    AND c.status IN ('in_kommunikation_vs','reguliert','abgelehnt','an_externe_kanzlei_uebergeben','storniert')

  UNION ALL

  -- ─── 4) Gutachten — beauftragt + final ──────────────────────────────────
  SELECT
    md5('gutachten-beauftragt-' || g.id::text)::uuid,
    g.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = g.claim_id LIMIT 1),
    g.created_at,
    'gutachten.beauftragt',
    'gutachten',
    NULL::uuid,
    'kb',
    jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id),
    TRUE, TRUE,
    '/faelle/' || (SELECT f.id FROM public.faelle f WHERE f.claim_id = g.claim_id LIMIT 1)::text
  FROM public.gutachten g
  WHERE g.claim_id IS NOT NULL

  UNION ALL

  SELECT
    md5('gutachten-final-' || g.id::text)::uuid,
    g.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = g.claim_id LIMIT 1),
    g.updated_at,
    'gutachten.fertig',
    'gutachten',
    NULL::uuid,
    'sv',
    jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id),
    TRUE, TRUE,
    '/faelle/' || (SELECT f.id FROM public.faelle f WHERE f.claim_id = g.claim_id LIMIT 1)::text
  FROM public.gutachten g
  WHERE g.claim_id IS NOT NULL AND g.status = 'final'

  UNION ALL

  -- ─── 5) Repairs ─────────────────────────────────────────────────────────
  SELECT
    md5('repair-' || r.id::text || '-' || r.status)::uuid,
    r.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = r.claim_id LIMIT 1),
    r.updated_at,
    'repair.' || r.status,
    'reparatur',
    NULL::uuid,
    'system',
    jsonb_build_object('repair_id', r.id, 'werkstatt_id', r.werkstatt_id, 'status', r.status),
    TRUE, FALSE, NULL
  FROM public.repairs r
  WHERE r.claim_id IS NOT NULL
    AND r.status IN ('geplant','in_arbeit','abgeschlossen')

  UNION ALL

  -- ─── 6) VS-Korrespondenz ────────────────────────────────────────────────
  SELECT
    md5('vsk-' || vk.id::text)::uuid,
    vk.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = vk.claim_id LIMIT 1),
    vk.datum,
    'vs.brief_versendet',
    'vs',
    vk.created_by_user_id,
    'kb',
    jsonb_build_object(
      'typ',          vk.typ,
      'kanal',        vk.kanal,
      'richtung',     vk.richtung,
      'versicherung', vk.versicherung,
      'aktenzeichen', vk.aktenzeichen
    ),
    TRUE, FALSE, NULL
  FROM public.vs_korrespondenz vk
  WHERE vk.claim_id IS NOT NULL
    AND vk.status NOT IN ('archiviert')

  UNION ALL

  -- ─── 7) Claim-Payments — erhalten + final (status-Wechsel als Events) ───
  SELECT
    md5('payment-' || cp.id::text || '-' || cp.status)::uuid,
    cp.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = cp.claim_id LIMIT 1),
    cp.updated_at,
    'payment.' || cp.status,
    'zahlung',
    NULL::uuid,
    'kb',
    jsonb_build_object(
      'payment_id',          cp.id,
      'erhaltener_betrag',   cp.erhaltener_betrag,
      'forderungsbetrag',    cp.forderungsbetrag,
      'status',              cp.status
    ),
    TRUE, FALSE, NULL
  FROM public.claim_payments cp
  WHERE cp.claim_id IS NOT NULL
    AND cp.status IN ('erhalten','teilweise','final')

  UNION ALL

  -- ─── 8) Mietwagen ───────────────────────────────────────────────────────
  SELECT
    md5('mietwagen-start-' || cm.id::text)::uuid,
    cm.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = cm.claim_id LIMIT 1),
    cm.beginn_datum::timestamptz,
    'mietwagen.gestartet',
    'reparatur',
    NULL::uuid,
    'system',
    jsonb_build_object('mietwagen_id', cm.id, 'anbieter', cm.anbieter, 'fahrzeugklasse', cm.fahrzeugklasse),
    TRUE, FALSE, NULL
  FROM public.claim_mietwagen cm
  WHERE cm.claim_id IS NOT NULL AND cm.beginn_datum IS NOT NULL AND cm.status IN ('aktiv','beendet')

  UNION ALL

  SELECT
    md5('mietwagen-ende-' || cm.id::text)::uuid,
    cm.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = cm.claim_id LIMIT 1),
    cm.tatsaechliches_ende::timestamptz,
    'mietwagen.beendet',
    'reparatur',
    NULL::uuid,
    'system',
    jsonb_build_object('mietwagen_id', cm.id, 'tage_gesamt', cm.tage_gesamt, 'gesamtkosten_netto', cm.gesamtkosten_netto),
    TRUE, FALSE, NULL
  FROM public.claim_mietwagen cm
  WHERE cm.claim_id IS NOT NULL AND cm.tatsaechliches_ende IS NOT NULL

  UNION ALL

  -- ─── 9) Gutachter-Termine (über faelle.claim_id) ────────────────────────
  SELECT
    md5('termin-' || gt.id::text)::uuid,
    f.claim_id,
    gt.fall_id,
    COALESCE(gt.durchgefuehrt_am, gt.created_at),
    CASE
      WHEN gt.durchgefuehrt_am IS NOT NULL THEN 'termin.durchgefuehrt'
      ELSE 'termin.gebucht'
    END,
    'gutachten',
    NULL::uuid,
    'sv',
    jsonb_build_object('termin_id', gt.id, 'typ', gt.typ, 'status', gt.status),
    TRUE, TRUE, NULL
  FROM public.gutachter_termine gt
  JOIN public.faelle f ON f.id = gt.fall_id
  WHERE f.claim_id IS NOT NULL

  UNION ALL

  -- ─── 10) Airdrop-Invitations ────────────────────────────────────────────
  SELECT
    md5('airdrop-versendet-' || ai.id::text)::uuid,
    ai.claim_id,
    (SELECT id FROM public.faelle f WHERE f.claim_id = ai.claim_id LIMIT 1),
    ai.created_at,
    'airdrop.versendet',
    'kommunikation',
    NULL::uuid,
    'kb',
    jsonb_build_object('invitation_id', ai.id, 'status', ai.status),
    TRUE, FALSE, NULL
  FROM public.airdrop_invitations ai
  WHERE ai.claim_id IS NOT NULL

  UNION ALL

  -- ─── 11) Manuelle Notizen aus timeline-Tabelle (intern via metadata.intern) ─
  SELECT
    md5('manuell-' || tl.id::text)::uuid,
    f.claim_id,
    tl.fall_id,
    tl.created_at,
    'manuell.notiz',
    'manuell',
    tl.erstellt_von,
    'kb',
    jsonb_build_object('titel', tl.titel, 'beschreibung', tl.beschreibung, 'typ', tl.typ),
    -- intern-Flag aus metadata.intern (default: nicht intern → kunde sieht's)
    COALESCE((tl.metadata->>'intern')::boolean, FALSE) = FALSE,
    FALSE,
    NULL
  FROM public.timeline tl
  JOIN public.faelle f ON f.id = tl.fall_id
  WHERE f.claim_id IS NOT NULL

) sub;

COMMENT ON VIEW public.v_claim_timeline IS
  'AAR-843: Aggregierte Verlaufs-Sicht über 11 Quellen (leads, phase_transitions, '
  'claims-Endzustand, gutachten, repairs, vs_korrespondenz, claim_payments, '
  'claim_mietwagen, gutachter_termine, airdrop_invitations, timeline). '
  'Anti-Pattern 14.9: KEINE eigene Tabelle — Single Source bleibt pro Underlying-Tabelle.';

-- security_invoker = ON: View nutzt RLS der Underlying-Tabellen.
-- Heißt: Geschädigter sieht nur eigene Claims (claims-RLS), KB nur eigene
-- (claims_kb_select), etc. Plus zusätzliche Sichtbarkeits-Filter durch
-- sichtbar_fuer_kunde/sichtbar_fuer_sv im Application-Code (timeline-queries.ts).
ALTER VIEW public.v_claim_timeline SET (security_invoker = on);

-- ─── claim_payments-Comment Update (Pre-Flight-Befund: alter AAR-823-Text) ──
COMMENT ON TABLE public.claim_payments IS
  'AAR-823 + AAR-839: Zahlungseingänge vom Versicherer — KEIN Phase-Trigger mehr '
  '(Phase 7+8 entfallen mit AAR-839, claim_payments ist reine Buchhaltung). '
  'KB entscheidet manuell via markClaimAsReguliert (AAR-840) wann ein Claim '
  'als reguliert gilt. status=ausstehend/teilweise/erhalten/final/abgelehnt. '
  'differenz_betrag GENERATED ALWAYS (Forderung minus Erhalten).';
