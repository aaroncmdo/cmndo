-- Ops-Test 12.08.: Smoke-Residue aus fall_dokumente + tasks entfernen.
--
-- BEFUND: Der Claim CLM-2026-00835 trug 227 fall_dokumente-Zeilen -- allesamt
-- 200-Byte-Dummy-Dateien, hochgeladen von smoke-kunde@claimondo.de zwischen dem
-- 16.07. und 12.08. (227 verschiedene storage_path, 1 Dokumenttyp). Der AAR-325-
-- Trigger (fall_dokumente_autotask, AFTER INSERT) erzeugte pflichtgemaess je einen
-- 'dokument-pruefen'-Task -> 226 offene Tasks auf einem einzigen Claim.
--
-- Der Trigger ist NICHT die Ursache und wird nicht angefasst. Ursache ist fehlender
-- Cleanup in den E2E-Smokes (Upload-Residue; try/finally ueberlebt keinen Timeout,
-- Cleanup gehoert in afterEach -- siehe Memory broadcast-prod-playwright-smoke-drei-fallen).
--
-- WARUM AUFRAEUMEN: Die KB-/Dispatch-Task-Liste ist das Werkzeug, mit dem haengende
-- Faelle auffallen. Bei 226 Rausch-Tasks faellt nichts mehr auf -- parallel haengen
-- 14 echte Claims 7-27 Tage ohne Bewegung, die meisten MIT offenen Tasks.
--
-- FILTER ist bewusst eng (vor dem Lauf verifiziert): groesse_bytes = 200 UND
-- Uploader smoke-kunde@. Trifft exakt 227 Dokumente auf 1 Claim + 226 Tasks.
-- NICHT betroffen: 2 andere 200-Byte-Uploads fremder Uploader, 1 Smoke-Upload
-- abweichender Groesse.
--
-- ERGEBNIS (verifiziert): offene 'dokument-pruefen'-Tasks 282 -> 56 (auf 46 statt
-- 47 Claims); 0 verbleibende Dummies.
--
-- ROLLBACK: beide _backup_-Tabellen enthalten die vollstaendigen Zeilen; ein
-- INSERT ... SELECT stellt sie wieder her. Nach Verifikation koennen die
-- Backup-Tabellen gedroppt werden.
-- Freigabe Aaron 12.08.: "Ja, beides loeschen".

-- 1) Backup der Dokument-Zeilen (RLS an, keine Policies => nur service_role).
create table if not exists public._backup_smoke_residue_dok_20260812 as
select fd.*
from public.fall_dokumente fd
where fd.groesse_bytes = 200
  and fd.hochgeladen_von_user_id in (
    select p.id from public.profiles p where p.email ilike 'smoke-kunde@%'
  );

alter table public._backup_smoke_residue_dok_20260812 enable row level security;

-- 2) Backup der zugehoerigen offenen Tasks (nur auf den betroffenen Claims,
--    nur der vom Trigger erzeugte Typ).
create table if not exists public._backup_smoke_residue_tasks_20260812 as
select t.*
from public.tasks t
where t.typ = 'dokument-pruefen'
  and t.status <> 'erledigt'
  and t.claim_id in (select distinct b.fall_id from public._backup_smoke_residue_dok_20260812 b);

alter table public._backup_smoke_residue_tasks_20260812 enable row level security;

-- 3) Loeschen -- erst die Tasks, dann die Dokumente (der Trigger feuert nur bei INSERT,
--    ein DELETE loest also keine neuen Tasks aus).
delete from public.tasks t
where t.id in (select b.id from public._backup_smoke_residue_tasks_20260812 b);

delete from public.fall_dokumente fd
where fd.id in (select b.id from public._backup_smoke_residue_dok_20260812 b);
