# Universelles Kalender-Sync-Fundament (SP1) — Design

**Datum:** 2026-07-03
**Branch:** `kitta/universal-kalender-sync` (off staging)
**Kontext:** Externer Kalender-Sync (CalDAV + Google) ist heute **SV-only**. Nach dem /flow-CalDAV-Fix (#3486) will Aaron die **anderen Rollen** (Kundenbetreuer, Kanzlei, Dispatch/Werkstatt) **und weitere Provider** (Outlook/Microsoft …) anbinden — beide Sync-Richtungen (OUT: Termine → externer Kalender; IN: externe Belegung → Claimondo-Verfügbarkeit).

## Projekt-Dekomposition (SP1 = dieses Dokument)

Das Gesamtvorhaben ist ein Multi-Subsystem-Projekt. Dekomposition (Aaron abgenommen 2026-07-03):

| # | Sub-Projekt | Inhalt |
|---|---|---|
| **SP1** | **Fundament (dieses Doc)** | Assignee-generischer Resolver + universelle Verbindungs-Speicherung + Provider-Generalisierung (OUT) + Cache/Cron/Belegung-Generalisierung (IN). Macht SV **und** KB sofort funktionsfähig (beide in `gutachter_termine`). |
| SP2 | Kundenbetreuer end-to-end | KB-Connect-UI + Sync-Wiring an den kb-Beratungs-Lifecycle-Pfaden (Buchung/Confirm/Absage/Verlegung). |
| SP3 | Kanzlei | `kanzlei_admin_termine` Ref-Spalten + Sync-Wiring + Kanzlei-Connect-UI. |
| SP4 | Dispatch/Werkstatt | `admin_termine` + Werkstatt-Termine + Connect-UI. |
| SP5 | Outlook/Microsoft-Provider | MS-Graph-Adapter (OAuth + Event-CRUD) am generalisierten `KalenderProvider`-Interface. |

**SP1 liefert das Fundament + KB-OUT/IN funktionsfähig** (da KB-Termine in `gutachter_termine` liegen, das die Ref-Spalten schon hat). Connect-UI + per-Rollen-Feinschliff = SP2+.

## Ist-Zustand (verifiziert 2026-07-03)

- **Engine-Op** `syncTerminToExternalCalendar(terminId)` / `entferneTerminAusExternemKalender(terminId)` (`src/lib/termine/engine/kalender-sync.ts`) ist **schon assignee-generisch designt** — orchestriert `KalenderProvider[]` (googleProvider, caldavProvider), fail-soft je Provider.
- **Provider sind aber SV-gegatet:** `googleProvider`/`caldavProvider` prüfen `termin.assignee_typ !== 'sachverstaendiger' → return 'skip'` und lösen die Verbindung über `assignee_id` als **sachverstaendige.id** auf (`svProfileId` / `caldavConn(db, svId)`).
- **Google-OAuth ist bereits profil-gekeyed:** `getGoogleOAuthClientForUser(userId)` liest `profiles.google_refresh_token/google_access_token/google_token_expires_at` per `profiles.id`. → Jedes Profil kann schon Google verbinden.
- **CalDAV-Verbindung ist SV-only:** `sv_kalender_verbindungen(sv_id, provider, server_url, username, password_encrypted, calendar_url, last_error, last_error_at)`, gelesen per `sv_id`. **Einzige SV-spezifische Speicherung.**
- **Ref-Spalten am Termin** (idempotenter OUT-Sync): `gutachter_termine.google_event_id/google_calendar_id/caldav_object_url/caldav_event_uid/caldav_synced_at`. `gutachter_termine` enthält **SV- UND KB-Termine** (`assignee_typ` in `sachverstaendiger`,`kundenbetreuer`) → KB ist ref-spalten-seitig schon abgedeckt.
- **assignee→profile:** SV: `assignee_id` = `sachverstaendige.id` → `sachverstaendige.profile_id` (34/34). KB: `assignee_id` = **direkt die `profiles.id`** (15/15).
- **IN-Sync:** Cron `syncAllExternalCalendars` (`src/lib/kalender/sync-to-cache.ts`, via `/api/cron/sync-external-calendars`) importiert Google-FreeBusy + CalDAV-Events **aller SVs** → `sv_kalender_events_cache` (SV-keyed); der Belegt-Check/`v_belegung` liest den Cache für die Slot-Generierung.
- **Kontext:** `resolveTerminKontext(termin, db)` (`engine/kalender-kontext.ts`) baut summary/description/location aus Termin-bezug/claim.

## Architektur SP1 (5 Komponenten)

### ① Resolver `resolveAssigneeProfileId` (Kern, pure-nah)
Neuer Helper `src/lib/termine/engine/assignee-profile.ts`:
```
resolveAssigneeProfileId(db, assignee_typ, assignee_id): Promise<string | null>
  sachverstaendiger → sachverstaendige.profile_id (join)
  kundenbetreuer    → assignee_id (ist schon profiles.id)
  kanzlei           → <Kanzlei-User-Profil> (in SP3 verifizieren; SP1 liefert die Weiche + null-fallback)
  werkstatt         → <Werkstatt-User-Profil> (SP4)
  sonst             → null (skip)
```
Zentral, unit-getestet. Die Weiche ist erweiterbar; unbekannte Typen → `null` = provider-skip (kein Fehler).

### ② Datenmodell — Verbindungs-Speicherung (Approach A, Aaron abgenommen)
Neue **`kalender_verbindungen`** (profil-gekeyed, multi-provider-fähig):
```
id uuid pk default gen_random_uuid()
profile_id uuid not null references profiles(id) on delete cascade
provider text not null check (provider in ('caldav','microsoft', …))   -- Google bleibt auf profiles.*
server_url text, username text, password_encrypted text, calendar_url text   -- CalDAV
-- provider-spezifische Zusatzfelder additiv ergänzbar (Outlook: OAuth-Refs) — bevorzugt eigene Spalten, kein Config-Blob-Wildwuchs
last_error text, last_error_at timestamptz
erstellt_am timestamptz not null default now()
unique (profile_id, provider)
```
- **Google bleibt auf `profiles.google_*`** (funktioniert, nicht anfassen) — der `googleProvider` liest weiter per Profil.
- **Migration:** `kalender_verbindungen` anlegen; die (4) CalDAV-Rows aus `sv_kalender_verbindungen` migrieren: `profile_id = sachverstaendige.profile_id` via `sv_id`-Join. `sv_kalender_verbindungen` **bleibt vorerst** (Bestand + Rollback-Sicherheit); der Provider liest nach der Migration aus `kalender_verbindungen`. Retire von `sv_kalender_verbindungen` = eigener Cleanup-Schritt nach Verifikation (Regel 3: kein Drop vor Merge).
- **Cache:** `sv_kalender_events_cache` um `profile_id` erweitern (additiv), Backfill `profile_id` aus `sv_id`. (Rename zu `kalender_events_cache` = optionaler späterer Cleanup.)

### ③ OUT-Sync — Provider generalisieren
In `kalender-sync.ts`:
- `googleProvider.upsert/remove`: `assignee_typ==='sachverstaendiger'`-Gate ersetzen durch `const profileId = await resolveAssigneeProfileId(db, termin.assignee_typ, termin.assignee_id); if (!profileId) return 'skip'` → `getGoogleOAuthClientForUser(profileId)` (unverändert).
- `caldavProvider.upsert/remove`: analog; `caldavConn(db, svId)` → `caldavConn(db, profileId)` gegen **`kalender_verbindungen`** (per profile_id).
- `syncTerminToExternalCalendar`/`entferne…` selbst: der harte `if (termin.assignee_typ !== 'sachverstaendiger') return skip`-Vorfilter (Z.191) **raus** — die Provider self-gaten schon über `resolveAssigneeProfileId` (kein Doppel-Gate).
- Idempotenz/Refs bleiben (google_event_id/caldav_object_url am Termin).

### ④ IN-Sync — Cache/Cron/Belegung generalisieren
- `syncAllExternalCalendars`: statt „alle SVs" → **„alle Profile mit einer Verbindung"** (union aus `kalender_verbindungen.profile_id` + `profiles` mit `google_refresh_token`). Schreibt in den (profile-erweiterten) Cache.
- Belegt-Check / `v_belegung`: profil-gekeyed lesen, sodass die Slot-Generierung **jeder Rolle mit buchbaren Slots** (SV-Matching, kb-slots) die externe Belegung des jeweiligen Profils berücksichtigt. (SP1: Cache + Cron generalisieren + `v_belegung` profil-fähig; die Konsum-Stellen der einzelnen Rollen ziehen ihre SPs nach, soweit nötig.)

### ⑤ Kontext
`resolveTerminKontext` muss Nicht-SV-Termine (kb_beratung: bezug=Beratung/claim) sinnvoll betiteln (summary/description). SP1 prüft + härtet die Nicht-SV-Zweige (Fallback-Titel statt Crash/leer).

## Error-Handling
Bestehendes Muster beibehalten: fail-soft je Provider (try/catch → `results[provider]='error'` + `console.error`), non-critical Sub-Op. Unbekannter assignee_typ / kein Profil / keine Verbindung → `'skip'` (kein Fehler). CalDAV `auth_failed` → `kalender_verbindungen.last_error` setzen (wie bisher bei sv_kalender_verbindungen).

## Testing
- **Unit:** `resolveAssigneeProfileId` (SV-join, KB-direct, unknown→null). `caldavConn`-Generalisierung (Fake-DB). Provider-Orchestrierung mit Fake-Providern (assignee-generisch, kein I/O) — die bestehenden `__tests__/kalender-sync.test.ts` erweitern.
- **DB-Migration:** `execute_sql`-READ-Verifikation nach `apply_migration` (Regel 2): `kalender_verbindungen` existiert, CalDAV-Rows migriert (profile_id korrekt), Cache hat profile_id.
- **Prod-Smoke (nach Bau):** KB-Profil mit CalDAV-Verbindung → KB-Beratungs-Termin → OUT-Sync schreibt echten CalDAV-Event (`caldav_object_url` gesetzt); IN-Sync-Cron importiert die externe Belegung des KB-Profils; Doppelbuchungs-Schutz greift. Test-Account nötig, Cleanup zwingend.

## Scope-Grenzen (SP1)
- SP1 = **Fundament + Generalisierung** (Resolver, Storage, Provider-OUT, Cache/Cron/Belegung-IN, Kontext) + KB funktionsfähig (gutachter_termine). **Nicht** in SP1: per-Rollen-Connect-UI (SP2+), Ref-Spalten für `kanzlei_admin_termine`/`admin_termine` (SP3/4), Outlook-Provider (SP5).
- **Getrennt** vom laufenden SV-OUT-Sync-Lifecycle-Handoff (`verlege`/`sageAb`/`terminAblehnen`, [[handoff-kalender-out-sync-drift]]) — SP1 generalisiert die *Basis*, nicht die SV-Lifecycle-Lücken. Kohärent halten: beide nutzen `syncTerminToExternalCalendar`/`entferne…`.
- `sv_kalender_verbindungen`-Drop + Cache-Rename = separater Cleanup nach Verifikation (Regel 3).

## Migration (Regel 2)
Alle DDL über `apply_migration` (Plugin) → `list_migrations` → File==Version. Rein **additiv**: `create table kalender_verbindungen`, `alter table sv_kalender_events_cache add column profile_id`, Backfills. Keine Drops in SP1. SV-Bestand läuft unverändert weiter (Provider liest nach Migration aus der neuen Tabelle; alte Tabelle bleibt als Sicherheitsnetz).

## Koordination
`kalender-sync.ts`, `sync-to-cache.ts`, `sv_kalender_verbindungen`, `sv_kalender_events_cache`, `v_belegung` sind **geteilt**. Parallel-Sessions: SV-OUT-Sync-Handoff + evtl. `kitta/sv-verfuegbarkeit-editor` (Belegungs-Nähe). SP1 additiv + Marker mit File-Touch. Related: [[coordination-flow-caldav-fix]] [[handoff-kalender-out-sync-drift]] [[coordination-termine-kalender-audit]].
