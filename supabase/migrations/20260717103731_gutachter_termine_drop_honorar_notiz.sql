-- gutachter_termine Spalten-Auslagerung Schritt 3b: honorar_betrag + notiz_intern DROPpen.
-- Voraussetzung erfuellt: alle App-Reader/Writer (Schritt 2 #4474 R58 + Schritt 3a #4492 R60) sind
-- auf prod deployed und lesen/schreiben ausschliesslich gutachter_termine_intern. Datensicherheit
-- vor-verifiziert: 0 gt-Rows mit non-null honorar/notiz (dormant), intern-Backfill deckungsgleich.
-- pg_depend: nur die 2 Sync-Trigger haengen an den Spalten -> zuerst Trigger, dann Spalten.
-- Realtime: gutachter_termine ist table-level in supabase_realtime -> Column-Drop publikations-neutral.
-- lock_timeout niedrig: die Tabelle ist heiss (Realtime + Prod-Traffic) -> nie blockieren, lieber 55P03
-- und Retry. Fail-closed Verify laeuft separat als READ direkt nach diesem Apply (DROP ist atomar).

set local lock_timeout = '5s';
set local statement_timeout = '40s';

drop trigger if exists trg_sync_gt_intern_ins on public.gutachter_termine;
drop trigger if exists trg_sync_gt_intern_upd on public.gutachter_termine;
drop function if exists public.sync_gutachter_termin_intern();

alter table public.gutachter_termine drop column if exists honorar_betrag;
alter table public.gutachter_termine drop column if exists notiz_intern;
