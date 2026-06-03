-- Identitaets-Engine Login-Tor Slice B (Self-Confirm Relink): Provenance-Schema.
-- Beschluss Aaron 2026-06-03 "Kompromiss": beim Confirm werden die claim_parties der
-- Orphan-Person auf die Account-Person RE-GEPOINTET (Reads bleiben unveraendert), und
-- die Orphan-Person bekommt einen Tombstone-Pointer + jede umgehaengte Partei haelt
-- ihre vorherige person_id fuer einen spaeteren sauberen Split.

alter table public.personen
  add column canonical_person_id uuid null references public.personen(id) on delete set null;

comment on column public.personen.canonical_person_id is
  'Identitaets-Aufloesung (Login-Tor Slice B): zeigt auf die Account-Person, die diese '
  '(Orphan-)Person abgeloest hat = "superseded by X". NOT NULL => Tombstone: diese Person '
  'ist KEIN Match-Kandidat mehr (match_person_candidates filtert sie) und wird nicht neu '
  'referenziert. In Slice B werden die claim_parties beim Confirm re-gepointet, daher muessen '
  'Reads diesem Pointer NICHT folgen. Die §8-Variante "Reads folgen Canonical" (Soft-Link '
  'OHNE Re-Point) wird hier bewusst NICHT genutzt — nicht verwechseln.';

-- Reverse-Lookup "welche Orphans wurden von X abgeloest" (klein/partial; IS NULL ist der Normalfall).
create index personen_canonical_person_id_idx
  on public.personen (canonical_person_id)
  where canonical_person_id is not null;

alter table public.claim_parties
  add column previous_person_id uuid null references public.personen(id) on delete set null;

comment on column public.claim_parties.previous_person_id is
  'Identitaets-Aufloesung (Login-Tor Slice B): die person_id, die diese Partei VOR einem '
  'Self-Confirm-Relink trug (= die abgeloeste Orphan-Person). Per-Partei-Provenance fuer einen '
  'spaeteren sauberen Split / Hard-Merge-Trennung (§12-6). Normalbetrieb: null.';
