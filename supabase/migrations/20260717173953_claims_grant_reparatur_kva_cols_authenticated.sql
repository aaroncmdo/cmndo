-- Fleet-Unblock: 6 neue claims-Spalten (reparatur/kva-Lane) hatten keinen authenticated-SELECT-Grant
-- -> check:claims-column-grants rot fuer JEDEN PR (der Check liest prod) + die Spalten waren fuer
-- User-Clients unsichtbar (stiller PostgREST-Fehler im Reparatur/KVA-Flow). Aaron-Entscheid: granten
-- (operative Reparatur/KVA-Status-Spalten, customer-/staff-facing; RLS gatet Zeilen weiter).
-- claims ist column-capped (Mig 20260714220455) -> column-level grant noetig, nicht table-level.
-- lock_timeout: claims ist heiss.
--
-- ⚠ AN DIE REPARATUR/KVA-LANE (broadcast): falls eine der 6 doch INTERN sein soll (v.a.
-- kva_abgelehnt_grund = Ablehnungs-Notiz), spaeter cappen (revoke + audit_claims_column_grants()
-- deklarieren). Default hier = sichtbar (der Check-empfohlene Fix fuer operative Spalten).

set local lock_timeout = '5s';
set local statement_timeout = '30s';

grant select (
  reparatur_auftrag_modus, reparatur_auftrag_modus_gesetzt_von, reparatur_auftrag_modus_gesetzt_am,
  kva_quelle, kva_abgelehnt_am, kva_abgelehnt_grund
) on public.claims to authenticated;

do $$
begin
  if not has_column_privilege('authenticated','public.claims','reparatur_auftrag_modus','SELECT')
     or not has_column_privilege('authenticated','public.claims','reparatur_auftrag_modus_gesetzt_von','SELECT')
     or not has_column_privilege('authenticated','public.claims','reparatur_auftrag_modus_gesetzt_am','SELECT')
     or not has_column_privilege('authenticated','public.claims','kva_quelle','SELECT')
     or not has_column_privilege('authenticated','public.claims','kva_abgelehnt_am','SELECT')
     or not has_column_privilege('authenticated','public.claims','kva_abgelehnt_grund','SELECT') then
    raise exception 'FAIL: mind. eine der 6 Spalten hat keinen authenticated-SELECT-Grant';
  end if;
  raise notice 'OK: 6 reparatur/kva-Spalten authenticated-lesbar -> check:claims-column-grants gruen.';
end $$;
