-- AAR-956 Teil-2: Roh-Inputs schuldfrage + eigene_versicherung am Claim persistieren.
-- Bisher wird am Konversionspunkt (convert-lead-to-claim.ts) nur der ABGELEITETE abrechnungsweg
-- auf den Claim geschrieben; die Roh-Eingaben (schuldfrage, eigene_versicherung vom Lead) gehen
-- verloren. Additiv + nullable -> bricht keinen bestehenden Reader.
alter table public.claims add column if not exists schuldfrage text;
alter table public.claims add column if not exists eigene_versicherung text;
comment on column public.claims.schuldfrage is 'AAR-956 T2: Roh-Input Schuldfrage vom Lead (z.B. gegner/eigenverantwortung), Capture bei Lead->Claim-Konversion. abrechnungsweg ist der daraus abgeleitete Wert.';
comment on column public.claims.eigene_versicherung is 'AAR-956 T2: Roh-Input ob ueber die eigene Versicherung reguliert wird (z.B. ja/nein), Capture bei Lead->Claim-Konversion.';
