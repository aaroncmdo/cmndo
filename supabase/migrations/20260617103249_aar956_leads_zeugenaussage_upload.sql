-- AAR-956 16.06. (Aaron): Zeugenaussage-Upload im Flow (Polizei-&-Zeugen-Schritt).
-- Spiegelt die polizeibericht_*-Spalten — Foto/PDF der Zeugenaussage, kein OCR.
alter table public.leads
  add column if not exists zeugenaussage_url text,
  add column if not exists zeugenaussage_status text,
  add column if not exists zeugenaussage_hochgeladen_am timestamptz;
