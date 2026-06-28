-- Reparatur-Werkstatt-Zuweisung: Dispatcher (spaeter Kunde/Embed) weist einem Lead/Claim
-- ohne Werkstatt eine Partner-Werkstatt fuer die Reparatur zu. Getrackt (quelle + timestamp)
-- als Monetarisierungs-Hook. Additiv; NICHT werkstatt_id (= vermittelnde Werkstatt) wiederverwenden.
-- Spec: docs/superpowers/specs/2026-06-28-werkstatt-finder-vermittlung-design.md

alter table public.leads
  add column reparatur_werkstatt_id uuid references public.werkstaetten(id),
  add column reparatur_werkstatt_zugewiesen_am timestamptz,
  add column reparatur_werkstatt_zugewiesen_von uuid,
  add column reparatur_werkstatt_quelle text
    check (reparatur_werkstatt_quelle in ('dispatcher','kunde','embed'));

alter table public.claims
  add column reparatur_werkstatt_id uuid references public.werkstaetten(id),
  add column reparatur_werkstatt_zugewiesen_am timestamptz,
  add column reparatur_werkstatt_zugewiesen_von uuid,
  add column reparatur_werkstatt_quelle text
    check (reparatur_werkstatt_quelle in ('dispatcher','kunde','embed'));
