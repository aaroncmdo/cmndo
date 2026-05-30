-- CMM-44 Phase 4.1: Light-Views Re-Base
-- v_claim_timeline -> faelle-frei (claim_id-Foundation auf phase_transitions + timeline,
-- Backfill, transitionaler BEFORE-INSERT-Trigger, View-Rewrite mit nativem claim_id;
-- fall_id-Subqueries + detail_url_path -> NULL). v_claim_listing -> cosmetic f.sv_id -> c.sv_id
-- (fall_id + LEFT JOIN faelle BLEIBEN, load-bearing fuer admin/faelle hub, Phase 4.3).
-- Spec:  docs/superpowers/specs/2026-05-30-cmm44-phase-41-light-views.md
-- Plan:  docs/superpowers/plans/2026-05-30-cmm44-phase-41.md
-- Recorded version (apply_migration): 20260530133959 (File-Name == version, kein Twin-Drift).
-- Pre/Post-Parity verifiziert: v_claim_timeline 234 Zeilen / event_typ identisch; sv_mismatch 0.

-- (A) Foundation: claim_id auf phase_transitions + timeline
ALTER TABLE public.phase_transitions ADD COLUMN IF NOT EXISTS claim_id uuid;
ALTER TABLE public.timeline           ADD COLUMN IF NOT EXISTS claim_id uuid;

-- (B) Backfill aus faelle.claim_id (solange faelle existiert)
UPDATE public.phase_transitions pt SET claim_id = f.claim_id
  FROM public.faelle f WHERE f.id = pt.fall_id AND pt.claim_id IS NULL;
UPDATE public.timeline tl SET claim_id = f.claim_id
  FROM public.faelle f WHERE f.id = tl.fall_id AND tl.claim_id IS NULL;

-- (C) FK (ON DELETE CASCADE wie fall_id-FK) + Index
ALTER TABLE public.phase_transitions
  ADD CONSTRAINT phase_transitions_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;
ALTER TABLE public.timeline
  ADD CONSTRAINT timeline_claim_id_fkey
  FOREIGN KEY (claim_id) REFERENCES public.claims(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_phase_transitions_claim_id ON public.phase_transitions(claim_id);
CREATE INDEX IF NOT EXISTS idx_timeline_claim_id          ON public.timeline(claim_id);

-- (D) Transitionaler BEFORE-INSERT-Trigger: claim_id aus faelle.claim_id wenn NULL.
--     CMM-44 Phase 5: App-Writer setzen claim_id direkt. Phase 6: Trigger + faelle-Read DROP.
CREATE OR REPLACE FUNCTION public.trg_fn_fill_claim_id_from_fall()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.claim_id IS NULL AND NEW.fall_id IS NOT NULL THEN
    SELECT f.claim_id INTO NEW.claim_id FROM public.faelle f WHERE f.id = NEW.fall_id;
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS trg_phase_transitions_fill_claim_id ON public.phase_transitions;
CREATE TRIGGER trg_phase_transitions_fill_claim_id
  BEFORE INSERT ON public.phase_transitions
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_fill_claim_id_from_fall();
DROP TRIGGER IF EXISTS trg_timeline_fill_claim_id ON public.timeline;
CREATE TRIGGER trg_timeline_fill_claim_id
  BEFORE INSERT ON public.timeline
  FOR EACH ROW EXECUTE FUNCTION public.trg_fn_fill_claim_id_from_fall();

-- (E) v_claim_timeline — faelle-frei. Shape 12 Spalten unveraendert. SECURITY DEFINER explizit.
CREATE OR REPLACE VIEW public.v_claim_timeline WITH (security_invoker = false) AS
 SELECT event_id, claim_id, fall_id, event_at, event_typ, event_kategorie,
    actor_user_id, actor_rolle, payload_jsonb, sichtbar_fuer_kunde, sichtbar_fuer_sv, detail_url_path
   FROM (
     SELECT md5('lead-aufgenommen-'::text || l.id)::uuid AS event_id,
        l.konvertiert_zu_claim_id AS claim_id, NULL::uuid AS fall_id, l.created_at AS event_at,
        'lead.aufgenommen'::text AS event_typ, 'phase'::text AS event_kategorie,
        NULL::uuid AS actor_user_id, 'system'::text AS actor_rolle,
        jsonb_build_object('lead_id', l.id, 'quelle', l.source_channel) AS payload_jsonb,
        true AS sichtbar_fuer_kunde, false AS sichtbar_fuer_sv, NULL::text AS detail_url_path
       FROM leads l WHERE l.konvertiert_zu_claim_id IS NOT NULL
    UNION ALL
     SELECT md5('lead-konvertiert-'::text || l.id)::uuid, l.konvertiert_zu_claim_id, NULL::uuid,
        l.konvertiert_am, 'lead.konvertiert'::text, 'phase'::text, l.konvertiert_durch_user_id,
        'dispatcher'::text, jsonb_build_object('lead_id', l.id), true, false, NULL::text
       FROM leads l WHERE l.konvertiert_zu_claim_id IS NOT NULL AND l.konvertiert_am IS NOT NULL
    UNION ALL
     SELECT md5('phase-'::text || pt.id::text)::uuid, pt.claim_id, pt.fall_id, pt.transition_at,
        'phase.geaendert'::text, 'phase'::text, pt.transitioned_by, COALESCE(pt.actor_rolle, 'system'::text),
        jsonb_build_object('from_phase', pt.from_phase, 'to_phase', pt.to_phase, 'trigger_type', pt.trigger_type, 'grund', pt.grund),
        true, true, NULL::text
       FROM phase_transitions pt WHERE pt.claim_id IS NOT NULL
    UNION ALL
     SELECT md5((('endzustand-'::text || c.id::text) || '-'::text) || c.status)::uuid, c.id, NULL::uuid,
        c.endzustand_gesetzt_am, 'claim.'::text || c.status, 'phase'::text, c.endzustand_gesetzt_durch_user_id,
        'kb'::text, jsonb_build_object('status', c.status, 'regulierungs_betrag', c.regulierungs_betrag, 'vs_ablehnungs_grund', c.vs_ablehnungs_grund, 'endzustand_grund', c.endzustand_grund),
        true, false, NULL::text
       FROM claims c WHERE c.endzustand_gesetzt_am IS NOT NULL AND (c.status = ANY (ARRAY['in_kommunikation_vs'::text, 'reguliert'::text, 'abgelehnt'::text, 'an_externe_kanzlei_uebergeben'::text, 'storniert'::text]))
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
     SELECT md5((('repair-'::text || r.id::text) || '-'::text) || r.status)::uuid, r.claim_id, NULL::uuid,
        r.updated_at, 'repair.'::text || r.status, 'reparatur'::text, NULL::uuid, 'system'::text,
        jsonb_build_object('repair_id', r.id, 'werkstatt_id', r.werkstatt_id, 'status', r.status), true, false, NULL::text
       FROM repairs r WHERE r.claim_id IS NOT NULL AND (r.status = ANY (ARRAY['geplant'::text, 'in_arbeit'::text, 'abgeschlossen'::text]))
    UNION ALL
     SELECT md5('vsk-'::text || vk.id::text)::uuid, vk.claim_id, NULL::uuid, vk.datum,
        'vs.brief_versendet'::text, 'vs'::text, vk.created_by_user_id, 'kb'::text,
        jsonb_build_object('typ', vk.typ, 'kanal', vk.kanal, 'richtung', vk.richtung, 'versicherung', vk.versicherung, 'aktenzeichen', vk.aktenzeichen),
        true, false, NULL::text
       FROM vs_korrespondenz vk WHERE vk.claim_id IS NOT NULL AND vk.status <> 'archiviert'::text
    UNION ALL
     SELECT md5((('payment-'::text || cp.id::text) || '-'::text) || cp.status)::uuid, cp.claim_id, NULL::uuid,
        cp.updated_at, 'payment.'::text || cp.status, 'zahlung'::text, NULL::uuid, 'kb'::text,
        jsonb_build_object('payment_id', cp.id, 'erhaltener_betrag', cp.erhaltener_betrag, 'forderungsbetrag', cp.forderungsbetrag, 'status', cp.status),
        true, false, NULL::text
       FROM claim_payments cp WHERE cp.claim_id IS NOT NULL AND (cp.status = ANY (ARRAY['erhalten'::text, 'teilweise'::text, 'final'::text]))
    UNION ALL
     SELECT md5('mietwagen-start-'::text || cm.id::text)::uuid, cm.claim_id, NULL::uuid,
        cm.beginn_datum::timestamp with time zone, 'mietwagen.gestartet'::text, 'reparatur'::text, NULL::uuid, 'system'::text,
        jsonb_build_object('mietwagen_id', cm.id, 'anbieter', cm.anbieter, 'fahrzeugklasse', cm.fahrzeugklasse), true, false, NULL::text
       FROM claim_mietwagen cm WHERE cm.claim_id IS NOT NULL AND cm.beginn_datum IS NOT NULL AND (cm.status = ANY (ARRAY['aktiv'::text, 'beendet'::text]))
    UNION ALL
     SELECT md5('mietwagen-ende-'::text || cm.id::text)::uuid, cm.claim_id, NULL::uuid,
        cm.tatsaechliches_ende::timestamp with time zone, 'mietwagen.beendet'::text, 'reparatur'::text, NULL::uuid, 'system'::text,
        jsonb_build_object('mietwagen_id', cm.id, 'tage_gesamt', cm.tage_gesamt, 'gesamtkosten_netto', cm.gesamtkosten_netto), true, false, NULL::text
       FROM claim_mietwagen cm WHERE cm.claim_id IS NOT NULL AND cm.tatsaechliches_ende IS NOT NULL
    UNION ALL
     SELECT md5('termin-'::text || gt.id::text)::uuid, gt.claim_id, gt.fall_id,
        COALESCE(gt.durchgefuehrt_am, gt.created_at),
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
   ) sub;
GRANT ALL ON public.v_claim_timeline TO anon, authenticated, service_role;

-- (F) v_claim_listing — cosmetic: f.sv_id -> c.sv_id. fall_id (f.id) + LEFT JOIN faelle BLEIBEN (Phase 4.3).
CREATE OR REPLACE VIEW public.v_claim_listing WITH (security_invoker = false) AS
 SELECT c.id AS claim_id, c.claim_nummer, c.status, c.schadentag, c.kunden_konstellation,
    c.created_at, c.updated_at,
    f.id AS fall_id,
    c.sv_id,
    c.kundenbetreuer_id AS faelle_kundenbetreuer_id, c.kundenbetreuer_id AS claim_kundenbetreuer_id,
    c.service_typ, p.anzeigename AS kunde_anzeigename, p.vorname AS kunde_vorname, p.nachname AS kunde_nachname,
    v.kennzeichen_aktuell AS kennzeichen, vcp.main_phase, vcp.sub_phase
   FROM claims c
     LEFT JOIN faelle f ON f.claim_id = c.id
     LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
GRANT ALL ON public.v_claim_listing TO anon, authenticated, service_role;
