-- AAR-884: Storage-Buckets Lockdown (Schritt D von RLS-Phase-1 #4)
--
-- Vorgeschichte:
--   - Audit 13.05.2026 P0.2: 4 Buckets public=true, anon kann auf unterschriften schreiben
--   - Plan storage-rls-rollout-plan.md Schritt A–C abgeschlossen (Helper + Caller-Migration + Embed-Strategie)
--   - Pre-Check storage-schritt-d-pre-check.md: nur 4 Files in Prod, keine Frontend-Direct-Reads
--
-- Strategie: Service-Role-Only
--   - public=false bei den 4 Buckets
--   - DROP aller Bucket-spezifischen Policies, die anon/authenticated Direkt-Zugriff erlauben
--   - RESTRICTIVE-Policies gegen anon + authenticated als Belt-and-Suspenders
--   - Lesen/Schreiben passiert ab jetzt ausschließlich via service-role (createAdminClient in Server-Actions)
--   - Frontend bekommt signed-URLs aus getStorageUrl() — Helper-Flag STORAGE_USE_SIGNED_URLS=true muss parallel gesetzt werden

begin;

-- 1) Bestehende Bucket-spezifische Policies droppen
--    (Liste live erhoben via pg_policies — Stand 13.05.2026 21:30)

-- fall-dokumente
drop policy if exists "Auth users can read fall-dokumente" on storage.objects;
drop policy if exists "Auth users can upload fall-dokumente" on storage.objects;
drop policy if exists "Flow anon can read fall-dokumente flow path" on storage.objects;
drop policy if exists "Flow anon can upload to fall-dokumente" on storage.objects;

-- gutachten
drop policy if exists "gutachten_insert" on storage.objects;
drop policy if exists "gutachten_select" on storage.objects;

-- schadensfotos
drop policy if exists "schadensfotos_insert" on storage.objects;
drop policy if exists "schadensfotos_select" on storage.objects;

-- unterschriften (inkl. der zwei doppelten Anon-Insert-Policies)
drop policy if exists "Anon can read own unterschriften" on storage.objects;
drop policy if exists "Anon can upload unterschriften" on storage.objects;
drop policy if exists "Anon upload unterschriften" on storage.objects;
drop policy if exists "Authenticated can read unterschriften" on storage.objects;
drop policy if exists "unterschriften_insert" on storage.objects;
drop policy if exists "unterschriften_select" on storage.objects;

-- 2) Public-Flag aus — Direkt-URLs sterben (war ohnehin noch nicht von Code-Pfaden konsumiert)
update storage.buckets
  set public = false
  where id in ('fall-dokumente','gutachten','schadensfotos','unterschriften');

-- 3) Belt-and-Suspenders: RESTRICTIVE-Policies gegen anon + authenticated
--    Werden AND-ed mit allen PERMISSIVE-Policies — falls jemals versehentlich eine
--    Cross-Bucket-PERMISSIVE-Policy entsteht, fängt das hier den Zugriff ab.

create policy "locked_buckets_block_anon"
  on storage.objects
  as restrictive
  for all
  to anon
  using (bucket_id not in ('fall-dokumente','gutachten','schadensfotos','unterschriften'))
  with check (bucket_id not in ('fall-dokumente','gutachten','schadensfotos','unterschriften'));

create policy "locked_buckets_block_authenticated"
  on storage.objects
  as restrictive
  for all
  to authenticated
  using (bucket_id not in ('fall-dokumente','gutachten','schadensfotos','unterschriften'))
  with check (bucket_id not in ('fall-dokumente','gutachten','schadensfotos','unterschriften'));

commit;
