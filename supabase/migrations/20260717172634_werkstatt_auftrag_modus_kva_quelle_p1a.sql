-- Spec E Phase 1a (#4497): Werkstatt-Auftrags-Steuerung — Modus + KVA-Quelle + Ablehnung.
-- Additiv, metadata-only: konstanter Default → kein Table-Rewrite (PG11+). claims ist hot
-- (Realtime) → lock_timeout niedrig; die Column-Adds sind instant, CHECK validiert 10 Rows trivial.
set local lock_timeout = '5s';

alter table public.claims
  add column if not exists reparatur_auftrag_modus text not null default 'kva_erst',
  add column if not exists reparatur_auftrag_modus_gesetzt_von uuid,
  add column if not exists reparatur_auftrag_modus_gesetzt_am timestamptz,
  add column if not exists kva_quelle text,
  add column if not exists kva_abgelehnt_am timestamptz,
  add column if not exists kva_abgelehnt_grund text;

-- CHECK-Constraints guarded (idempotent, benannt für den flag-drift-Ratchet-Snapshot).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'claims_reparatur_auftrag_modus_check') then
    alter table public.claims add constraint claims_reparatur_auftrag_modus_check
      check (reparatur_auftrag_modus in ('kva_erst','direkt'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'claims_kva_quelle_check') then
    alter table public.claims add constraint claims_kva_quelle_check
      check (kva_quelle is null or kva_quelle in ('kunde','werkstatt','zubringer'));
  end if;
end $$;

-- Backfill (Q4, Aaron): bereits bestätigte/erledigte Reparatur-Aufträge NICHT gaten → 'direkt';
-- vorhandene KVA-Werte → kva_quelle='zubringer'. Aktuell 0 Rows — für Reproduzierbarkeit/Zukunft.
update public.claims c set reparatur_auftrag_modus = 'direkt'
  where c.reparatur_auftrag_modus = 'kva_erst'
    and exists (select 1 from public.reparatur_termine rt
                where rt.claim_id = c.id and rt.status in ('bestaetigt','erledigt'));

update public.claims set kva_quelle = 'zubringer'
  where kva_quelle is null and kostenvoranschlag_brutto is not null;

comment on column public.claims.reparatur_auftrag_modus is 'Spec E: kva_erst (Default, Kostenschutz — Terminfindung erst nach KVA+Freigabe) | direkt (sofort terminieren). gesetzt_von/_am = Beleg bei Kunde-gewaehltem direkt.';
comment on column public.claims.kva_quelle is 'Spec E: kunde (Upload, Weg A) | werkstatt (Gegen-KVA, Weg C) | zubringer (gfa/Lead-Funnel). Steuert das Termin-Gate (kunde/zubringer=offen, werkstatt=zu bis Freigabe).';
