-- CMM-44 MP-6c — System-A claims.phase drop (REVIEW DRAFT, apply via Supabase-Plugin).
--
-- Entfernt die tote 10-Code-Spalte claims.phase + ihr Trigger-/Funktions-Geflecht.
-- Alle Phasen-Reads kommen seit MP-3..6a aus v_claim_phase (main_phase + sub_phase).
--
-- Reihenfolge (eine Transaktion — Plugin-apply_migration wrappt; bei Flaky-DB-Fehler
-- atomarer Rollback -> einfach neu fahren):
--   1) 6 abhaengige Views droppen (pg_depend-Closure leer -> nichts haengt an ihnen)
--   2) Phase-Trigger-Geflecht droppen (3 Trigger + 6 Funktionen)
--   3) verwaisten Sync-Fn droppen (kein Trigger nutzt ihn; mappt phase->faelle.aktuelle_phase)
--   4) den EINEN aktiven Cron (taeglich 09:30) von claims.phase auf v_claim_phase umschreiben
--   5) ALTER TABLE claims DROP COLUMN phase
--   6) die 6 Views OHNE phase neu anlegen (+ GRANTs wiederherstellen)
--
-- Scope-Korrekturen ggü. Spec (docs/28.05.2026/cmm44-mp6-system-a-drop-plan.md §3),
-- gefunden im Live-Dependency-Sweep 2026-05-28:
--   + v_claim_sv      — Spec sagte "sauber"; selektiert roh claims.phase (0 Code-Consumer)
--   + trg_fn_sync_claims_to_faelle — verwaist (kein Trigger), referenziert phase + map-Fn -> droppen
--   + cron_kanzlei_paket_pending_check — LIVE (cron.schedule '30 9 * * *') -> Rewrite, sonst
--     bricht der Cron taeglich (faengt's per EXCEPTION ab -> Kanzlei-Paket-Nudges stoppen still)
--   CREATE OR REPLACE kann keine View-Spalte droppen -> DROP+CREATE (Aaron-Entscheidung 28.05.).
--
-- security_invoker: alle 6 Views laufen security_invoker=false (= Default; v_claim_sv hatte es
--   explizit gesetzt) -> wird bei plain CREATE VIEW reproduziert. NICHT auf true aendern (kein
--   RLS-Verhaltenswechsel im Drop). GRANTs aktuell uniform ALL fuer anon/authenticated/service_role.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Abhaengige Views droppen (Reihenfolge egal — keiner haengt an einem anderen der 6).
-- ─────────────────────────────────────────────────────────────────────────────
drop view if exists public.v_claim_listing;
drop view if exists public.v_claim_full;
drop view if exists public.v_faelle_mit_aktuellem_termin;
drop view if exists public.faelle_kunde_view;
drop view if exists public.faelle_sv_view;
drop view if exists public.v_claim_sv;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Phase-Trigger-Geflecht droppen.
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_claims_set_phase on public.claims;
drop trigger if exists trg_gutachten_refresh_phase on public.gutachten;
drop trigger if exists trg_repairs_refresh_phase on public.repairs;
drop function if exists public.trg_fn_set_claims_phase();
drop function if exists public.trg_fn_refresh_claim_phase_from_gutachten();
drop function if exists public.trg_fn_refresh_claim_phase_from_repairs();
drop function if exists public.trg_fn_refresh_claim_phase_from_payments();
drop function if exists public.map_claim_phase_to_faelle_phase();
drop function if exists public.calc_claims_phase(uuid, text, uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Verwaisten claims->faelle Sync-Fn droppen (kein Trigger nutzt ihn mehr).
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.trg_fn_sync_claims_to_faelle();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Live-Cron (taeglich 09:30) von claims.phase auf v_claim_phase.main_phase umschreiben.
--    Alt: c.phase IN ('4_gutachten_fertig','5_in_reparatur','6_kommunikation_versicherung')
--    Neu: vcp.main_phase = 'regulierung' (= das Post-Gutachten-Regulierungsfenster der alten 4-6).
--    Payload: phase(10-Code) -> main_phase + sub_phase.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.cron_kanzlei_paket_pending_check()
returns void language plpgsql
security definer set search_path = public
as $$
declare v_count int;
begin
  if to_regclass('public.notification_events') is null then
    perform public.log_cron_job_run('kanzlei_paket_pending_check', 'success', 0, null,
      jsonb_build_object('note', 'notification_events nicht gefunden'));
    return;
  end if;

  with pending_claims as (
    select
      c.id              as claim_id,
      c.kanzlei_wunsch,
      vcp.main_phase,
      vcp.sub_phase,
      f.id              as fall_id,
      c.kundenbetreuer_id
      from public.claims c
      join public.faelle f on f.claim_id = c.id
      left join public.v_claim_phase vcp on vcp.claim_id = c.id
     where c.kanzlei_wunsch in ('partnerkanzlei','eigene_kanzlei','nicht_gefragt')
       -- CMM-44 MP-6c: war c.phase IN ('4_gutachten_fertig','5_in_reparatur','6_kommunikation_versicherung')
       and vcp.main_phase = 'regulierung'
       and not exists (
         select 1 from public.kanzlei_pakete kp
          where kp.claim_id = c.id
            and kp.status in ('versendet','bestaetigt')
       )
       and coalesce(
             (select max(transition_at) from public.phase_transitions pt where pt.fall_id = f.id),
             c.created_at
           ) < now() - interval '12 hours'
       and not exists (
         select 1 from public.notification_events ne
          where ne.event_type = 'claim.kanzlei_paket_pending'
            and (ne.payload->>'claim_id')::uuid = c.id
            and ne.created_at > now() - interval '7 days'
       )
  )
  insert into public.notification_events (event_type, payload, fall_id, status)
  select
    'claim.kanzlei_paket_pending',
    jsonb_build_object(
      'claim_id',          pc.claim_id,
      'fall_id',           pc.fall_id,
      'kanzlei_wunsch',    pc.kanzlei_wunsch,
      'main_phase',        pc.main_phase,
      'sub_phase',         pc.sub_phase,
      'kundenbetreuer_id', pc.kundenbetreuer_id
    ),
    pc.fall_id,
    'pending'
  from pending_claims pc;

  get diagnostics v_count = row_count;
  perform public.log_cron_job_run('kanzlei_paket_pending_check', 'success', v_count);
exception when others then
  perform public.log_cron_job_run('kanzlei_paket_pending_check', 'error', null, sqlerrm);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Die Spalte droppen (irreversibel — aber tot: 0 Reader nach 6a, derived-only Wert).
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.claims drop column phase;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Die 6 Views OHNE phase neu anlegen (verbatim aus 6b minus phase-Zeile(n)) + GRANTs.
-- ─────────────────────────────────────────────────────────────────────────────

create view public.v_claim_listing as
 SELECT c.id AS claim_id,
    c.claim_nummer,
    c.status,
    c.schadentag,
    c.kunden_konstellation,
    c.created_at,
    c.updated_at,
    f.id AS fall_id,
    f.sv_id,
    c.kundenbetreuer_id AS faelle_kundenbetreuer_id,
    c.kundenbetreuer_id AS claim_kundenbetreuer_id,
    c.service_typ,
    p.anzeigename AS kunde_anzeigename,
    p.vorname AS kunde_vorname,
    p.nachname AS kunde_nachname,
    v.kennzeichen_aktuell AS kennzeichen,
    vcp.main_phase,
    vcp.sub_phase
   FROM claims c
     LEFT JOIN faelle f ON f.claim_id = c.id
     LEFT JOIN profiles p ON p.id = c.geschaedigter_user_id
     LEFT JOIN vehicles v ON v.id = c.vehicle_id
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
grant all on public.v_claim_listing to anon, authenticated, service_role;

create view public.v_claim_full as
 SELECT c.id,
    c.vehicle_id,
    c.schadentag,
    c.schadenzeit,
    c.entdeckt_am,
    c.schadenort_adresse,
    c.schadenort_plz,
    c.schadenort_ort,
    c.schadenort_land,
    c.schadenort_lat,
    c.schadenort_lng,
    c.schadenort_kategorie,
    c.hergang_kunde_text,
    c.hergang_sv_text,
    c.schadenart,
    c.fall_typ,
    c.unfall_konstellation,
    c.fahrerflucht,
    c.auslandskennzeichen,
    c.polizei_aktenzeichen,
    c.polizei_bericht_vorhanden,
    c.polizei_vor_ort,
    c.polizeibericht_status,
    c.geschaedigter_user_id,
    c.gegnerisches_vehicle_id,
    c.gegner_versicherung_id,
    c.gegner_versicherungsnummer,
    c.gegner_aktenzeichen,
    c.gegner_bekannt,
    c.anzahl_beteiligte_total,
    c.hat_personenschaden,
    c.hat_mietwagen,
    c.hat_nutzungsausfall,
    c.hat_sachschaden,
    c.hat_abschleppung,
    c.sachschaden_beschreibung,
    c.halter_ungleich_fahrer,
    c.kunden_konstellation,
    c.unfallskizze_url,
    c.unfallskizze_svg,
    c.unfallskizze_bestaetigt,
    c.unfallskizze_ablehnung_grund,
    c.unfallskizze_generiert_am,
    c.status,
    c.abgeschlossen_am,
    c.verjaehrt_am,
    c.created_at,
    c.updated_at,
    c.created_by_user_id,
    c.created_via,
    c.claim_nummer,
    c.lead_id,
    c.kundenbetreuer_id,
    c.vs_ablehnungs_grund,
    c.regulierungs_betrag,
    c.endzustand_gesetzt_durch_user_id,
    c.endzustand_gesetzt_am,
    c.endzustand_grund,
    c.kanzlei_wunsch,
    c.kanzlei_wunsch_gefragt_am,
    c.kanzlei_wunsch_gefragt_in_phase,
    f.id AS fall_id,
    f.sv_id,
    c.service_typ,
    f.status AS fall_status,
    f.created_at AS fall_created_at,
    COALESCE(( SELECT cr.last_activity_at
           FROM claim_recency cr
          WHERE cr.claim_id = c.id), c.created_at) AS fall_updated_at,
    c.kundenbetreuer_fallback_flag,
    c.szenario,
    c.dokumente_vollstaendig_fuer_phase,
    c.dokumente_reminder_whatsapp_letzte_sendung,
    spd_termin.no_show_gemeldet_am,
    spd_termin.re_termin_token,
    c.sa_unterschrieben_am,
    c.vollmacht_signiert_am,
    kf.mandatsnummer,
    spd_termin.re_termin_token_eingelaufen_am,
    spd_termin.re_termin_eskalation_an_kb_am,
    cur_auftrag.storniert_am,
    kf.anschlussschreiben_am,
    COALESCE(kf.vs_eskalationsstufe, 'vs-01'::text) AS vs_eskalationsstufe,
    f.kennzeichen,
    f.fahrzeug_hersteller,
    f.fahrzeug_modell,
    f.fahrzeug_typ,
    c.sa_unterschrieben,
    kf.regulierung_am,
    c.regulierungs_betrag AS regulierung_betrag,
    g.gesamt_schadensbetrag::numeric(10,2) AS gutachten_betrag,
    g.fertiggestellt_am AS gutachten_eingegangen_am,
    c.sv_zugewiesen_am,
    c.schadens_ursache,
    c.schadenort_plz::text AS schadens_plz,
    c.schadenort_ort AS schadens_ort,
    c.fall_typ AS schadens_fall_typ,
    f.gegner_anzahl_beteiligte,
    f.gegner_fahrzeugtyp,
    f.organisation_id,
    f.dispatch_id,
    f.kunde_id,
    c.ist_aktiv,
    c.deaktiviert_grund,
    f.hat_vorschaeden,
    f.vorschaden_anzahl,
    f.vorschaden_letzter_datum,
    f.vorschaden_typ_b_bericht,
    f.cardentity_abfrage_am,
    spd_termin.besichtigungsort_adresse,
    spd_termin.besichtigungsort_lat,
    spd_termin.besichtigungsort_lng,
    spd_termin.besichtigungsort_notiz,
    spd_termin.besichtigungsort_place_id,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp.*) ORDER BY cp.reihenfolge, cp.created_at) AS jsonb_agg
           FROM claim_parties cp
          WHERE cp.claim_id = c.id), '[]'::jsonb) AS parties,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cvi.*) ORDER BY cvi.reihenfolge, cvi.created_at) AS jsonb_agg
           FROM claim_vehicle_involvements cvi
          WHERE cvi.claim_id = c.id), '[]'::jsonb) AS vehicle_involvements,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cp2.*) ORDER BY cp2.created_at) AS jsonb_agg
           FROM claim_payments cp2
          WHERE cp2.claim_id = c.id), '[]'::jsonb) AS payments,
    COALESCE(( SELECT jsonb_agg(to_jsonb(cm.*) ORDER BY cm.created_at) AS jsonb_agg
           FROM claim_mietwagen cm
          WHERE cm.claim_id = c.id), '[]'::jsonb) AS mietwagen,
    COALESCE(( SELECT jsonb_agg(to_jsonb(vk.*) ORDER BY vk.datum) AS jsonb_agg
           FROM vs_korrespondenz vk
          WHERE vk.claim_id = c.id), '[]'::jsonb) AS vs_korrespondenz,
    COALESCE(( SELECT jsonb_agg(to_jsonb(r.*) ORDER BY r.created_at) AS jsonb_agg
           FROM repairs r
          WHERE r.claim_id = c.id), '[]'::jsonb) AS repairs,
    vcp.main_phase,
    vcp.sub_phase
   FROM claims c
     LEFT JOIN faelle f ON f.claim_id = c.id
     LEFT JOIN gutachten g ON g.claim_id = c.id
     LEFT JOIN kanzlei_faelle kf ON kf.claim_id = c.id
     LEFT JOIN LATERAL ( SELECT a.storniert_am
           FROM auftraege a
          WHERE a.claim_id = c.id
          ORDER BY a.reihenfolge DESC
         LIMIT 1) cur_auftrag ON true
     LEFT JOIN LATERAL ( SELECT gt.besichtigungsort_adresse,
            gt.besichtigungsort_lat,
            gt.besichtigungsort_lng,
            gt.besichtigungsort_notiz,
            gt.besichtigungsort_place_id,
            gt.no_show_gemeldet_am,
            gt.re_termin_token,
            gt.re_termin_token_eingelaufen_am,
            gt.re_termin_eskalation_an_kb_am
           FROM gutachter_termine gt
          WHERE gt.claim_id = c.id
          ORDER BY gt.start_zeit DESC NULLS LAST
         LIMIT 1) spd_termin ON true
     LEFT JOIN v_claim_phase vcp ON vcp.claim_id = c.id;
grant all on public.v_claim_full to anon, authenticated, service_role;

-- ── verbleibende 4 Views: exakte Ein-Zeilen-Deltas (volle CREATEs werden beim Apply
--    aus dem LIVE pg_get_viewdef minus dieser Zeile(n) regeneriert — keine Abschreib-
--    fehler bei den 200-Spalten-Views; Logik unten ist vollstaendig reviewt):
--
--  v_faelle_mit_aktuellem_termin  (FROM faelle f LEFT JOIN claims c …, ~200 Spalten + 3 LATERALs)
--     ENTFERNEN:  "    c.phase AS aktuelle_phase,"   (zw. f.organisation_id, und c.dokumente_vollstaendig_fuer_phase,)
--     BEHALTEN :  c.dokumente_vollstaendig_fuer_phase,  c.dokumente_vollstaendig_am_phase,  vcp.main_phase, vcp.sub_phase
--     GRANT    :  grant all on public.v_faelle_mit_aktuellem_termin to anon, authenticated, service_role;
--
--  faelle_kunde_view  (FROM faelle f LEFT JOIN claims c …)
--     ENTFERNEN:  "    c.phase AS aktuelle_phase,"   (zw. f.status, und c.hergang_kunde_text AS schadens_beschreibung,)
--     GRANT    :  grant all on public.faelle_kunde_view to anon, authenticated, service_role;
--
--  faelle_sv_view  (FROM faelle f LEFT JOIN claims c …)
--     ENTFERNEN:  "    c.phase AS aktuelle_phase,"   (zw. f.status, und c.hergang_kunde_text AS schadens_beschreibung,)
--     GRANT    :  grant all on public.faelle_sv_view to anon, authenticated, service_role;
--
--  v_claim_sv  (SELECT id, claim_nummer, status, phase, fall_typ, … FROM claims c WHERE is_sv_for_claim(id))
--     ENTFERNEN:  "    phase,"   (zw. claim_nummer/status und fall_typ)  — 0 Code-Consumer
--     CREATE   :  create view public.v_claim_sv WITH (security_invoker = false) as …   (matcht aktuelle reloption)
--     GRANT    :  grant all on public.v_claim_sv to anon, authenticated, service_role;
--
-- Hinweis: v_claim_sv hat KEINEN v_claim_phase-Join (6b liess es aus) und braucht keinen —
--   0 Consumer; phase wird ersatzlos entfernt (kein main/sub-Ersatz noetig).

commit;

-- ── APPLY (nach Aaron-Restart + durabler DB-Stabilitaet, Aaron-Freigabe) ─────────
-- 1. Live-Defs der 6 Views via pg_get_viewdef ziehen, je phase-Zeile(n) strippen, mit
--    obigen v_claim_listing/v_claim_full zu EINEM Migrations-SQL zusammenfuehren.
-- 2. Plugin: apply_migration('cmm44_mp6c_drop_claims_phase', <sql>) -> list_migrations
--    -> File supabase/migrations/<V>_cmm44_mp6c_drop_claims_phase.sql committen (Regel 2).
-- 3. Code: src/lib/faelle/claim-duplicate-columns.ts Zeile ~246 ('aktuelle_phase': 'phase') entfernen.
-- 4. generate_typescript_types -> src/lib/supabase/database.types.ts (claims ohne phase; Views ohne phase/aktuelle_phase).
-- 5. npm run build gruen + Post-Drop-Smoke ALLER Portale (Public+Admin+Kunde+SV+Makler+Kanzlei) mit Screenshots.
-- 6. PR --base staging.
