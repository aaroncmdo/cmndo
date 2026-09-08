# Supabase-Selfhost-Migration — Phase-0-Inventar (extrahiert 03.09.2026)

Aaron-Entscheidung 03.09.2026: **Supabase wird verlassen, Selfhost auf eigenem Server** (Kostengrund). Analyse + 7-Gate-Plan: `docs/2026-09-03-supabase-selfhost-kostenanalyse.md`. Dieses Dokument sichert das UNVERSIONIERTE prod-Inventar (Gate 3) — alles, was ein `pg_dump`-Restore bzw. Migrations-Replay NICHT mitbringt.

⚠ **Die SQL-Bloecke hier sind VORLAGEN, noch nicht appliziert.** Applizieren spaeter per `apply_migration` (Regel 2: erst applizieren, dann File nach getrackter Version benennen) auf einem eigenen Branch — NICHT auf `kitta/aar-956-*` (Branch-Kollision mit 2 anderen Sessions).

## 1 · pg_cron-Jobs (26, alle active) — Stand prod 03.09.2026

Fast alle Bodies sind `SELECT public.cron_*()` — die Funktionslogik IST in den Migrationen versioniert, nur die Schedule-Registrierung fehlt. Bereits versioniert: `connection-snapshot-if-high` (20260529212846), `smoke-werkstatt-leichen-sperren` (20260901093854).

| jobname | schedule | command |
|---|---|---|
| airdrop_token_cleanup | `0 3 * * *` | `SELECT public.cron_airdrop_token_cleanup()` |
| airdrop_token_expiry | `0 * * * *` | `SELECT public.cron_airdrop_token_expiry()` |
| cmm25-expire-geblockte-termine | `*/5 * * * *` | `SELECT public.expire_geblockte_termine_ohne_sa();` |
| cmm32_durchgefuehrt_fallback | `*/15 * * * *` | `SELECT public.cron_mark_durchgefuehrt_fallback();` |
| cmm36-sv-live-location-cleanup | `0 0 * * *` | `DELETE FROM sv_live_location WHERE updated_at < now() - interval '24 hours'` |
| comment-retention | `17 3 * * *` | `delete from public.article_comments where status='rejected' and moderated_at < now() - interval '30 days'` |
| connection-snapshot-if-high | `* * * * *` | `select monitoring.snapshot_connections_if_high();` |
| dsgvo_hard_delete | `0 4 * * *` | `SELECT public.cron_dsgvo_hard_delete()` |
| exif_worker_trigger | `*/5 * * * *` | `SELECT public.cron_trigger_exif_worker()` |
| gutachten_ocr_recovery | `*/5 * * * *` | `SELECT public.cron_gutachten_ocr_recovery()` |
| kanzlei_paket_pending_check | `30 9 * * *` | `SELECT public.cron_kanzlei_paket_pending_check()` |
| konsistenz_check | `0 8 * * *` | `SELECT public.cron_konsistenz_check()` |
| mietwagen_lange_anmietung | `20 9 * * *` | `SELECT public.cron_mietwagen_lange_anmietung()` |
| mietwagen_sla_tracking | `15 9 * * *` | `SELECT public.cron_mietwagen_sla_tracking()` |
| netzwerk_abo_dunning | `0 8 * * *` | `SELECT public.cron_trigger_netzwerk_abo_dunning()` |
| notification_worker_tick | `*/5 * * * *` | `SELECT public.cron_trigger_notification_worker()` |
| pflicht_foto_validation | `0 * * * *` | `SELECT public.cron_pflicht_foto_validation()` |
| rate_limit_reset | `0 0 * * *` | `SELECT public.cron_rate_limit_reset()` |
| release_provisionen | `0 2 * * *` | `SELECT public.cron_trigger_release_provisionen()` |
| reparatur_freigabe_eskalation | `0 9 * * *` | `SELECT public.cron_reparatur_freigabe_eskalation()` |
| salesforce_sync_trigger | `*/15 * * * *` | `SELECT public.cron_trigger_salesforce_sync()` |
| smoke-werkstatt-leichen-sperren | `0 * * * *` | (Inline-UPDATE, versioniert in 20260901093854) |
| verjaehrungs_warner | `30 9 * * *` | `SELECT public.cron_verjaehrungs_warner()` |
| vs_frist_reminder | `0 9 * * *` | `SELECT public.cron_vs_frist_reminder()` |
| vs_frist_tick | `0 */6 * * *` | `SELECT public.cron_vs_frist_tick()` |
| wal-archiver-alert | `*/5 * * * *` | `select monitoring.snapshot_wal_archiver_if_failing();` |

**Versionierungs-Vorlage (idempotent + Preview-geguardet** — pg_cron 1.6: `cron.schedule` mit gleichem jobname aktualisiert statt dupliziert; Guard-Pattern wegen des bekannten Preview-Replay-Breakers):

```sql
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron nicht installiert (Preview/Local) — Jobs werden uebersprungen';
    return;
  end if;
  perform cron.schedule('airdrop_token_cleanup', '0 3 * * *', 'SELECT public.cron_airdrop_token_cleanup()');
  perform cron.schedule('airdrop_token_expiry', '0 * * * *', 'SELECT public.cron_airdrop_token_expiry()');
  perform cron.schedule('cmm25-expire-geblockte-termine', '*/5 * * * *', 'SELECT public.expire_geblockte_termine_ohne_sa();');
  perform cron.schedule('cmm32_durchgefuehrt_fallback', '*/15 * * * *', 'SELECT public.cron_mark_durchgefuehrt_fallback();');
  perform cron.schedule('cmm36-sv-live-location-cleanup', '0 0 * * *', $j$DELETE FROM sv_live_location WHERE updated_at < now() - interval '24 hours'$j$);
  perform cron.schedule('comment-retention', '17 3 * * *', $j$delete from public.article_comments where status = 'rejected' and moderated_at < now() - interval '30 days'$j$);
  perform cron.schedule('dsgvo_hard_delete', '0 4 * * *', 'SELECT public.cron_dsgvo_hard_delete()');
  perform cron.schedule('exif_worker_trigger', '*/5 * * * *', 'SELECT public.cron_trigger_exif_worker()');
  perform cron.schedule('gutachten_ocr_recovery', '*/5 * * * *', 'SELECT public.cron_gutachten_ocr_recovery()');
  perform cron.schedule('kanzlei_paket_pending_check', '30 9 * * *', 'SELECT public.cron_kanzlei_paket_pending_check()');
  perform cron.schedule('konsistenz_check', '0 8 * * *', 'SELECT public.cron_konsistenz_check()');
  perform cron.schedule('mietwagen_lange_anmietung', '20 9 * * *', 'SELECT public.cron_mietwagen_lange_anmietung()');
  perform cron.schedule('mietwagen_sla_tracking', '15 9 * * *', 'SELECT public.cron_mietwagen_sla_tracking()');
  perform cron.schedule('netzwerk_abo_dunning', '0 8 * * *', 'SELECT public.cron_trigger_netzwerk_abo_dunning()');
  perform cron.schedule('notification_worker_tick', '*/5 * * * *', 'SELECT public.cron_trigger_notification_worker()');
  perform cron.schedule('pflicht_foto_validation', '0 * * * *', 'SELECT public.cron_pflicht_foto_validation()');
  perform cron.schedule('rate_limit_reset', '0 0 * * *', 'SELECT public.cron_rate_limit_reset()');
  perform cron.schedule('release_provisionen', '0 2 * * *', 'SELECT public.cron_trigger_release_provisionen()');
  perform cron.schedule('reparatur_freigabe_eskalation', '0 9 * * *', 'SELECT public.cron_reparatur_freigabe_eskalation()');
  perform cron.schedule('salesforce_sync_trigger', '*/15 * * * *', 'SELECT public.cron_trigger_salesforce_sync()');
  perform cron.schedule('verjaehrungs_warner', '30 9 * * *', 'SELECT public.cron_verjaehrungs_warner()');
  perform cron.schedule('vs_frist_reminder', '0 9 * * *', 'SELECT public.cron_vs_frist_reminder()');
  perform cron.schedule('vs_frist_tick', '0 */6 * * *', 'SELECT public.cron_vs_frist_tick()');
end $$;
```
(connection-snapshot + smoke-werkstatt bewusst ausgelassen — bereits versioniert.)

## 2 · Realtime-Publication `supabase_realtime` (22 Tabellen)

admin_termine, auftraege, benachrichtigungen, claim_recency, claims, fall_dokumente, flow_links, gutachter_termine, kanzlei_faelle, kunde_live_position, lead_historie, leads, mitteilungen, nachrichten, pflichtdokumente, sachverstaendige, sv_kalender_events_cache, sv_live_position, sv_tages_session, tasks, termine, timeline

**Vorlage (idempotent):**
```sql
do $$
declare t text;
begin
  foreach t in array array['admin_termine','auftraege','benachrichtigungen','claim_recency','claims',
    'fall_dokumente','flow_links','gutachter_termine','kanzlei_faelle','kunde_live_position',
    'lead_historie','leads','mitteilungen','nachrichten','pflichtdokumente','sachverstaendige',
    'sv_kalender_events_cache','sv_live_position','sv_tages_session','tasks','termine','timeline']
  loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table only public.%I', t);
    end if;
  end loop;
end $$;
```

⚠ Die 4 toten Code-Subscriptions (siehe Kostenanalyse-Anhang) bleiben ein separater Fix: `sv_live_location` (Code) vs. `sv_live_position` (Publication) ist vermutlich ein Namens-Mismatch; `gutachter_finder_anfragen`, `gutachter_mitteilungen`, `airdrop_invitations` fehlen ganz — je Fall entscheiden: Tabelle in Publication aufnehmen ODER Subscription entfernen.

## 3 · Installierte Extensions (10) — exakt mit Schema

| Extension | Version | Schema | Selfhost-Hinweis |
|---|---|---|---|
| btree_gist | 1.7 | extensions | versioniert (einzige mit CREATE EXTENSION in Migrationen) |
| pg_cron | 1.6.4 | pg_catalog | im Supabase-Docker-Image enthalten |
| pg_net | 0.20.0 | extensions | Supabase-Extension, im Docker-Image |
| pg_stat_statements | 1.11 | extensions | contrib |
| pg_trgm | 1.6 | **public** | contrib (Schema-Abweichung beachten!) |
| pgcrypto | 1.3 | extensions | contrib |
| plpgsql | 1.0 | pg_catalog | default |
| supabase_vault | 0.3.1 | vault | Supabase-Extension — NUR im Supabase-Image, nicht Vanilla-Postgres |
| uuid-ossp | 1.1 | extensions | contrib |
| wrappers | 0.5.7 | extensions | Supabase-Extension — im Docker-Image |

**Vorlage:** `create extension if not exists "<name>" with schema <schema>;` je Zeile (pg_trgm mit `schema public`!). → Konsequenz fuer Gate 1: **Selfhost MUSS das Supabase-Postgres-Image nutzen** (vault/wrappers/pg_net existieren in Vanilla-Postgres nicht).

## 4 · Vault-Inhalt (1 Secret)

`cron_secret` — „CRON_SECRET Bearer fuer /api/cron/* (assertCronAuth). Genutzt vom pg_cron-Job release_provisionen. Seeded 2026-07-19."
→ Beim Umzug: Secret-WERT aus dem alten Vault auslesen und im neuen Stack neu seeden (oder CRON_SECRET rotieren und beidseitig setzen). Wert steht NICHT in diesem Dokument.

## 5 · REPLICA IDENTITY FULL (8 Tabellen, aus Code-Scan)

auftraege, claims, faelle, gutachter_termine, kanzlei_faelle, fall_dokumente, sv_kalender_events_cache, leads — Versionierungsstatus in Migrationen noch pruefen; fuer Realtime-Diffs noetig, erhoeht WAL-Volumen.

## 6 · Offene Phase-0-Punkte

- [ ] Versionierungs-Migrationen (§1–§3) via `apply_migration` tracken + Files committen (eigener Branch!)
- [ ] REPLICA-IDENTITY-Versionierung pruefen (§5)
- [ ] Die 2 fehlenden Buckets (`kanzlei-abrechnungen`, `onboarding-rechnungen`) anlegen oder Code fixen
- [ ] 4 tote Realtime-Subscriptions entscheiden (§2)
- [ ] Offsite-Backup (pg_dump taeglich) einrichten — unabhaengig vom Cutover sofort sinnvoll
