-- F6 (Convert-Mapping, Aaron-Entscheid 14.07. "strukturiert erfassen"): der Unfallort kam
-- nur als Freitext-Adresse; leads hatte KEINE strukturierten Komponenten -> convert setzte
-- schadenort_plz faelschlich aus fahrzeug_standort_plz + schadenort_ort=null hardcoded.
-- Neue strukturierte Unfallort-Felder auf leads (spiegeln besichtigungsort_* = text) +
-- claims.schadenort_place_id als Convert-Ziel. Form (GooglePlaceAutocomplete) + Convert-Wiring
-- folgen (Slice C, gated auf convert-Datei-Settle). Additiv, DB-ahead-of-code.
alter table public.leads
  add column if not exists unfallort_plz text,
  add column if not exists unfallort_ort text,
  add column if not exists unfallort_place_id text;
alter table public.claims add column if not exists schadenort_place_id text;
comment on column public.leads.unfallort_plz is 'Strukturierte Unfallort-PLZ (Google-Places). F6 Convert-Mapping.';
comment on column public.leads.unfallort_ort is 'Strukturierter Unfallort-Ort (Google-Places). F6 Convert-Mapping.';
comment on column public.leads.unfallort_place_id is 'Google-Places place_id des Unfallorts. F6 Convert-Mapping.';
comment on column public.claims.schadenort_place_id is 'Google-Places place_id des Schadensorts (aus leads.unfallort_place_id). F6 Convert-Mapping.';
