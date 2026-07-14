-- F1 (Convert-Mapping, Aaron-Entscheid 14.07.): claims.schadenart ist der Abrechnungs-/
-- Regulierungs-Typ (haftpflicht/vollkasko/teilkasko/eigenverschulden/unbekannt). Die
-- physische Schadens-KIND (Karosserie/Lack/Hagel/Glas/Marder/... = SCHADENARTEN aus dem
-- Fall-anlegen-Form) hatte bisher kein Ziel -> convert stopfte lead.schadens_art
-- faelschlich in schadenart (nie im VALID_SCHADENARTEN-Enum -> immer 'unbekannt').
-- Neue Spalte fuer die KIND. text (flexibel, spiegelt leads.schadens_art text; Vokabular
-- SCHADENARTEN lebt als TS-Konstante und waechst -> kein enum/CHECK-Friction).
-- Additiv, DB-ahead-of-code: Convert-Wiring + Reader folgen (Slice B, gated auf convert-Datei-Settle).
alter table public.claims add column if not exists schadens_kind text;
comment on column public.claims.schadens_kind is 'Physische Schadens-KIND (Karosserie/Lack/Hagel/Glas/...); NICHT schadenart (=Abrechnungs-Typ). F1 Convert-Mapping, aus leads.schadens_art.';
