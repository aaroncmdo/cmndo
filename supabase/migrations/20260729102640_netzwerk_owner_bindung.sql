-- P0 Task 3: Bindungs-Spalten. Additiv, KEINE RLS/Visibility-Aenderung.
-- claims.netzwerk_owner_id = per-Claim Attribution (P3-Seed); profiles.netzwerk_owner_id/_seit = Kunden-Default.
alter table public.claims
  add column netzwerk_owner_id uuid references public.profiles(id);
alter table public.profiles
  add column netzwerk_owner_id   uuid references public.profiles(id),
  add column netzwerk_owner_seit timestamptz;
comment on column public.claims.netzwerk_owner_id is
  'Per-Claim Netzwerk-Owner (Attribution fuer Finder-Boost); gesetzt bei Anlage aus Vermittler/SV-Origin. KEIN Visibility-Grant.';
