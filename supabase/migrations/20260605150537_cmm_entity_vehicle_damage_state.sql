-- Schaden/Vorschaden = fahrzeug-gebundene Damage-Entitaet (Spec §4).
-- claim_id = welcher Claim diesen Schaden begutachtet hat (NULL = importierte Historie /
-- Cardentity). state = aktueller Schaden im offenen Claim ('aktuell') vs eingefrorene
-- Fahrzeug-Historie ('vorschaden'). Bestand (CMM-64 Cardentity-Import) = vorschaden (Default).
alter table public.vehicle_vorschaeden
  add column if not exists claim_id uuid references public.claims(id) on delete set null;
alter table public.vehicle_vorschaeden
  add column if not exists state text not null default 'vorschaden'
  check (state in ('aktuell','vorschaden'));
create index if not exists idx_vehicle_vorschaeden_vehicle_state
  on public.vehicle_vorschaeden(vehicle_id, state);
create index if not exists idx_vehicle_vorschaeden_claim_id
  on public.vehicle_vorschaeden(claim_id);
