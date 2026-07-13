-- Task 2: v_claim_dokumente Entity + Forward-Fix von dokument_katalog_ctx.
-- Der Generic-Column-Dump aus Mig 20260713173343 wird durch die getreue
-- Replikation von buildDokumentKontext (src/lib/dokumente/build-kontext.ts)
-- ersetzt: curated 16-Key-Kontext, claim-wins-over-lead, technische_stellungnahme_status
-- + nachbesichtigung_status view-derived (auftraege/gutachter_termine, wie v_claim_base).
-- Status-SSoT = fall_dokumente (offen/hochgeladen/abgelehnt). 'geprueft' bewusst NICHT
-- abgeleitet: der Review-State-SSoT (_review-JSONB) ist unmerged (Branch
-- kitta/fix-beleg-review-ocr-status) und existiert nicht auf prod -> layert spaeter.

create or replace function public.dokument_katalog_ctx(p_claim_id uuid)
returns jsonb language sql stable as $func$
  select jsonb_build_object(
    'lead.id',                              to_jsonb(coalesce(l.id, c.lead_id)),
    'lead.zb1_status',                      to_jsonb(l.zb1_status),
    'lead.polizei_vor_ort',                 to_jsonb(coalesce(c.polizei_vor_ort, l.polizei_vor_ort)),
    'lead.fahrerflucht',                    to_jsonb(coalesce(c.fahrerflucht, l.fahrerflucht)),
    'lead.personenschaden_flag',            to_jsonb(coalesce(c.hat_personenschaden, l.personenschaden_flag)),
    'lead.sachschaden_flag',                to_jsonb(coalesce(c.hat_sachschaden, l.sachschaden_flag)),
    'lead.gewerbe_flag',                    to_jsonb(coalesce(c.gewerbe_flag, l.gewerbe_flag)),
    'lead.vorsteuerabzugsberechtigt',       to_jsonb(coalesce(c.vorsteuerabzugsberechtigt, l.vorsteuerabzugsberechtigt)),
    'lead.finanzierung_leasing',            to_jsonb(coalesce(c.finanzierung_leasing, l.finanzierung_leasing)),
    'lead.halter_ungleich_fahrer_flag',     to_jsonb(coalesce(c.halter_ungleich_fahrer, l.halter_ungleich_fahrer_flag)),
    'lead.zeugen_vorhanden',                to_jsonb(coalesce(c.zeugen_vorhanden, l.zeugen_vorhanden)),
    'lead.mietwagen_flag',                  to_jsonb(coalesce(c.hat_mietwagen, l.mietwagen_flag)),
    'lead.nutzungsausfall',                 to_jsonb(coalesce(c.hat_nutzungsausfall, l.nutzungsausfall)),
    'fall.zeugen_vorhanden',                to_jsonb(c.zeugen_vorhanden),
    'fall.vorschaden_erkannt',              to_jsonb(c.vorschaden_erkannt),
    'fall.technische_stellungnahme_status', to_jsonb(ts.technische_stellungnahme_status),
    'fall.nachbesichtigung_status',         to_jsonb(nb.nachbesichtigung_status)
  )
  from claims c
  left join leads l on l.id = c.lead_id
  left join lateral (
    select a.technische_stellungnahme_status
    from auftraege a where a.claim_id = c.id
    order by a.reihenfolge desc limit 1
  ) ts on true
  left join lateral (
    select gt.nachbesichtigung_status
    from gutachter_termine gt where gt.id = get_aktueller_gt_termin_id(c.id)
  ) nb on true
  where c.id = p_claim_id
$func$;

create or replace view public.v_claim_dokumente as
with slots as (
  select slot_id, label, kategorie::text as kategorie, beschreibung,
         freigeschaltet_wenn, pflicht_wenn, sichtbar_fuer, uploadbar_von, sort_order
  from dokument_katalog
  where aktiv = true and kategorie <> 'gutachter_verifizierung'
),
base as (
  select c.id as claim_id, s.slot_id, s.label, s.kategorie, s.beschreibung,
         s.freigeschaltet_wenn, s.pflicht_wenn, s.sichtbar_fuer, s.uploadbar_von, s.sort_order,
         cc.ctx
  from claims c
  cross join lateral (select public.dokument_katalog_ctx(c.id) as ctx) cc
  cross join slots s
)
select
  b.claim_id, b.slot_id, b.label, b.kategorie, b.beschreibung,
  public.dokument_regel_trifft(b.freigeschaltet_wenn, b.ctx) as freigeschaltet,
  (b.pflicht_wenn is not null and public.dokument_regel_trifft(b.pflicht_wenn, b.ctx)) as pflicht,
  case when lf.abgelehnt_am is not null then 'abgelehnt'
       when lf.storage_path is not null then 'hochgeladen'
       else 'offen' end as status,
  lf.storage_path, lf.original_filename, lf.dokument_id, lf.hochgeladen_am,
  b.sichtbar_fuer, b.uploadbar_von,
  ah.frist, ah.quelle, ah.angefordert_von_rolle, ah.pflicht_row_id,
  b.sort_order
from base b
left join lateral (
  select fd.id as dokument_id, fd.storage_path, fd.original_filename, fd.hochgeladen_am, fd.abgelehnt_am
  from fall_dokumente fd
  where fd.geloescht_am is null and fd.claim_id = b.claim_id and fd.dokument_typ = b.slot_id
  order by fd.hochgeladen_am desc nulls last
  limit 1
) lf on true
left join lateral (
  select pd.id as pflicht_row_id, pd.frist, pd.quelle, pd.angefordert_von_rolle
  from pflichtdokumente pd
  where pd.claim_id = b.claim_id and pd.dokument_typ = b.slot_id and pd.angefordert_von_rolle is not null
  order by pd.created_at desc nulls last
  limit 1
) ah on true
where public.dokument_regel_trifft(b.freigeschaltet_wenn, b.ctx) = true
  and claim_sichtbar_fuer_aktuellen_user(b.claim_id);

grant select on public.v_claim_dokumente to authenticated, service_role;
