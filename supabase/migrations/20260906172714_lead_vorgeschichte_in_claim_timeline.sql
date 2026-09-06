-- Lead-Vorgeschichte ueberlebt den Uebergang zum Fall.
--
-- WARUM: v_claim_timeline_ungated_internal zieht die timeline-Tabelle nur mit
-- `WHERE tl.claim_id IS NOT NULL` heran. Eine Zeile, die nur `lead_id` traegt,
-- erscheint deshalb nie in der Fallakte. Wird aus einem Lead ein Fall, beginnt
-- sein Verlauf dort aus dem Nichts. Gemessen 06.09.2026: 11 Zeilen auf 6
-- konvertierten Leads unsichtbar.
--
-- WARUM EIN VIEW-ZWEIG UND KEIN SCHREIBPFAD-FIX: zwoelf Schreiber setzen
-- `lead_id`, KEINER setzt `claim_id` mit. Ein Fix im Schreibpfad muesste in
-- allen zwoelf gepflegt werden und wuerde die 11 Bestandszeilen nicht heilen.
-- Der Zweig wirkt rueckwirkend und ohne Disziplin an zwoelf Stellen.
--
-- WARUM IN DER AEUSSEREN VIEW: die interne View ist 10.741 Zeichen mit 14
-- UNION-Zweigen; sie fuer eine additive Ergaenzung neu zu schreiben waere ein
-- reines Abschreibfehler-Risiko. `v_claim_timeline` ist ihre EINZIGE
-- Konsumentin (geprueft ueber pg_depend und Code-Grep), der Zweig ist hier
-- vollstaendig wirksam.
--
-- SICHERHEIT: die View traegt KEIN security_invoker (reloptions NULL) — RLS auf
-- `timeline` greift also nicht durch. Das Gate steht deshalb im Zweig selbst,
-- identisch zum bestehenden Pfad: claim_sichtbar_fuer_aktuellen_user(c.id).

CREATE OR REPLACE VIEW public.v_claim_timeline AS
 SELECT event_id,
    claim_id,
    fall_id,
    event_at,
    event_typ,
    event_kategorie,
    actor_user_id,
    actor_rolle,
    payload_jsonb,
    sichtbar_fuer_kunde,
    sichtbar_fuer_sv,
    detail_url_path
   FROM v_claim_timeline_ungated_internal
  WHERE claim_sichtbar_fuer_aktuellen_user(claim_id)

 UNION ALL

 -- Zeilen aus der Lead-Phase, die beim Uebergang zum Fall zurueckblieben.
 -- Die event_id bindet Zeile UND Claim ein: `claims.lead_id` traegt KEINEN
 -- Unique-Constraint (nur FK + Index). Heute ist die Beziehung 1:1, aber
 -- bekaeme ein Lead je zwei Faelle, erzeugte eine id nur aus tl.id zwei Zeilen
 -- mit identischem Schluessel — und damit kollidierende React-Keys.
 SELECT (md5('manuell-lead-'::text || tl.id::text || '-'::text || c.id::text))::uuid AS event_id,
    c.id AS claim_id,
    tl.fall_id,
    tl.created_at AS event_at,
    'manuell.notiz'::text AS event_typ,
    'manuell'::text AS event_kategorie,
    tl.erstellt_von AS actor_user_id,
    'kb'::text AS actor_rolle,
    jsonb_build_object(
      'titel', tl.titel,
      'beschreibung', tl.beschreibung,
      'typ', tl.typ,
      -- Marker fuer die Oberflaeche: additiv, bricht kein bestehendes Mapping.
      'aus_lead_phase', true
    ) AS payload_jsonb,
    (COALESCE((tl.metadata ->> 'intern'::text)::boolean, false) = false) AS sichtbar_fuer_kunde,
    -- Der SV sieht die Lead-Vorgeschichte nicht: sie traegt Dispatch-interne
    -- Notizen. Gleiche Entscheidung wie im bestehenden manuell-Zweig.
    false AS sichtbar_fuer_sv,
    NULL::text AS detail_url_path
   FROM timeline tl
   JOIN claims c ON c.lead_id = tl.lead_id
  WHERE tl.claim_id IS NULL          -- sonst Duplikat zum bestehenden Zweig
    AND tl.lead_id IS NOT NULL
    AND claim_sichtbar_fuer_aktuellen_user(c.id);

COMMENT ON VIEW public.v_claim_timeline IS
  'Fall-Timeline inkl. der Ereignisse aus der Lead-Phase (Zweig 2: timeline-Zeilen ohne claim_id, ueber claims.lead_id angebunden). Sichtbarkeit je Zweig ueber claim_sichtbar_fuer_aktuellen_user().';
