-- Anspruch-Totalschaden: totalschaden-Breakdown persistieren, damit die SV-Fallakte
-- (getAnspruchVorschauFuerFall + AnspruchVorschauCard) beide Wege zeigt statt nur der
-- flachen Positionsliste. Additiv, nullable; nur Schaetzungen ab Deploy befuellen die
-- Spalte (forward-looking, alte Zeilen bleiben null = flache Ansicht wie bisher).
-- Applied via Supabase-Plugin apply_migration; tracked version 20260705160916 == Dateiname.
alter table public.anspruch_schaetzungen add column if not exists totalschaden jsonb;
