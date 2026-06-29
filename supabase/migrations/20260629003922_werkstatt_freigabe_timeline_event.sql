-- Additiver Timeline-Zweig 'reparatur.freigegeben' (abgeleitet aus claims.reparatur_freigegeben_am/_von).
-- Die uebrigen 14 Branches sind VERBATIM aus der Live-Def reproduziert (CREATE OR REPLACE braucht die
-- vollstaendige Def). security_invoker=false EXPLIZIT erhalten (unveraenderte Definer-Semantik).
-- Event ist intern (sichtbar_fuer_kunde=false, sichtbar_fuer_sv=false) -> nur Admin/KB-Historie.
CREATE OR REPLACE VIEW public.v_claim_timeline
WITH (security_invoker=false) AS
 SELECT event_id, claim_id, fall_id, event_at, event_typ, event_kategorie,
        actor_user_id, actor_rolle, payload_jsonb, sichtbar_fuer_kunde, sichtbar_fuer_sv, detail_url_path
 FROM (
   SELECT md5('lead-aufgenommen-'::text || l.id)::uuid AS event_id,
          l.konvertiert_zu_claim_id AS claim_id,
          NULL::uuid AS fall_id,
          l.created_at AS event_at,
          'lead.aufgenommen'::text AS event_typ,
          'phase'::text AS event_kategorie,
          NULL::uuid AS actor_user_id,
          'system'::text AS actor_rolle,
          jsonb_build_object('lead_id', l.id, 'quelle', l.source_channel) AS payload_jsonb,
          true AS sichtbar_fuer_kunde,
          false AS sichtbar_fuer_sv,
          NULL::text AS detail_url_path
     FROM leads l WHERE l.konvertiert_zu_claim_id IS NOT NULL
   UNION ALL
   SELECT md5('lead-konvertiert-'::text || l.id)::uuid, l.konvertiert_zu_claim_id, NULL::uuid, l.konvertiert_am,
          'lead.konvertiert'::text, 'phase'::text, l.konvertiert_durch_user_id, 'dispatcher'::text,
          jsonb_build_object('lead_id', l.id), true, false, NULL::text
     FROM leads l WHERE l.konvertiert_zu_claim_id IS NOT NULL AND l.konvertiert_am IS NOT NULL
   UNION ALL
   SELECT md5('phase-'::text || pt.id::text)::uuid, pt.claim_id, pt.fall_id, pt.transition_at,
          'phase.geaendert'::text, 'phase'::text, pt.transitioned_by, COALESCE(pt.actor_rolle, 'system'::text),
          jsonb_build_object('from_phase', pt.from_phase, 'to_phase', pt.to_phase, 'trigger_type', pt.trigger_type, 'grund', pt.grund),
          true, true, NULL::text
     FROM phase_transitions pt WHERE pt.claim_id IS NOT NULL
   UNION ALL
   SELECT md5(('endzustand-'::text || c.id::text) || '-'::text || c.status)::uuid, c.id, NULL::uuid, c.endzustand_gesetzt_am,
          'claim.'::text || c.status, 'phase'::text, c.endzustand_gesetzt_durch_user_id, 'kb'::text,
          jsonb_build_object('status', c.status, 'regulierungs_betrag', c.regulierungs_betrag, 'vs_ablehnungs_grund', c.vs_ablehnungs_grund, 'endzustand_grund', c.endzustand_grund),
          true, false, NULL::text
     FROM claims c WHERE c.endzustand_gesetzt_am IS NOT NULL AND c.status = ANY (ARRAY['in_kommunikation_vs'::text,'reguliert'::text,'abgelehnt'::text,'an_externe_kanzlei_uebergeben'::text,'storniert'::text])
   UNION ALL
   SELECT md5('gutachten-beauftragt-'::text || g.id::text)::uuid, g.claim_id, NULL::uuid, g.created_at,
          'gutachten.beauftragt'::text, 'gutachten'::text, NULL::uuid, 'kb'::text,
          jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id), true, true, NULL::text
     FROM gutachten g WHERE g.claim_id IS NOT NULL
   UNION ALL
   SELECT md5('gutachten-final-'::text || g.id::text)::uuid, g.claim_id, NULL::uuid, g.updated_at,
          'gutachten.fertig'::text, 'gutachten'::text, NULL::uuid, 'sv'::text,
          jsonb_build_object('gutachten_id', g.id, 'sv_id', g.sv_id), true, true, NULL::text
     FROM gutachten g WHERE g.claim_id IS NOT NULL AND g.status = 'final'::text
   UNION ALL
   SELECT md5(('repair-'::text || r.id::text) || '-'::text || r.status)::uuid, r.claim_id, NULL::uuid, r.updated_at,
          'repair.'::text || r.status, 'reparatur'::text, NULL::uuid, 'system'::text,
          jsonb_build_object('repair_id', r.id, 'werkstatt_id', r.werkstatt_id, 'status', r.status), true, false, NULL::text
     FROM repairs r WHERE r.claim_id IS NOT NULL AND r.status = ANY (ARRAY['geplant'::text,'in_arbeit'::text,'abgeschlossen'::text])
   UNION ALL
   SELECT md5('vsk-'::text || vk.id::text)::uuid, vk.claim_id, NULL::uuid, vk.datum,
          'vs.brief_versendet'::text, 'vs'::text, vk.created_by_user_id, 'kb'::text,
          jsonb_build_object('typ', vk.typ, 'kanal', vk.kanal, 'richtung', vk.richtung, 'versicherung', vk.versicherung, 'aktenzeichen', vk.aktenzeichen),
          true, false, NULL::text
     FROM vs_korrespondenz vk WHERE vk.claim_id IS NOT NULL AND vk.status <> 'archiviert'::text
   UNION ALL
   SELECT md5(('payment-'::text || cp.id::text) || '-'::text || cp.status)::uuid, cp.claim_id, NULL::uuid, cp.updated_at,
          'payment.'::text || cp.status, 'zahlung'::text, NULL::uuid, 'kb'::text,
          jsonb_build_object('payment_id', cp.id, 'erhaltener_betrag', cp.erhaltener_betrag, 'forderungsbetrag', cp.forderungsbetrag, 'status', cp.status),
          true, false, NULL::text
     FROM claim_payments cp WHERE cp.claim_id IS NOT NULL AND cp.status = ANY (ARRAY['erhalten'::text,'teilweise'::text,'final'::text])
   UNION ALL
   SELECT md5('mietwagen-start-'::text || cm.id::text)::uuid, cm.claim_id, NULL::uuid, cm.beginn_datum::timestamptz,
          'mietwagen.gestartet'::text, 'reparatur'::text, NULL::uuid, 'system'::text,
          jsonb_build_object('mietwagen_id', cm.id, 'anbieter', cm.anbieter, 'fahrzeugklasse', cm.fahrzeugklasse), true, false, NULL::text
     FROM claim_mietwagen cm WHERE cm.claim_id IS NOT NULL AND cm.beginn_datum IS NOT NULL AND cm.status = ANY (ARRAY['aktiv'::text,'beendet'::text])
   UNION ALL
   SELECT md5('mietwagen-ende-'::text || cm.id::text)::uuid, cm.claim_id, NULL::uuid, cm.tatsaechliches_ende::timestamptz,
          'mietwagen.beendet'::text, 'reparatur'::text, NULL::uuid, 'system'::text,
          jsonb_build_object('mietwagen_id', cm.id, 'tage_gesamt', cm.tage_gesamt, 'gesamtkosten_netto', cm.gesamtkosten_netto), true, false, NULL::text
     FROM claim_mietwagen cm WHERE cm.claim_id IS NOT NULL AND cm.tatsaechliches_ende IS NOT NULL
   UNION ALL
   SELECT md5('termin-'::text || gt.id::text)::uuid, gt.claim_id, gt.fall_id, COALESCE(gt.durchgefuehrt_am, gt.created_at),
          CASE WHEN gt.durchgefuehrt_am IS NOT NULL THEN 'termin.durchgefuehrt'::text ELSE 'termin.gebucht'::text END,
          'gutachten'::text, NULL::uuid, 'sv'::text,
          jsonb_build_object('termin_id', gt.id, 'typ', gt.typ, 'status', gt.status), true, true, NULL::text
     FROM gutachter_termine gt WHERE gt.claim_id IS NOT NULL
   UNION ALL
   SELECT md5('airdrop-versendet-'::text || ai.id::text)::uuid, ai.claim_id, NULL::uuid, ai.created_at,
          'airdrop.versendet'::text, 'kommunikation'::text, NULL::uuid, 'kb'::text,
          jsonb_build_object('invitation_id', ai.id, 'status', ai.status), true, false, NULL::text
     FROM airdrop_invitations ai WHERE ai.claim_id IS NOT NULL
   UNION ALL
   SELECT md5('manuell-'::text || tl.id::text)::uuid, tl.claim_id, tl.fall_id, tl.created_at,
          'manuell.notiz'::text, 'manuell'::text, tl.erstellt_von, 'kb'::text,
          jsonb_build_object('titel', tl.titel, 'beschreibung', tl.beschreibung, 'typ', tl.typ),
          COALESCE((tl.metadata ->> 'intern'::text)::boolean, false) = false, false, NULL::text
     FROM timeline tl WHERE tl.claim_id IS NOT NULL
   UNION ALL
   -- NEU: Reparaturfreigabe (intern, Admin/KB-Historie)
   SELECT md5('reparatur-freigegeben-'::text || c.id::text)::uuid, c.id, NULL::uuid, c.reparatur_freigegeben_am,
          'reparatur.freigegeben'::text, 'reparatur'::text, c.reparatur_freigegeben_von, 'kb'::text,
          jsonb_build_object('werkstatt_id', c.werkstatt_id), false, false, NULL::text
     FROM claims c WHERE c.reparatur_freigegeben_am IS NOT NULL
 ) sub;
