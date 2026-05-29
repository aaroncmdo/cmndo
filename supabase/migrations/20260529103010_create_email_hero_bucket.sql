-- P1b: public Bucket für gebackene Email-Hero-Bilder (Cache-Key = make-modell-farbe).
-- Upload via service-role (admin client, bypasst RLS); öffentlicher Read via public URL.
-- Appliziert via Supabase-Plugin (recorded version 20260529103010).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('email-hero', 'email-hero', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;
